import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import { getDb } from '../db/client';
import { BACKUP_VERSION, type BackupFile, type BackupLedgerEntry } from './types';

/**
 * Restore a backup file produced by `lib/backup/export.ts`.
 *
 * Per spec (chosen in the design session): every imported ledger lands as a
 * brand-new **local** ledger (`sync_mode='local'`, `_sync_state='pending_create'`).
 * To guarantee that, every UUID in the snapshot — ledger and child rows —
 * gets remapped to a fresh one before insert. Round-tripping
 * export → import therefore creates a fresh copy alongside the original
 * rather than overwriting it; that's the safer behavior for a "restore from
 * backup" UX.
 *
 * Self-FK refs are rewired through the maps:
 *   • category.parent_id   → categoryMap
 *   • transaction.category_id / account_id / trip_id  → respective maps
 *   • transfer.from_account_id / to_account_id        → accountMap
 *   • goal_contribution.goal_id                       → goalMap
 *   • loan_repayment.loan_id                          → loanMap
 *   • recurring.category_id / budget.category_id      → categoryMap
 *
 * Validation is intentionally lenient — we trust files we wrote ourselves
 * and skip any FK that can't be resolved (`?? null`) rather than aborting
 * the whole import. The user gets a count back; partial imports are still
 * better than nothing.
 */

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const boolInt = (v: unknown): number => (v === true || v === 1 ? 1 : 0);
const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
const numOrNull = (v: unknown): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number(v);

export type ImportSummary = {
  ledgersImported: number;
  rowsImported: number;
};

/**
 * Open the OS document picker, parse the chosen file, restore each ledger
 * inside. Returns a summary the UI can show to the user. Caller passes the
 * current signed-in user id — it's stamped onto rows that carry `user_id`
 * (transactions, recurring, transfers, loans, contributions, repayments) so
 * the row "belongs" to whoever is using the app now, not whoever exported it.
 */
export async function pickAndImportBackup(
  userId: string,
): Promise<ImportSummary | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];

  const file = new File(asset.uri);
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง');
  }
  return importBackup(parsed, userId);
}

/** Validate + import a parsed backup payload. Exposed for tests. */
export async function importBackup(
  parsed: unknown,
  userId: string,
): Promise<ImportSummary> {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('รูปแบบไฟล์ backup ไม่ถูกต้อง');
  }
  const payload = parsed as Partial<BackupFile>;
  if (payload.app !== 'jaitang-mobile') {
    throw new Error('ไฟล์ไม่ใช่ Jaitang backup');
  }
  if (payload.version !== BACKUP_VERSION) {
    throw new Error(
      `รุ่นของไฟล์ backup ไม่รองรับ (file v${payload.version}, app v${BACKUP_VERSION})`,
    );
  }
  if (!Array.isArray(payload.ledgers) || payload.ledgers.length === 0) {
    throw new Error('ไฟล์ backup ไม่มีข้อมูลสมุด');
  }

  const db = await getDb();
  let ledgersImported = 0;
  let rowsImported = 0;

  // Each ledger gets its own transaction. If one fails the others still land,
  // and a partial-imported ledger gets rolled back as a unit.
  for (const entry of payload.ledgers) {
    await db.withTransactionAsync(async () => {
      const count = await importLedgerEntry(entry, userId);
      ledgersImported += 1;
      rowsImported += count;
    });
  }

  return { ledgersImported, rowsImported };
}

async function importLedgerEntry(
  entry: BackupLedgerEntry,
  userId: string,
): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();

  // ── 1. New ledger row (sync_mode='local', pending_create) ──
  const newLedgerId = randomUuid();
  await db.runAsync(
    `INSERT INTO ledgers (
       id, name, icon, color, currency, owner_id, is_personal, role,
       created_at, updated_at, deleted_at, sync_mode, promoted_at, _sync_state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', ?, ?, NULL, 'local', NULL, 'pending_create')`,
    [
      newLedgerId,
      entry.ledger.name,
      entry.ledger.icon,
      entry.ledger.color,
      entry.ledger.currency || 'THB',
      userId,
      entry.ledger.is_personal ? 1 : 0,
      now,
      now,
    ],
  );
  let inserted = 1;

  // ── 2. Build id maps for tables referenced by FK from other rows ──
  const categoryMap = new Map<string, string>();
  const accountMap = new Map<string, string>();
  const tripMap = new Map<string, string>();
  const goalMap = new Map<string, string>();
  const loanMap = new Map<string, string>();

  for (const c of entry.categories ?? []) categoryMap.set(c.id as string, randomUuid());
  for (const a of entry.accounts ?? []) accountMap.set(a.id as string, randomUuid());
  for (const t of entry.trips ?? []) tripMap.set(t.id as string, randomUuid());
  for (const g of entry.goals ?? []) goalMap.set(g.id as string, randomUuid());
  for (const l of entry.loans ?? []) loanMap.set(l.id as string, randomUuid());

  // ── 3. Categories (parents first — already ordered by the exporter) ──
  for (const c of entry.categories ?? []) {
    const oldParent = str(c.parent_id);
    await db.runAsync(
      `INSERT INTO categories (
         id, ledger_id, name, icon, color, kind, sort_order, parent_id,
         created_at, updated_at, deleted_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
      [
        categoryMap.get(c.id as string)!,
        newLedgerId,
        c.name as string,
        str(c.icon),
        str(c.color),
        c.kind as string,
        num(c.sort_order ?? 0),
        oldParent ? (categoryMap.get(oldParent) ?? null) : null,
        now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 4. Accounts ──
  for (const a of entry.accounts ?? []) {
    await db.runAsync(
      `INSERT INTO accounts (
         id, ledger_id, name, type, icon, color, initial_balance, currency,
         archived, created_at, updated_at, deleted_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
      [
        accountMap.get(a.id as string)!,
        newLedgerId,
        a.name as string,
        a.type as string,
        str(a.icon),
        str(a.color),
        num(a.initial_balance ?? 0),
        str(a.currency),
        boolInt(a.archived),
        now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 5. Trips ──
  for (const t of entry.trips ?? []) {
    await db.runAsync(
      `INSERT INTO trips (
         id, ledger_id, name, icon, color, currency, starts_at, ends_at,
         archived, created_at, updated_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
      [
        tripMap.get(t.id as string)!,
        newLedgerId,
        t.name as string,
        str(t.icon),
        str(t.color),
        str(t.currency),
        str(t.starts_at),
        str(t.ends_at),
        boolInt(t.archived),
        now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 6. Recurring ──
  for (const r of entry.recurring ?? []) {
    const oldCat = str(r.category_id);
    await db.runAsync(
      `INSERT INTO recurring_transactions (
         id, ledger_id, user_id, category_id, kind, amount, note, period,
         next_run_at, last_run_at, active, created_at, updated_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
      [
        randomUuid(),
        newLedgerId,
        userId,
        oldCat ? (categoryMap.get(oldCat) ?? null) : null,
        r.kind as string,
        numOrNull(r.amount),
        str(r.note),
        r.period as string,
        str(r.next_run_at),
        str(r.last_run_at),
        boolInt(r.active ?? true),
        now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 7. Budgets ──
  for (const b of entry.budgets ?? []) {
    const oldCat = str(b.category_id);
    const newCat = oldCat ? categoryMap.get(oldCat) : null;
    if (!newCat) continue; // a budget without a category is meaningless
    await db.runAsync(
      `INSERT INTO budgets (
         id, ledger_id, category_id, amount, period,
         created_at, updated_at, deleted_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
      [
        randomUuid(),
        newLedgerId,
        newCat,
        num(b.amount ?? 0),
        str(b.period) ?? '',
        now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 8. Transactions ──
  for (const tx of entry.transactions ?? []) {
    const oldCat = str(tx.category_id);
    const oldAcc = str(tx.account_id);
    const oldTrip = str(tx.trip_id);
    await db.runAsync(
      `INSERT INTO transactions (
         id, ledger_id, user_id, category_id, account_id, trip_id,
         kind, amount, note, occurred_at, payment_method,
         fx_currency, fx_amount, fx_rate,
         created_at, updated_at, deleted_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
      [
        randomUuid(),
        newLedgerId,
        userId,
        oldCat ? (categoryMap.get(oldCat) ?? null) : null,
        oldAcc ? (accountMap.get(oldAcc) ?? null) : null,
        oldTrip ? (tripMap.get(oldTrip) ?? null) : null,
        tx.kind as string,
        num(tx.amount),
        str(tx.note),
        str(tx.occurred_at) ?? now,
        str(tx.payment_method),
        str(tx.fx_currency),
        numOrNull(tx.fx_amount),
        numOrNull(tx.fx_rate),
        now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 9. Transfers ──
  for (const tr of entry.transfers ?? []) {
    const oldFrom = str(tr.from_account_id);
    const oldTo = str(tr.to_account_id);
    await db.runAsync(
      `INSERT INTO transfers (
         id, ledger_id, user_id, from_account_id, to_account_id,
         from_amount, from_currency, to_amount, to_currency, fx_rate,
         note, occurred_at, created_at, updated_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
      [
        randomUuid(),
        newLedgerId,
        userId,
        oldFrom ? (accountMap.get(oldFrom) ?? null) : null,
        oldTo ? (accountMap.get(oldTo) ?? null) : null,
        num(tr.from_amount),
        str(tr.from_currency),
        num(tr.to_amount),
        str(tr.to_currency),
        numOrNull(tr.fx_rate),
        str(tr.note),
        str(tr.occurred_at) ?? now,
        now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 10. Goals + contributions ──
  for (const g of entry.goals ?? []) {
    await db.runAsync(
      `INSERT INTO goals (
         id, ledger_id, name, icon, color, target_amount, deadline,
         archived, created_at, updated_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
      [
        goalMap.get(g.id as string)!,
        newLedgerId,
        g.name as string,
        str(g.icon),
        str(g.color),
        num(g.target_amount ?? 0),
        str(g.deadline),
        boolInt(g.archived),
        now,
        now,
      ],
    );
    inserted += 1;
  }
  for (const gc of entry.goal_contributions ?? []) {
    const oldGoal = str(gc.goal_id);
    const newGoal = oldGoal ? goalMap.get(oldGoal) : null;
    if (!newGoal) continue; // orphan contribution — drop
    await db.runAsync(
      `INSERT INTO goal_contributions (
         id, goal_id, ledger_id, user_id, amount, note, occurred_at,
         created_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
      [
        randomUuid(),
        newGoal,
        newLedgerId,
        userId,
        num(gc.amount),
        str(gc.note),
        str(gc.occurred_at) ?? now,
        now,
      ],
    );
    inserted += 1;
  }

  // ── 11. Loans + repayments ──
  for (const l of entry.loans ?? []) {
    await db.runAsync(
      `INSERT INTO loans (
         id, ledger_id, user_id, kind, counterparty, principal, currency,
         started_at, due_date, status, settled_at, note,
         created_at, updated_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
      [
        loanMap.get(l.id as string)!,
        newLedgerId,
        userId,
        l.kind as string,
        str(l.counterparty),
        num(l.principal ?? 0),
        str(l.currency),
        str(l.started_at),
        str(l.due_date),
        str(l.status) ?? 'open',
        str(l.settled_at),
        str(l.note),
        now,
        now,
      ],
    );
    inserted += 1;
  }
  for (const rp of entry.loan_repayments ?? []) {
    const oldLoan = str(rp.loan_id);
    const newLoan = oldLoan ? loanMap.get(oldLoan) : null;
    if (!newLoan) continue;
    await db.runAsync(
      `INSERT INTO loan_repayments (
         id, loan_id, ledger_id, amount, occurred_at, note,
         created_at, _sync_state
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
      [
        randomUuid(),
        newLoan,
        newLedgerId,
        num(rp.amount),
        str(rp.occurred_at) ?? now,
        str(rp.note),
        now,
      ],
    );
    inserted += 1;
  }

  return inserted;
}
