import { supabase } from '../supabase/client';
import { getDb } from '../db/client';

/**
 * Pull `recurring_transactions` for the active user's ledgers and
 * mirror them locally. The server table doesn't carry a `deleted_at`
 * column (recurring rules use hard DELETE), so we can't drive
 * incremental sync off `updated_at > since` the way the other tables
 * do — a deleted rule would just stop appearing in the result and the
 * local row would never get cleaned up.
 *
 * Instead we do replace-all per call: drop every local row for the
 * scoped ledgers, then re-insert from the server result. Recurring
 * tables are small (single digits to maybe a few dozen rules per
 * ledger) so the cost is negligible.
 *
 * Writes still go through the SECURITY DEFINER RPCs in
 * `lib/queries/recurring.ts`; this module is read-only mirror.
 */

export type LocalRecurring = {
  id: string;
  ledger_id: string;
  user_id: string;
  category_id: string | null;
  kind: 'income' | 'expense';
  amount: number | null;
  note: string | null;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_run_at: string;
  last_run_at: string | null;
  active: number; // SQLite bool: 0 or 1
  created_at: string | null;
  updated_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

// `recurring_transactions` doesn't carry an `updated_at` column on the
// server (the table predates the soft-delete migrations that added
// `updated_at` to transactions / categories / accounts / ledgers).
// We leave the local mirror's `updated_at` column in place but never
// populate it — it's just there for schema symmetry with the other
// mirror tables.
const COLUMNS =
  'id, ledger_id, user_id, category_id, kind, amount, note, period, next_run_at, last_run_at, active, created_at';

export async function pullRecurring(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(COLUMNS)
    .in('ledger_id', opts.ledgerIds);
  if (error) throw error;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Replace-all: clear and re-populate for these ledgers. Done inside
    // one transaction so a partially-failed pull doesn't leave the
    // local mirror in a "half there" state.
    for (const lid of opts.ledgerIds) {
      await db.runAsync(
        `DELETE FROM recurring_transactions WHERE ledger_id = ?`,
        [lid],
      );
    }
    for (const r of data ?? []) {
      await db.runAsync(
        `INSERT INTO recurring_transactions (
          id, ledger_id, user_id, category_id,
          kind, amount, note, period, next_run_at, last_run_at, active,
          created_at, updated_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'clean')`,
        [
          r.id,
          r.ledger_id,
          r.user_id,
          r.category_id,
          r.kind,
          r.amount,
          r.note,
          r.period,
          r.next_run_at,
          r.last_run_at,
          r.active ? 1 : 0,
          r.created_at,
        ],
      );
    }
  });

  return { pulled: data?.length ?? 0 };
}

/**
 * Convenience wrapper for single-ledger refresh after a mutation.
 * Mirrors the `refreshLedgerCategories` shape used by the category
 * write path.
 */
export async function refreshLedgerRecurring(
  ledgerId: string,
): Promise<{ pulled: number }> {
  return pullRecurring({ ledgerIds: [ledgerId] });
}
