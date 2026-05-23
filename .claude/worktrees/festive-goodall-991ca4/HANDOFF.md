# Jaitang — Handoff Document

> Snapshot of where the **Jaitang** product stands across the **web** (`jaitang/`) and **mobile** (`jaitang-mobile/`) codebases. Written so another developer (or another machine) can continue work without context loss.
>
> Generated 2026-05-17. If you find something stale, trust the code over this doc and update the doc.

---

## 1. What Jaitang is

Personal + shared **expense tracker** in Thai (with EN/JA/ZH locales).

- **Web app**: Next.js 16 + Supabase, deployed to `jaitang.vercel.app`
- **Mobile app**: Expo (React Native) + same Supabase backend, offline-first via local SQLite
- **Repo (web)**: https://github.com/Chinnakrit05/jaitang
- **Repo (mobile)**: https://github.com/Chinnakrit05/jaitang-mobile
- **Git identity** for commits: `git -c user.name='Chinnakrit' -c user.email='chinnakrit.mek@gmail.com' commit ...` (do **not** touch global config)

---

## 2. Web app (`~/Desktop/jaitang/`) — fully shipped

### 2.1 Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.4 |
| React | React | 19.2.4 |
| Styling | Tailwind CSS v4 + next-themes | — |
| Auth | Auth.js (NextAuth) + Google OAuth | 5.0.0-beta.31 |
| DB | Supabase Postgres (`@supabase/ssr`) | 0.10.2 |
| Forms | React Hook Form + Zod | 7.74 / 4.3 |
| Charts | Recharts | 3.8 |
| AI | Anthropic SDK (Claude Haiku) | 0.91 |
| i18n | next-intl | 4.11 |
| DnD | @dnd-kit/core/sortable/modifiers | 6.3 / 10 / 9 |
| Push | web-push | 3.6 |
| Files | JSZip | 3.10 |
| Tests | Vitest | 2.1 |

### 2.2 Routes (Next App dir)

```
/                                       landing
/login                                  Google OAuth
/invite/[code]                          accept ledger invite

# (app) group — auth required
/(app)/dashboard                        summary cards + charts + range filter
/(app)/quick                            one-tap quick add
/(app)/transactions                     list + filters
/(app)/transactions/new                 create
/(app)/transactions/[id]/edit           edit
/(app)/transactions/export              CSV export
/(app)/calendar                         month heatmap (Bangkok TZ)
/(app)/insights                         month-over-month + AI summary
/(app)/insights/year/[year]             year report (PDF export)
/(app)/budgets                          monthly budgets per category
/(app)/recurring                        recurring rules (daily/weekly/monthly/yearly)
/(app)/balances                         bill-split balances
/(app)/accounts                         wallets / accounts
/(app)/accounts/[id]                    account detail + balance
/(app)/categories                       categories + subcategories (2 levels)
/(app)/trips                            trips (multi-currency tagging)
/(app)/trips/[id]                       trip detail
/(app)/loans                            loans (lent/borrowed)
/(app)/loans/[id]                       loan detail + repayments
/(app)/goals                            savings goals
/(app)/goals/[id]                       goal detail + contributions
/(app)/ledgers                          ledger switcher + shared list
/(app)/ledgers/[id]/members             shared ledger members + roles
/(app)/transfers/new                    cross-account transfer
/(app)/chat                             AI assistant (Claude Haiku)
/(app)/import                           CSV / JSON / Apple Numbers import
/(app)/settings                         theme, language, push, danger zone

# Public/utility
/icon-styles-preview                    side-by-side icon gallery
/api/auth/[...nextauth]                 Auth.js callback
/api/backup                             JSON backup/restore
```

### 2.3 Database schema (Supabase Postgres)

All mobile-cached tables (`transactions`, `categories`, `accounts`, `ledgers`) carry `updated_at` + `deleted_at` (nullable) + a `set_updated_at` trigger + a partial index `WHERE deleted_at IS NULL`. This is the **sync metadata contract** the mobile app depends on.

| Table | Notable columns | Notes |
|---|---|---|
| `users` | id, email, name, image | synced from Auth.js |
| `ledgers` | name, icon, color, currency, owner_id, is_personal, updated_at, deleted_at | unique personal per owner |
| `ledger_members` | ledger_id, user_id, role (owner/editor/viewer), joined_at | N:M |
| `categories` | ledger_id, name, icon, color, kind, parent_id, sort_order, updated_at, deleted_at | subcategories 2 levels max |
| `transactions` | ledger_id, user_id, category_id, trip_id, account_id, kind, amount, payment_method (cash/transfer), note, fx_currency, fx_amount, fx_rate, occurred_at, updated_at, deleted_at | home currency lives in `amount` |
| `accounts` | ledger_id, name, type (cash/bank/credit_card/e_wallet), icon, color, initial_balance, currency, archived, updated_at, deleted_at | balance computed dynamically |
| `trips` | ledger_id, name, icon, color, currency, starts_at, ends_at, archived | optional trip-scoped currency |
| `transaction_splits` | transaction_id, user_id, amount, settled, settled_at | Splitwise-style |
| `transfers` | ledger_id, user_id, from_account_id, to_account_id, from_amount, from_currency, to_amount, to_currency, fx_rate, note, occurred_at | cross-currency inter-account |
| `recurring_transactions` | ledger_id, user_id, category_id, account_id, trip_id, kind, amount (nullable), period, day_of_month, day_of_week, next_run_at, last_run_at, active, fx_currency | variable-cost mode: `amount IS NULL` |
| `budgets` | ledger_id, category_id, amount, period (month) | unique per (ledger, category, period) |
| `goals` | ledger_id, name, icon, color, target_amount, deadline, archived | savings targets |
| `goal_contributions` | goal_id, user_id, amount, note, occurred_at | separate from transactions |
| `loans` | ledger_id, user_id, kind (lent/borrowed), counterparty, principal, currency, started_at, due_date, status (open/settled), settled_at, note | external debt tracking |
| `loan_repayments` | loan_id, amount, occurred_at, note | partial repayments |
| `invites` | ledger_id, code, role, max_uses, used_count, expires_at, created_by | URL invite + QR |
| `push_subscriptions` | user_id, endpoint, p256dh, auth, user_agent | Web Push API |

Helpers: `set_updated_at()` trigger, `is_ledger_member()` / `ledger_role_of()` SQL functions, RLS enforcing ledger membership on every read/write.

### 2.4 Server actions (per feature, `use server`)

`transactions/actions.ts` `transactions/fx-actions.ts` `recurring/actions.ts` `categories/actions.ts` `accounts/actions.ts` `trips/actions.ts` `budgets/actions.ts` `loans/actions.ts` `goals/actions.ts` `ledgers/actions.ts` `balances/actions.ts` `chat/actions.ts` `settings/actions.ts` `settings/backup-actions.ts` `import/actions.ts` `quick/actions.ts`

HTTP endpoints: `POST /api/auth/[...nextauth]`, `GET/POST /api/backup`.

### 2.5 Features (user-visible)

**Core**
- Personal + shared ledgers (3 roles: owner/editor/viewer)
- Income/expense transactions with categories + **subcategories** (2 levels, parent-only budgets)
- Multi-currency with live FX snapshot (~32 currencies, Frankfurter.dev / exchangerate.host)
- Payment method tag (cash/transfer)
- Trip-based organization (auto-tag banner when active)

**Analytics**
- Dashboard: summary + pie/bar charts + 9 range presets
- Calendar heatmap (Bangkok TZ-aware)
- Month-over-month insights with **AI summary** (Claude Haiku in active locale)
- Annual year-report with PDF export

**Planning**
- Monthly budgets (parent category, sub spend rolls up)
- Recurring rules: daily / weekly / monthly / **yearly**, plus variable-cost mode (amount nullable, "Bills to file" panel)
- Savings goals + contribution log
- Loans lent/borrowed + repayment log

**Sharing**
- Personal ledgers can be shared too (gate removed; flag retained for analytics)
- Bill splits with settlement tracking
- Ledger invite links (QR + expiry)
- Web Push notifications

**UX**
- **5 icon sprite styles** — Sticker Pop / Doodle / Watercolor / Geometric / Pixel Art (switchable in Settings, localStorage key `jt-icon-style`, default `sticker`)
- **4 languages** — th / en / ja / zh
- Light/dark + 6 accent colors + 4 seasonal palettes
- PWA shell + service worker
- Drag-and-drop dashboard widget reorder (per-user, localStorage)
- AI receipt scanner (Claude Haiku OCR for invoice photos + bank slips)
- "Fast type" quick-add parser ("30 bts" / "ค่ากาแฟ 65" → auto-categorize)

### 2.6 Icon system (referenced by mobile)

- Sprites at `app/public/icons-{sticker,doodle,watercolor,geometric,pixel}.svg` (~600/300/340/330/410 KB)
- Build script: `app/scripts/build-icon-sprite.mjs` — concatenates per-section files from `~/Documents/jaitang-icons-final/{style}/`, namespaces gradient ids, drops alias suffixes
- Component: `app/src/components/icons/JtIcon.tsx` — `<JtIcon name="home" size={22} />`, default 22 px
- Icon count: ~137 distinct names (sticker has 175; others 136 currently)
- Provider: `IconStyleContext` reads active style from localStorage
- Helper: `EmojiOrIcon` — JtIcon if `value` matches a sprite name, else inline emoji text
- Fallback: `iconNameToEmoji()` Unicode mapping for `<option>` (host can't render SVG)
- Lucide remains in 2 files only: `dashboard-widget-shell.tsx` (GripVertical) and `theme-controls.tsx` (Monitor) — no JtIcon equivalent yet

### 2.7 Recent commit batch (web)

```
#14  Soft delete for categories / accounts / ledgers
#13  Transactions: soft delete (deleted_at)
#11  Subcategories Phase 2: parent budget rollup + sub grouping in pickers
#10  Categories: subcategory support (parent → child, 2 levels)
#9   Allow personal ledgers to be shared
#8   Recurring rules: variable-cost mode (amount nullable)
#7   Recurring rules: yearly frequency
#6   Phase 5: icon style switcher (5 styles)
#5   Migrate ledger picker to JtIcon
#4   Bump JtIcon sizes for mobile legibility
#3   Emoji pickers + display sites → JtIcon (Phase 4)
#1   JtIcon foundation + sprite + migrate Lucide
```

### 2.8 DB migrations applied to prod

```sql
-- PR #7: yearly frequency
alter type recur_period add value if not exists 'yearly';

-- PR #8: variable-cost recurring
alter table public.recurring_transactions alter column amount drop not null;
alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_amount_check;
alter table public.recurring_transactions
  add constraint recurring_transactions_amount_check
  check (amount is null or amount > 0);

-- PR #10: subcategories
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete set null;
create index if not exists idx_categories_parent
  on public.categories(parent_id) where parent_id is not null;

-- PR #13 / #14: soft delete + sync metadata for the mobile-cached tables.
-- Per-table block (transactions, categories, accounts, ledgers):
--   updated_at timestamptz not null default now()
--   deleted_at timestamptz
--   trigger set_updated_at before update for each row
--   partial index WHERE deleted_at IS NULL
```

### 2.9 Web workflow

1. Code + commit (use the explicit `-c user.name/email` invocation — do **not** touch global config).
2. `git push -u origin <branch>` then `gh pr create --base main --head <branch> ...`.
3. If DB migration: flag in PR body, **wait for user** to run the SQL in Supabase SQL editor.
4. `gh pr merge <num> --rebase --delete-branch`.
5. Vercel auto-deploys `main` in ~1–2 min.

---

## 3. Mobile app (`~/Desktop/jaitang-mobile/`) — in progress

### 3.1 Decisions locked in

| | |
|---|---|
| **Platforms** | iOS + Android (no desktop) |
| **Stack** | React Native via Expo (managed), TypeScript, NativeWind, expo-router, Supabase JS, TanStack Query, react-i18next, react-native-svg |
| **Auth** | Supabase Auth + Google via `expo-auth-session`. Web stays on Auth.js for now |
| **Backend** | Reuse Supabase project + schema. No separate DB |
| **MVP scope** | Quick-add + dashboard + transactions list + ledger picker. Defer insights/splits/recurring/AI/push/backup |
| **Offline strategy** | DIY local-first (no PowerSync): `expo-sqlite` + custom sync engine. No Supabase Realtime yet (polling every 30 s) |
| **Conflict policy** | Last-write-wins by server `updated_at` |
| **Sync cadence** | 30 s polling + on-network-reconnect + on-sign-in. Local writes set `_sync_state='pending_*'` and get picked up next cycle |
| **Schema additions** | `updated_at` (mostly existed) + `deleted_at` for soft delete (shipped in web PRs #13 / #14) |
| **Bundle id / scheme** | `com.chinnakrit.jaitang` / `jaitang://` |

### 3.2 Tech stack

- Expo 54.0.33, React 19.1, React Native 0.81.5
- expo-sqlite 16, AsyncStorage 2.2
- TanStack React Query 5.10 (`staleTime: 30s, retry: 1`)
- Supabase auth + expo-auth-session
- i18next 26 + react-i18next 17
- NativeWind 4.2
- `@expo/vector-icons` 15 + custom JtIcon sprites

### 3.3 Routes (expo-router)

**Auth** — `app/(auth)/`
- `login` — Google OAuth + dev-only email/password

**Main app** — `app/(app)/` (custom tab bar `components/AppTabBar.tsx`, visual order: dashboard → transactions → quick (FAB) → insights → settings)
- `dashboard` (visible) — hero balance + month nav + mascot + category donut + recent tx (some panels mocked)
- `transactions` (visible) — list of last 100, grouped by date, swipe-to-delete
- `quick` (visible) — quick-add form (amount + kind + category chips + note), writes local DB
- `insights` (visible) — placeholder, port `ui/Insights.html` later
- `settings` (visible) — icon style picker / language switcher / sign-out
- `ledgers` (hidden, `href: null`) — ledger switcher
- `onboarding-ledger` (hidden) — create first ledger

**Root** — `app/`
- `index` — auth gate, redirects to dashboard or login
- `_layout.tsx` — wraps every screen in providers
- `dashboard-preview` — temporary, delete after design lands

### 3.4 Providers (`providers/`)

| Provider | Purpose |
|---|---|
| `AuthProvider` | Bootstraps Supabase session; gates routes |
| `QueryProvider` | TanStack Query client |
| `ActiveLedgerProvider` | Picks first ledger, persists choice in AsyncStorage (mirrors web's `jt_active_ledger` cookie) |
| `SyncProvider` | Drives offline sync loop (30 s polling + on reconnect + on sign-in) |
| `IconStyleProvider` | Global icon sprite style (sticker/doodle/watercolor/geometric/pixel), persisted in AsyncStorage |

### 3.5 Local SQLite schema (`lib/db/schema.ts`, v2)

```
sync_state         key TEXT PRIMARY KEY, value TEXT          -- cursor bookkeeping

transactions       id, ledger_id, user_id, category_id,
                   account_id, trip_id, kind, amount, note,
                   occurred_at, payment_method, fx_currency,
                   fx_amount, fx_rate,
                   created_at, updated_at, deleted_at,
                   _sync_state                                -- read-write mirror
                   idx (ledger_id, occurred_at DESC),
                   idx (_sync_state)

categories         id, ledger_id, name, icon, color, kind,
                   sort_order, parent_id,
                   created_at, updated_at, deleted_at,
                   _sync_state                                -- pull-only mirror
                   idx (ledger_id, kind, sort_order)

accounts           id, ledger_id, name, type, icon, color,
                   initial_balance, currency, archived,
                   created_at, updated_at, deleted_at,
                   _sync_state                                -- pull-only mirror
                   idx (ledger_id)

ledgers            id, name, icon, color, currency,
                   owner_id, is_personal, role,
                   created_at, updated_at, deleted_at,
                   _sync_state                                -- pull-only mirror
                   idx (is_personal DESC, created_at)
```

`_sync_state` values: `'clean'`, `'pending_create'`, `'pending_update'`, `'pending_delete'`.

### 3.6 Sync engine (`lib/sync/`)

**Order: push → pull, per entity, every cycle.** Last-write-wins by server `updated_at`.

**`transactions.ts`** — bidirectional
- **Push**: scan `_sync_state IN ('pending_create','pending_update','pending_delete')` → UPSERT (or soft-delete via `deleted_at`) to Supabase → write server `updated_at` back → set `_sync_state='clean'`.
- **Pull**: rows where `updated_at > last_pulled_at` for active user's ledgers → UPSERT into local. Server tombstones (`deleted_at IS NOT NULL`) overwrite local rows.

**`ledgers.ts`** — pull-only (full re-pull, no cursor — owned + shared via `ledger_members` doesn't compose into a single filter)

**`categories.ts`**, **`accounts.ts`** — pull-only, cursor-based incremental per ledger

**Triggers** (`providers/SyncProvider.tsx`):
- Polling: `POLL_INTERVAL_MS = 30_000`
- Network: `lib/network.ts` listens to offline → online and fires sync immediately
- On sign-in: one-shot kickoff
- On-write: writes set pending state locally; SyncProvider picks them up next cycle

**Query invalidation**: after each sync run, bump TanStack keys `['local-tx']`, `['local-ledgers']`, `['local-categories']`, `['local-accounts']`.

### 3.7 Notable components (`components/`)

| | |
|---|---|
| `AppTabBar.tsx` | Custom 5-slot bottom nav; middle slot is the floating quick-add FAB |
| `SyncStatusBadge.tsx` | Pill — offline / syncing / synced + pending count; tap to force sync |
| `Donut.tsx` | Pure SVG pie chart (stroke-dasharray/offset) |
| `ShibaMascot.tsx` | Inline SVG mascot (no asset download) |
| `icons/JtIcon.tsx` | Sprite-backed renderer with `expo-asset` + `react-native-svg` (`SvgXml`). Per-style cache of `name → standalone-svg` |
| `icons/sprite.ts` | Parses each sprite SVG once into a `Map<name, svg>` keyed by style |
| `icons/EmojiOrIcon.tsx` | JtIcon if value matches a sprite name, else inline emoji |
| `icons/IconStyleContext.tsx` | `useIconStyle()` / `useSetIconStyle()` (AsyncStorage key `jt-icon-style`) |

### 3.8 i18n (`lib/i18n/`)

- Locales: `th` / `en` / `ja` / `zh`. Catalogs are the **same JSON files** the web app ships in `messages/` (next-intl `{var}` placeholders match i18next's default interpolation).
- Init: detect device language → fallback to Thai. After init, rehydrate stored choice from AsyncStorage (`jt-locale`).
- `setLocale(next)` swaps i18n + persists. `LOCALE_LABELS` provides display names.

### 3.9 Auth flow (`lib/auth.ts`)

1. **Google via Supabase OAuth**
   - `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: 'jaitang://auth-callback' })`
   - Open in in-app browser (`expo-web-browser`)
   - Parse access/refresh tokens from URL fragment → `supabase.auth.setSession(...)`
   - **Requires** Supabase Google provider configured + `jaitang://**` listed as redirect URI (**not yet done**)
2. **Dev-only email/password** (`__DEV__` flag), prefilled from `EXPO_PUBLIC_DEV_EMAIL` / `_PASSWORD`. Uses `signInWithPassword`. Session is identical → RLS + sync behave the same.
3. **Sign-out**: `supabase.auth.signOut()`.
4. `AuthProvider` listens on `onAuthStateChange`; gates `(app)` group.

### 3.10 Shipped phases

- ✅ **Scaffold** — Expo + expo-router, providers, Supabase client, Google OAuth code path, sprite-backed JtIcon, ledger read.
- ✅ **Phase A** — local SQLite + sync engine for transactions (push-then-pull, last-write-wins).
- ✅ **Phase B** — dashboard + transactions list read from local DB; quick-add writes local + queues for push; pending rows highlight amber.
- ✅ **Phase C** — soft delete: `deleted_at` everywhere SELECTs filter, deletes are UPDATEs, mobile handles `pending_delete` in push and server tombstones on pull. Swipe-to-delete in UI.
- ✅ **Phase D** — local cache for `categories` / `accounts` / `ledgers` (pull-only). Web PR #14 added server-side `updated_at` + `deleted_at` + triggers. SQLite bumped to v2 with 3 new mirror tables.
- ✅ **Settings tab** — icon style switcher (5 sprites), language switcher (th/en/ja/zh) with AsyncStorage persistence in i18n module, sign-out (moved off dashboard).
- ✅ **Icon sprite refresh** — synced 5 sprite SVGs from web (counts unchanged: sticker=175, others=136).

### 3.11 Pending work / known gaps

| Item | Status | Note |
|---|---|---|
| **Push path for categories / accounts / ledgers** | ❌ TODO (call it Phase E) | Phase D was pull-only — writes still hit Supabase directly. Pattern: copy `lib/sync/transactions.ts` push half, generalize. |
| **Supabase Google OAuth config** | ❌ TODO | Add Google provider + `jaitang://**` redirect URIs in Supabase dashboard before real users can sign in |
| **Insights screen** | 🟡 placeholder | Port `ui/Insights.html` mockup |
| **Streak counter** | 🟡 mocked at 12 days | Needs per-user `streaks` table or computed view |
| **Mood / budget line** | 🟡 mocked at 42k cap | Needs budgets sync (currently web-only) |
| **Trip card on dashboard** | 🟡 placeholder | Awaits trips sync |
| **UI polish** | 🟡 every screen | HTML mockups live at `ui/*.html`. Port one at a time. |
| **Trips / currency picker / AI parser / OCR / push notifs / backup** | ⏸ deferred | Roadmap items, not blocking MVP |
| **`dashboard-preview.tsx`** | 🗑 delete | Design-review artifact |

### 3.12 Useful commands

```bash
cd ~/Desktop/jaitang-mobile
npm install
cp .env.example .env          # fill in real values
npx expo start                # scan QR with Expo Go
npx tsc --noEmit              # quick type check
git push -u origin main       # if gh auth fresh
```

`.env` keys needed: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, plus Google OAuth client IDs once provider is set up.

---

## 4. Offline-first architecture (critical — do **not** lose this)

Why it exists: users in transit, spotty signal, expense tracking is naturally write-heavy. The mobile app must be usable with zero network and converge cleanly when it comes back.

### 4.1 Data flow

```
                 ┌────────────┐
   user write ──▶│ local SQL  │──┐
                 └────────────┘  │  (push)
                                 ▼
       polling/reconnect ──▶ SyncEngine ─── upserts ──▶ Supabase
                                 ▲                          │
                                 │  (pull, last_pulled_at)  │
                                 └──────────────────────────┘
                                            ▲
                                            │
                                       updated_at,
                                       deleted_at (tombstones)
```

### 4.2 Contract every synced table must follow

1. **`updated_at timestamptz not null default now()`** with a `set_updated_at` trigger that bumps it on every UPDATE.
2. **`deleted_at timestamptz`** (nullable). Deletes become `UPDATE ... SET deleted_at = now()`. Hard deletes are forbidden.
3. **Partial index** `WHERE deleted_at IS NULL` for read paths.
4. RLS clauses **must** include `deleted_at IS NULL` in SELECT policies if the table is read by mobile (so tombstones still come through to authenticated users for sync, via a separate clause that allows the row's owner/member to see soft-deleted rows during pull).
5. Local mirror table mirrors all columns + adds `_sync_state TEXT`.

### 4.3 Local pending state machine

```
clean ──user create──▶ pending_create ──push ok──▶ clean
clean ──user update──▶ pending_update ──push ok──▶ clean
clean ──user delete──▶ pending_delete ──push ok──▶ row deleted locally
                                       ──push fail──▶ stays pending, retried next cycle
                                       ──server overwrite (newer updated_at)──▶ clean, local change discarded
```

A row can carry only one pending state at a time. If the user edits a row that's still `pending_create`, it stays `pending_create` (single push will upsert the latest state).

### 4.4 Conflict policy

**Last-write-wins by server `updated_at`.** When pull sees `server.updated_at > local.updated_at`, server overwrites local — even if local is pending. Acceptable because:
- Single-user workflow dominates (rare to edit same row on two devices in < 30 s).
- Shared ledgers are rare cross-edits (different transactions, not same row).
- Future: per-field merge for `note`, but not in MVP.

### 4.5 Sync cadence

- **Polling**: 30 s (`POLL_INTERVAL_MS`).
- **Reconnect**: `lib/network.ts` watches `NetInfo` events; fires sync on offline→online edge.
- **Sign-in**: one-shot kickoff.
- **On-write**: writes set pending state locally; next polling tick picks them up. (No "push immediately on write" — keeps the engine single-threaded and avoids races.)

### 4.6 Query layer

TanStack React Query reads from local DB only. Sync engine invalidates query keys after a successful run. Mutations bump local rows + invalidate; user sees their write instantly with a "pending" amber dot until the next sync.

### 4.7 Pitfalls to avoid

- **Don't bypass the sync engine and write to Supabase directly from a mobile feature** unless the entity is explicitly pull-only and you accept the round-trip + UI flash. If you do, add a push path (Phase E pattern) instead.
- **Don't hard-delete server rows.** Mobile pulls tombstones; hard delete = ghost rows lingering locally.
- **Don't forget `_sync_state`** when adding a new mirrored table — pull logic and pending-row queries rely on it.
- **Don't drop the `updated_at` trigger** when adding columns or rewriting the table; sync needs every UPDATE to bump it.
- **Schema migrations**: bump the local SQLite version in `lib/db/schema.ts` and write the `ALTER TABLE` block in the migration switch. v2 is current.

---

## 5. Roadmap (mobile, ordered)

1. **Phase E — Write paths for categories / accounts / ledgers** (generalize `lib/sync/transactions.ts` push half).
2. **Supabase OAuth config** for `jaitang://` so real sign-in works on device.
3. **Insights screen** — port `ui/Insights.html` mockup.
4. **Budgets sync** + un-mock dashboard mood line.
5. **Streak counter** — server-side daily streak per user.
6. **Trips sync** + dashboard trip card.
7. UI polish pass (every screen has a placeholder layout right now).
8. (Deferred) currency picker, AI parser, OCR, push notifs, backup.

---

## 6. Memory / context location

User keeps point-in-time notes under:

```
/home/devlooper/.claude/projects/-home-devlooper--openclaw-workspace/memory/
```

Relevant files:

- `project_jaitang_mobile.md` — mobile state (this doc supersedes it for handoff but the memory stays as the live record)
- `project_jaitang_recent_features.md` — web feature batch (PRs #7–#14)
- `project_jaitang_icon_redesign.md` — icon system architecture
- `project_jaitang_pet_themes.md` — future "Cute Pet Edition" direction (dog/cat onboarding theme)
- `feedback_*` — collaboration preferences (reply brevity, test before done, etc.)

When in doubt: **trust the code, not the memory** — the user's been iterating fast and memories can lag a session or two behind.
