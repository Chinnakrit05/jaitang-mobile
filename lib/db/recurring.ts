import { getDb } from './client';
import type { LocalRecurring } from '../sync/recurring';

export type LocalRecurringRow = LocalRecurring;

/**
 * Reads recurring rules for the given ledger out of the local mirror.
 * Ordered with active rules first, then by next_run_at — same order the
 * screen expects to render.
 */
export async function listLocalRecurring(
  ledgerId: string,
): Promise<LocalRecurringRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalRecurringRow>(
    `SELECT * FROM recurring_transactions
     WHERE ledger_id = ?
     ORDER BY active DESC, next_run_at ASC`,
    [ledgerId],
  );
}
