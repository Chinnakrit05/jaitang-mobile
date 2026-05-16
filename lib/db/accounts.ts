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
