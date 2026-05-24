import { getDb } from './client';
import type { LocalLedger } from '../sync/ledgers';

export type LocalLedgerRow = LocalLedger;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type NewLocalLedger = {
  name: string;
  icon?: string | null;
  color?: string | null;
  currency?: string;
  is_personal?: boolean;
  owner_id: string;
};

/**
 * Create a ledger **locally only** (local-first). It gets a client UUID and
 * `sync_mode='local'`, so the sync engine ignores it — nothing is uploaded
 * until the user enables cloud sync / shares (which flips it to 'synced' and
 * pushes via the promote flow). `_sync_state='pending_create'` records that
 * it has never been uploaded.
 */
export async function createLocalLedger(input: NewLocalLedger): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO ledgers (
      id, name, icon, color, currency, owner_id, is_personal, role,
      created_at, updated_at, deleted_at, sync_mode, promoted_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', ?, ?, NULL, 'local', NULL, 'pending_create')`,
    [
      id,
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.currency ?? 'THB',
      input.owner_id,
      input.is_personal ? 1 : 0,
      now,
      now,
    ],
  );
  return id;
}

/** Update a local ledger's metadata in place (used for `local` ledgers). */
export async function updateLocalLedgerMeta(
  id: string,
  patch: { name: string; icon: string | null; color: string | null; currency: string },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  // Keep a never-uploaded ledger as pending_create; otherwise mark it dirty.
  await db.runAsync(
    `UPDATE ledgers
       SET name=?, icon=?, color=?, currency=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [patch.name, patch.icon, patch.color, patch.currency, now, id],
  );
}

/**
 * Hard-remove a local-only ledger and its on-device child rows. Safe because
 * a `local` ledger was never uploaded, so there's nothing to tombstone in the
 * cloud. (Synced ledgers go through the server soft-delete RPC instead.)
 */
export async function deleteLocalLedgerRow(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const table of [
      'transactions',
      'categories',
      'accounts',
      'recurring_transactions',
      'trips',
      'budgets',
      'transfers',
      'goals',
      'goal_contributions',
      'loans',
      'loan_repayments',
    ]) {
      await db.runAsync(`DELETE FROM ${table} WHERE ledger_id=?`, [id]);
    }
    await db.runAsync(`DELETE FROM ledgers WHERE id=?`, [id]);
  });
}

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
