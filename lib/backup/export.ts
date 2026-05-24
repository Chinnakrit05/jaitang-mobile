import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDb } from '../db/client';
import { listLocalLedgers } from '../db/ledgers';
import {
  BACKUP_VERSION,
  type BackupFile,
  type BackupLedgerEntry,
} from './types';

/**
 * On-device backup export — writes a JSON snapshot of the chosen ledger(s)
 * to a temp file in the cache dir and pops the OS share sheet so the user
 * can save it anywhere they want (Files, iCloud Drive, AirDrop, email, …).
 *
 * The snapshot is intentionally identical in spirit to promoteLedger's
 * payload, just self-contained: every active row, no soft-deleted/tombstone
 * rows, FK refs preserved by id so import can wire them back together.
 *
 * On import, ids get remapped (see import.ts), so round-tripping
 * export → import creates a fresh copy rather than overwriting the original
 * — exactly what we want for a "backup" file.
 */

type Row = Record<string, unknown>;

const bool = (v: unknown): boolean => v === 1 || v === true;

/** Snapshot a single ledger to a portable JSON-shaped object. */
export async function snapshotLedger(
  ledgerId: string,
): Promise<BackupLedgerEntry> {
  const db = await getDb();

  const ledger = await db.getFirstAsync<Row>(
    `SELECT id, name, icon, color, currency, is_personal
       FROM ledgers WHERE id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  if (!ledger) throw new Error('Ledger not found');

  const categories = await db.getAllAsync<Row>(
    // Parents first so the categories self-FK is satisfiable as the importer
    // inserts the array in order (mirrors promote.ts).
    `SELECT id, name, icon, color, kind, parent_id, sort_order
       FROM categories WHERE ledger_id = ? AND deleted_at IS NULL
       ORDER BY (parent_id IS NULL) DESC, sort_order ASC`,
    [ledgerId],
  );
  const accounts = await db.getAllAsync<Row>(
    `SELECT id, name, type, icon, color, initial_balance, currency, archived
       FROM accounts WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const trips = await db.getAllAsync<Row>(
    `SELECT id, name, icon, color, currency, starts_at, ends_at, archived
       FROM trips WHERE ledger_id = ?`,
    [ledgerId],
  );
  const recurring = await db.getAllAsync<Row>(
    `SELECT id, category_id, kind, amount, note, period, next_run_at,
            last_run_at, active
       FROM recurring_transactions WHERE ledger_id = ?`,
    [ledgerId],
  );
  const budgets = await db.getAllAsync<Row>(
    `SELECT id, category_id, amount, period
       FROM budgets WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const transactions = await db.getAllAsync<Row>(
    `SELECT id, category_id, account_id, trip_id, kind, amount, note,
            occurred_at, payment_method, fx_currency, fx_amount, fx_rate
       FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const transfers = await db.getAllAsync<Row>(
    `SELECT id, from_account_id, to_account_id, from_amount, from_currency,
            to_amount, to_currency, fx_rate, note, occurred_at
       FROM transfers WHERE ledger_id = ?`,
    [ledgerId],
  );
  const goals = await db.getAllAsync<Row>(
    `SELECT id, name, icon, color, target_amount, deadline, archived
       FROM goals WHERE ledger_id = ?`,
    [ledgerId],
  );
  const goalContributions = await db.getAllAsync<Row>(
    `SELECT id, goal_id, amount, note, occurred_at
       FROM goal_contributions WHERE ledger_id = ?`,
    [ledgerId],
  );
  const loans = await db.getAllAsync<Row>(
    `SELECT id, kind, counterparty, principal, currency, started_at, due_date,
            status, settled_at, note
       FROM loans WHERE ledger_id = ?`,
    [ledgerId],
  );
  const loanRepayments = await db.getAllAsync<Row>(
    `SELECT id, loan_id, amount, occurred_at, note
       FROM loan_repayments WHERE ledger_id = ?`,
    [ledgerId],
  );

  return {
    ledger: {
      id: ledger.id as string,
      name: ledger.name as string,
      icon: (ledger.icon as string | null) ?? null,
      color: (ledger.color as string | null) ?? null,
      currency: (ledger.currency as string) ?? 'THB',
      is_personal: bool(ledger.is_personal),
    },
    categories,
    accounts: accounts.map((a) => ({ ...a, archived: bool(a.archived) })),
    trips: trips.map((t) => ({ ...t, archived: bool(t.archived) })),
    recurring: recurring.map((r) => ({ ...r, active: bool(r.active) })),
    budgets,
    transactions,
    transfers,
    goals: goals.map((g) => ({ ...g, archived: bool(g.archived) })),
    goal_contributions: goalContributions,
    loans,
    loan_repayments: loanRepayments,
  };
}

function sanitizeForFilename(s: string): string {
  // Keep it simple — strip path-unsafe chars and collapse whitespace.
  return s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'ledger';
}

/**
 * Build the file, write it to cache, and pop the share sheet. The returned
 * uri is the temp file (caller usually doesn't need it — the share sheet is
 * how the user actually saves it somewhere durable).
 */
async function writeAndShare(filename: string, payload: BackupFile): Promise<void> {
  const file = new File(Paths.cache, filename);
  // Overwrite any previous export with the same name; cache is throwaway.
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload));

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    // No share sheet available (e.g., web) — leave the file in cache and let
    // the caller surface the path. Throwing keeps the UI from claiming
    // success when the user has no way to retrieve the file.
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Jaitang backup',
  });
}

/** Export one ledger to a JSON file via the OS share sheet. */
export async function exportLedger(ledgerId: string, displayName: string): Promise<void> {
  const entry = await snapshotLedger(ledgerId);
  const payload: BackupFile = {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    app: 'jaitang-mobile',
    ledgers: [entry],
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `jaitang-${sanitizeForFilename(displayName)}-${stamp}.json`;
  await writeAndShare(filename, payload);
}

/** Export every (non-deleted) ledger on this device to a single JSON file. */
export async function exportAllLedgers(): Promise<{ count: number }> {
  const ledgers = await listLocalLedgers();
  if (ledgers.length === 0) {
    throw new Error('No ledgers to export');
  }
  const entries: BackupLedgerEntry[] = [];
  for (const l of ledgers) {
    entries.push(await snapshotLedger(l.id));
  }
  const payload: BackupFile = {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    app: 'jaitang-mobile',
    ledgers: entries,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `jaitang-backup-${stamp}.json`;
  await writeAndShare(filename, payload);
  return { count: entries.length };
}
