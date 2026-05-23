import { getDb } from './client';
import type { LocalTransfer } from '../sync/transfers';

export type LocalTransferRow = LocalTransfer;

/**
 * List transfers for a ledger, newest first. Reads straight from the
 * local mirror so the screen works offline.
 */
export async function listLocalTransfers(opts: {
  ledgerId: string;
  limit?: number;
}): Promise<LocalTransferRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalTransferRow>(
    `SELECT * FROM transfers
     WHERE ledger_id = ?
     ORDER BY occurred_at DESC
     LIMIT ?`,
    [opts.ledgerId, opts.limit ?? 200],
  );
}

export async function getLocalTransfer(
  id: string,
): Promise<LocalTransferRow | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<LocalTransferRow>(
      `SELECT * FROM transfers WHERE id = ?`,
      [id],
    )) ?? null
  );
}
