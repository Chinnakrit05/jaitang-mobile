import { getDb } from './client';
import type { LocalAccount } from '../sync/accounts';

export type LocalAccountRow = LocalAccount;

export async function listLocalAccounts(
  ledgerId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<LocalAccountRow[]> {
  const db = await getDb();
  if (opts.includeArchived) {
    return db.getAllAsync<LocalAccountRow>(
      `SELECT * FROM accounts
       WHERE ledger_id = ? AND deleted_at IS NULL
       ORDER BY archived ASC, created_at DESC`,
      [ledgerId],
    );
  }
  return db.getAllAsync<LocalAccountRow>(
    `SELECT * FROM accounts
     WHERE ledger_id = ? AND deleted_at IS NULL AND archived = 0
     ORDER BY created_at DESC`,
    [ledgerId],
  );
}

/**
 * Compute the current balance of every account in a ledger as
 * `initial_balance + Σ income − Σ expense` over its non-deleted local
 * transactions. Returns a `Map<account_id, current_balance>` so callers
 * can render the list and the balances in one render cycle.
 *
 * Account rows with no matching transactions still appear in the map —
 * their balance is the bare initial balance.
 */
export async function getLocalAccountBalances(
  ledgerId: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const accounts = await db.getAllAsync<{
    id: string;
    initial_balance: number;
  }>(
    `SELECT id, initial_balance FROM accounts
     WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const sums = await db.getAllAsync<{ account_id: string; net: number }>(
    `SELECT account_id,
            SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END) AS net
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND account_id IS NOT NULL
     GROUP BY account_id`,
    [ledgerId],
  );
  const sumByAccount = new Map<string, number>();
  for (const r of sums) sumByAccount.set(r.account_id, Number(r.net) || 0);

  const out = new Map<string, number>();
  for (const a of accounts) {
    out.set(
      a.id,
      Number(a.initial_balance ?? 0) + (sumByAccount.get(a.id) ?? 0),
    );
  }
  return out;
}
