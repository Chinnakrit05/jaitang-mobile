import { getDb } from './client';
import type { LocalTx } from '../sync/transactions';

/**
 * Local-DB CRUD for transactions. Reads serve the UI directly; writes
 * mark rows as `pending_create` / `pending_update` / `pending_delete`
 * so the next sync pass uploads them.
 *
 * IDs are generated client-side so writes work offline (no round-trip
 * to the server to get an id back). They're UUIDs so the upsert is
 * idempotent.
 */

function randomUuid(): string {
  // RFC4122 v4-ish. Math.random is fine for ids — we're not signing
  // anything with these.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type NewTxInput = {
  ledger_id: string;
  user_id: string;
  category_id?: string | null;
  account_id?: string | null;
  trip_id?: string | null;
  kind: 'income' | 'expense';
  amount: number;
  note?: string | null;
  occurred_at?: string;
  payment_method?: 'cash' | 'transfer' | null;
  fx_currency?: string | null;
  fx_amount?: number | null;
  fx_rate?: number | null;
};

export async function createLocalTransaction(input: NewTxInput): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO transactions (
      id, ledger_id, user_id, category_id, account_id, trip_id,
      kind, amount, note, occurred_at, payment_method,
      fx_currency, fx_amount, fx_rate,
      created_at, updated_at, deleted_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.user_id,
      input.category_id ?? null,
      input.account_id ?? null,
      input.trip_id ?? null,
      input.kind,
      input.amount,
      input.note ?? null,
      input.occurred_at ?? now,
      input.payment_method ?? null,
      input.fx_currency ?? null,
      input.fx_amount ?? null,
      input.fx_rate ?? null,
      now,
      now,
    ],
  );
  return id;
}

export type UpdateTxInput = {
  kind?: 'income' | 'expense';
  amount?: number;
  note?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  trip_id?: string | null;
  payment_method?: 'cash' | 'transfer' | null;
  occurred_at?: string;
  fx_currency?: string | null;
  fx_amount?: number | null;
  fx_rate?: number | null;
};

/**
 * Update a local transaction and queue the change for sync.
 *
 * If the row is still `pending_create` (never pushed to the server),
 * keep it in that state — the next push will upload the edited copy.
 * Otherwise flip to `pending_update`. Either way the push half of the
 * sync engine handles both states with the same upsert call.
 */
export async function updateLocalTransaction(
  id: string,
  patch: UpdateTxInput,
): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ _sync_state: string }>(
    `SELECT _sync_state FROM transactions WHERE id = ?`,
    [id],
  );
  if (!row) return;
  const nextState =
    row._sync_state === 'pending_create' ? 'pending_create' : 'pending_update';

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.kind !== undefined) {
    fields.push('kind = ?');
    values.push(patch.kind);
  }
  if (patch.amount !== undefined) {
    fields.push('amount = ?');
    values.push(patch.amount);
  }
  if (patch.note !== undefined) {
    fields.push('note = ?');
    values.push(patch.note);
  }
  if (patch.category_id !== undefined) {
    fields.push('category_id = ?');
    values.push(patch.category_id);
  }
  if (patch.account_id !== undefined) {
    fields.push('account_id = ?');
    values.push(patch.account_id);
  }
  if (patch.trip_id !== undefined) {
    fields.push('trip_id = ?');
    values.push(patch.trip_id);
  }
  if (patch.payment_method !== undefined) {
    fields.push('payment_method = ?');
    values.push(patch.payment_method);
  }
  if (patch.occurred_at !== undefined) {
    fields.push('occurred_at = ?');
    values.push(patch.occurred_at);
  }
  if (patch.fx_currency !== undefined) {
    fields.push('fx_currency = ?');
    values.push(patch.fx_currency);
  }
  if (patch.fx_amount !== undefined) {
    fields.push('fx_amount = ?');
    values.push(patch.fx_amount);
  }
  if (patch.fx_rate !== undefined) {
    fields.push('fx_rate = ?');
    values.push(patch.fx_rate);
  }
  const now = new Date().toISOString();
  fields.push('updated_at = ?');
  values.push(now);
  fields.push('_sync_state = ?');
  values.push(nextState);
  values.push(id);
  if (fields.length === 0) return;
  await db.runAsync(
    `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
}

export async function getLocalTransaction(id: string): Promise<LocalTx | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<LocalTx>(
      `SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL`,
      [id],
    )) ?? null
  );
}

export async function listLocalTransactions(opts: {
  ledgerId: string;
  limit?: number;
}): Promise<LocalTx[]> {
  const db = await getDb();
  return db.getAllAsync<LocalTx>(
    `SELECT * FROM transactions
     WHERE ledger_id = ? AND deleted_at IS NULL
     ORDER BY occurred_at DESC
     LIMIT ?`,
    [opts.ledgerId, opts.limit ?? 100],
  );
}

export async function listLocalTransactionsForRange(opts: {
  ledgerId: string;
  startDate: string;
  endDate: string;
}): Promise<LocalTx[]> {
  const db = await getDb();
  return db.getAllAsync<LocalTx>(
    `SELECT * FROM transactions
     WHERE ledger_id = ? AND deleted_at IS NULL
       AND occurred_at >= ? AND occurred_at < ?
     ORDER BY occurred_at DESC`,
    [opts.ledgerId, opts.startDate, opts.endDate],
  );
}


export async function countPendingTransactions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM transactions WHERE _sync_state != 'clean'`,
  );
  return row?.n ?? 0;
}

/**
 * Soft-delete a transaction locally. The row stays in the table but is
 * tagged with `deleted_at` so list queries hide it, and `_sync_state`
 * flips to 'pending_delete' so the next push pass propagates the
 * deletion server-side.
 *
 * If the row was a `pending_create` that never made it to the server,
 * just drop it outright — there's no remote row to delete.
 */
export async function deleteLocalTransaction(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ _sync_state: string }>(
    `SELECT _sync_state FROM transactions WHERE id = ?`,
    [id],
  );
  if (!row) return;
  if (row._sync_state === 'pending_create') {
    await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
    return;
  }
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE transactions SET deleted_at = ?, updated_at = ?, _sync_state = 'pending_delete' WHERE id = ?`,
    [now, now, id],
  );
}
