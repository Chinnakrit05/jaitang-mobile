# Local-first / Opt-in Cloud Sync — Design & Plan

Status: **Draft for review** · Author: design session · Date: 2026-05-24

## 1. Goal

Make Jaitang a **local-first** app: a new user's ledger (สมุด) lives entirely
on the device and **nothing is uploaded to the cloud by default**. The cloud
becomes involved only when the user opts in:

1. **Manual "Sync / Enable cloud"** — the user explicitly turns on cloud sync
   for a ledger so it can be backed up and used across their *own* devices.
   If they never press it, the ledger stays 100% local.
2. **Sharing** — inviting another person to a ledger implies cloud, so enabling
   sync happens automatically as part of sharing.

Decisions locked in this session:

- Default = local-only, **no automatic** push/pull.
- Sync is **opt-in per ledger** via an explicit user action (multi-device for
  the same user is supported, but only after the user enables it).
- Sharing a ledger forces that ledger into cloud/sync mode.
- **Login is required** (decided). The user always has a Supabase account, so an
  identity is ready the moment they enable sync or share — `auth.uid()` stays a
  valid `user_id` for every locally-created row.
- **Export / Import is in scope** (decided). Because a `local` ledger has no
  cloud backup, on-device file export/import is the safety net and ships as a
  first-class feature (see §5, Phase 1.5).

## 2. Current architecture (what we have today)

| Concern | Today |
| --- | --- |
| Local store | `expo-sqlite` mirror, schema v8 (`lib/db/schema.ts`) |
| Cloud | Supabase (Postgres) shared with the Next.js web app |
| Auth | Supabase auth required; `auth.uid()` used as `user_id` everywhere |
| Sync loop | `providers/SyncProvider.tsx`: on sign-in + every 30 s + on reconnect. Pulls ledgers → derives ledger ids from the local mirror → pulls each entity sequentially → `syncTransactions` (push-then-pull) |

**Crucially, the entities fall into two very different camps:**

### a) `transactions` — already offline-first ✅
- Rows are created **locally with a client-generated `id`** and
  `_sync_state='pending_create'`.
- Push = `upsert(payload, { onConflict: 'id' })` — server accepts the client id.
- Pull = delta by `updated_at`; soft-delete via `deleted_at` tombstone.
- **Works fully offline today.** This is the model we want everywhere.

### b) Everything else — server-authoritative ❌ (for writes)
`ledgers`, `accounts`, `categories`, `recurring`, `transfers`, `goals`,
`loans`, `budgets`, `trips`:
- Create/update/delete go through **SECURITY DEFINER RPCs** (`create_ledger`,
  `create_goal`, …). The **server generates the id** (`RETURNING id`), then the
  client re-pulls.
- The local table is a **read cache** (replace-all or pull-based mirror).
- **Creating any of these requires a network round-trip today** — they cannot be
  created offline.
- `lib/queries/ledgers.ts` even has a `TODO(Phase E)` to move ledger creation to
  a `pending_create` push path — i.e. the team already planned this direction.

### Sharing
- `create_invite` / `accept_invite` RPCs (`lib/queries/invites.ts`); membership
  is rows in `ledger_members`.

**Implication:** the local-first vision is *partly built* (transactions), but
to make a ledger truly usable offline we must convert camp (b) to the same
offline-first pattern as transactions.

## 3. Target model

### Per-ledger sync mode
Introduce a per-ledger mode, stored locally (and mirrored to the cloud once
promoted):

- `local` — default. No push, no pull. Lives only in SQLite.
- `synced` — cloud-backed. Normal push/pull. Required for sharing.

Suggested storage: a `sync_mode TEXT NOT NULL DEFAULT 'local'` column on the
local `ledgers` table (plus `promoted_at` timestamp). The cloud `ledgers` row
only exists once a ledger is `synced`.

### Sync gating
`SyncProvider` must operate **only on `synced` ledgers**:
- Derive `ledgerIds` = local ledgers where `sync_mode='synced'`.
- All `pull*` / `push*` calls receive only those ids.
- **Replace-all pulls must never run for `local` ledgers** (they would delete
  local-only rows that don't exist on the server).

### The "Enable cloud / Sync now" action (promote)
When the user enables sync for a `local` ledger (or shares it):
1. Ensure the cloud `ledgers` row + owner `ledger_members` row exist (use the
   client `id` so references stay stable).
2. **Bulk-upload every child entity** for that ledger, in dependency order:
   `categories` → `accounts` → `trips` → `recurring` → `budgets` →
   `transactions` → `transfers` → `goals` → `goal_contributions` → `loans` →
   `loan_repayments`. Each uses upsert-by-id.
3. Flip `sync_mode='local' → 'synced'`, set `promoted_at`, clear `_sync_state`
   to `clean` on success.
4. From then on the normal sync loop keeps it in sync.

This is only clean if **every entity already has a client-generated UUID** —
hence §4.

## 4. Required engineering changes

### 4.1 Client-generated UUIDs everywhere (prerequisite)
- Generate ids on-device for *all* entities at create time
  (`expo-crypto` `randomUUID()` — `expo-crypto` is already a dependency).
- Today only `transactions` does this; convert the rest.

### 4.2 Convert camp (b) entities to offline-first writes
For each of `ledgers, accounts, categories, recurring, transfers, goals,
goal_contributions, loans, loan_repayments, budgets, trips`:
- **Create/update/delete locally** → write the row with `_sync_state` =
  `pending_create | pending_update | pending_delete` (instead of calling the RPC
  inline).
- Add a **push path** (mirror `pushTransactions`) that drains pending rows via
  upsert-by-id.
- Switch pulls to **delta-by-`updated_at` + `deleted_at` tombstones** where
  possible (replace-all is unsafe once local-only rows exist). Tables without
  `deleted_at` (goals/loans/trips/transfers/contributions) need a soft-delete
  column added, or a careful per-ledger replace that's gated to `synced` only.

### 4.3 Server: accept client ids (upsert RPCs)
- The write RPCs currently `INSERT ... RETURNING id`. Add upsert-by-id support
  (accept `p_id`) **or** rely on direct table `upsert` with RLS via the existing
  `list_*` SECURITY DEFINER pattern. Either way the server must accept a
  client-provided primary key and enforce membership.
- A dedicated **`promote_ledger` / bulk-upload RPC** (transactional) is the
  safest way to do the one-shot upload in §3 without partial-state risk.

### 4.4 SyncProvider changes
- Filter to `synced` ledgers (4.x above).
- Add a manual `syncNow()` entry already exists; add a per-ledger
  `enableCloud(ledgerId)` that runs the promote flow then a normal sync.

### 4.5 UX
- Per-ledger toggle / button: "เก็บเฉพาะในเครื่อง" ↔ "เปิด sync ขึ้น cloud".
- Sync status per ledger (local-only / synced / syncing / error / last synced).
- When the user taps **Share**, if the ledger is `local`, prompt: "ต้องเปิด
  sync ขึ้น cloud ก่อนแชร์ — ดำเนินการต่อ?" then run promote.
- A manual "Sync now" affordance for `synced` ledgers.

## 5. Phasing

**Phase 1 — Gating + flag (small, high value).**
Add `sync_mode` to local ledgers; gate `SyncProvider` so `local` ledgers are
never pushed/pulled. Transactions already work offline, so a `local` ledger is
immediately private + offline *for transactions*. (Other entities still can't be
created offline yet — call this out as a known limitation of Phase 1.)

**Phase 1.5 — Export / Import (backup safety net).**
Ship on-device backup early, since `local` ledgers have no cloud copy. Export a
ledger (or all data) to a JSON file via the OS share sheet
(`expo-file-system` + `expo-sharing`); import restores it. Versioned schema in
the file so future migrations can upgrade it. Lands right after Phase 1 so
local-only users are never one wiped phone away from total loss.

**Phase 2 — Offline-first entities.**
Convert camp (b) one entity at a time to client-UUID + `pending_*` + push path,
with upsert RPCs. Order by user value: accounts → recurring → categories →
budgets → transfers → trips → goals → loans. Bump SQLite schema per change.

**Phase 3 — Promote / bulk upload.**
Implement `promote_ledger` (transactional bulk upload) + the enable-cloud and
share-triggers-cloud flows.

**Phase 4 — Backup, UX polish, safety.**
Local export/import, sync-status UI, warnings, encryption-at-rest evaluation.

## 6. Decisions

1. **Login model — RESOLVED: login required.** The user always has a Supabase
   account; `auth.uid()` stays a valid `user_id` on every locally-created row,
   so promote/share need no identity migration. (Anonymous local use was
   considered and rejected as too invasive.)
2. **Backup of local-only data — RESOLVED: ship export/import.** Local-only =
   no cloud backup, so on-device file export/import is a first-class feature
   (Phase 1.5). We still surface a clear in-app warning that a local-only ledger
   is not backed up to the cloud.

Still open:

3. **Conflict policy** once a ledger is multi-device: keep last-write-wins by
   server `updated_at` (matches transactions today)?
4. **Encryption at rest.** `expo-sqlite` is not encrypted by default. For
   privacy-sensitive local-only data, consider SQLCipher / OS-level protection.
5. **Web app visibility.** `local` ledgers won't appear in the Next.js web app
   until promoted — confirm that's the intended behavior.
6. **`user_id` on promote.** Local rows created while "anonymous" (if we ever go
   that route) need a real `user_id` stamped at promote-time.

## 7. Risks
- Partial upload failure during promote → must be transactional / resumable.
- Replace-all pulls wiping local-only data if gating is wrong → gate carefully
  and add tests.
- Schema churn: several SQLite version bumps; each needs a migration.
- Divergence from the web app's data model (shared backend) during the entity
  conversions.

## 8. Recommended next step
Proceed with **Phase 1** (sync_mode flag + gating) as a self-contained,
low-risk slice that immediately delivers private/offline ledgers for
transactions, while we finalize the open decisions in §6 before the larger
Phase 2 conversions.
