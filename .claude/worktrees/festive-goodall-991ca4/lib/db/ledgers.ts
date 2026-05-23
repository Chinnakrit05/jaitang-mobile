import { getDb } from './client';
import type { LocalLedger } from '../sync/ledgers';

export type LocalLedgerRow = LocalLedger;

/**
 * Read the cached ledger list, sorted personal-first then by created
 * date — same ordering the web UI presents. Soft-deleted rows are
 * filtered out at the read boundary so callers never see tombstones.
 */
export async function listLocalLedgers(): Promise<LocalLedgerRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LocalLedgerRow>(
    `SELECT * FROM ledgers
     WHERE deleted_at IS NULL
     ORDER BY is_personal DESC, created_at ASC`,
  );
  return rows;
}

export async function getLocalLedger(id: string): Promise<LocalLedgerRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalLedgerRow>(
    `SELECT * FROM ledgers WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return row ?? null;
}
