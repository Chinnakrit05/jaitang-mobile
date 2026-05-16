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

export async function countPendingTransactions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM transactions WHERE _sync_state != 'clean'`,
  );
  return row?.n ?? 0;
}
