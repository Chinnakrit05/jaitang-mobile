import { supabase } from '../supabase/client';
import { getDb } from '../db/client';

/**
 * Pull monthly budgets for the user's ledgers. The server table does
 * not expose `deleted_at`, so this mirror uses replace-all semantics
 * for the synced ledger ids instead of an incremental tombstone cursor.
 */

export type LocalBudget = {
  id: string;
  ledger_id: string;
  category_id: string;
  amount: number;
  period: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

const COLUMNS =
  'id, ledger_id, category_id, amount, period, created_at, updated_at';

export async function pullBudgets(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  const { data, error } = await supabase
    .from('budgets')
    .select(COLUMNS)
    .in('ledger_id', opts.ledgerIds)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (error) throw error;

  if ((data?.length ?? 0) === 0) return { pulled: 0 };
  await replaceBudgetsForLedgers(opts.ledgerIds, data ?? []);
  return { pulled: data?.length ?? 0 };
}

export async function refreshLedgerBudgets(
  ledgerId: string,
): Promise<{ pulled: number }> {
  const { data, error } = await supabase
    .from('budgets')
    .select(COLUMNS)
    .eq('ledger_id', ledgerId);
  if (error) throw error;

  if ((data?.length ?? 0) === 0) return { pulled: 0 };
  await replaceBudgetsForLedgers([ledgerId], data ?? []);
  return { pulled: data?.length ?? 0 };
}

async function replaceBudgetsForLedgers(
  ledgerIds: string[],
  rows: Array<Omit<LocalBudget, '_sync_state' | 'deleted_at'>>,
) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const ledgerId of ledgerIds) {
      await db.runAsync('DELETE FROM budgets WHERE ledger_id = ?', [ledgerId]);
    }
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO budgets (
          id, ledger_id, category_id, amount, period,
          created_at, updated_at, deleted_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clean')
        ON CONFLICT(id) DO UPDATE SET
          ledger_id=excluded.ledger_id,
          category_id=excluded.category_id,
          amount=excluded.amount,
          period=excluded.period,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at,
          deleted_at=excluded.deleted_at,
          _sync_state='clean'
        `,
        [
          r.id,
          r.ledger_id,
          r.category_id,
          Number(r.amount),
          r.period,
          r.created_at,
          r.updated_at,
          null,
        ],
      );
    }
  });
}
