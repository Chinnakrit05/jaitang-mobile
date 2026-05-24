import { getDb } from './client';
import type { LocalTransfer } from '../sync/transfers';

export type LocalTransferRow = LocalTransfer;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──
//
// `transfers` has no `deleted_at` column server-side (hard DELETE), and a
// `local` ledger's rows are all `pending_create` (never pushed), so deletes
// just hard-remove the row — nothing to tombstone.

export type NewLocalTransfer = {
  ledger_id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  from_amount: number;
  from_currency: string;
  to_amount: number;
  to_currency: string;
  fx_rate: number;
  note?: string | null;
  occurred_at?: string;
};

/** Create a transfer on-device (client UUID, `pending_create`). */
export async function createLocalTransfer(input: NewLocalTransfer): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO transfers (
      id, ledger_id, user_id, from_account_id, to_account_id,
      from_amount, from_currency, to_amount, to_currency, fx_rate,
      note, occurred_at, created_at, updated_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.user_id,
      input.from_account_id,
      input.to_account_id,
      input.from_amount,
      input.from_currency,
      input.to_amount,
      input.to_currency,
      input.fx_rate,
      input.note ?? null,
      input.occurred_at ?? now,
      now,
    ],
  );
  return id;
}

/** Update a transfer on-device (keeps a never-pushed row as pending_create). */
export async function updateLocalTransfer(
  id: string,
  patch: {
    from_account_id: string;
    to_account_id: string;
    from_amount: number;
    from_currency: string;
    to_amount: number;
    to_currency: string;
    fx_rate: number;
    note: string | null;
    occurred_at: string;
  },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE transfers
       SET from_account_id=?, to_account_id=?, from_amount=?, from_currency=?,
           to_amount=?, to_currency=?, fx_rate=?, note=?, occurred_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [
      patch.from_account_id,
      patch.to_account_id,
      patch.from_amount,
      patch.from_currency,
      patch.to_amount,
      patch.to_currency,
      patch.fx_rate,
      patch.note,
      patch.occurred_at,
      id,
    ],
  );
}

/** Delete a transfer on-device. Hard delete — no server tombstone. */
export async function deleteLocalTransfer(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM transfers WHERE id=?`, [id]);
}

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
