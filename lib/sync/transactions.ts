import { supabase } from '../supabase/client';
import { getDb, getSyncState, setSyncState } from '../db/client';

/**
 * Local + Supabase sync for the `transactions` table.
 *
 * Pull: fetch every row with `updated_at > last_pulled_at` for the
 * ledgers the user can see, then UPSERT into the local DB. Server is
 * the source of truth — `_sync_state` is reset to 'clean' on incoming
 * rows so a freshly-pulled tx isn't mistaken for a pending local edit.
 *
 * Push: scan local rows whose `_sync_state` isn't 'clean'. Pending
 * creates / updates upsert to Supabase; pending deletes call delete
 * (we soft-delete via `deleted_at` once Phase C lands; for now Phase
 * A only supports create / update).
 *
 * Last-write-wins by server timestamp. The pull pass runs AFTER push so
 * a successful upload sees its own `updated_at` echo back and lands as
 * 'clean'.
 */

const LAST_PULL_KEY = 'transactions.last_pulled_at';

export type LocalTx = {
  id: string;
  ledger_id: string;
  user_id: string;
  category_id: string | null;
  account_id: string | null;
  trip_id: string | null;
  kind: 'income' | 'expense';
  amount: number;
  note: string | null;
  occurred_at: string;
  payment_method: 'cash' | 'transfer' | null;
  fx_currency: string | null;
  fx_amount: number | null;
  fx_rate: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

const COLUMNS =
  'id, ledger_id, user_id, category_id, account_id, trip_id, kind, amount, note, occurred_at, payment_method, fx_currency, fx_amount, fx_rate, created_at, updated_at';

export async function pullTransactions(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };
  const since = (await getSyncState(LAST_PULL_KEY)) ?? '1970-01-01T00:00:00Z';
  // Use the wall-clock NOW as the next cursor BEFORE running the query so
  // a row written mid-query isn't skipped on the next pull (it'll just be
  // re-applied — UPSERT is idempotent).
  const cursor = new Date().toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .select(COLUMNS)
    .in('ledger_id', opts.ledgerIds)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (error) throw error;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const r of data ?? []) {
      await db.runAsync(
        `INSERT INTO transactions (
          id, ledger_id, user_id, category_id, account_id, trip_id,
          kind, amount, note, occurred_at, payment_method,
          fx_currency, fx_amount, fx_rate, created_at, updated_at,
          deleted_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'clean')
        ON CONFLICT(id) DO UPDATE SET
          ledger_id=excluded.ledger_id,
          user_id=excluded.user_id,
          category_id=excluded.category_id,
          account_id=excluded.account_id,
          trip_id=excluded.trip_id,
          kind=excluded.kind,
          amount=excluded.amount,
          note=excluded.note,
          occurred_at=excluded.occurred_at,
          payment_method=excluded.payment_method,
          fx_currency=excluded.fx_currency,
          fx_amount=excluded.fx_amount,
          fx_rate=excluded.fx_rate,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at,
          deleted_at=NULL,
          _sync_state='clean'
        `,
        [
          r.id,
          r.ledger_id,
          r.user_id,
          r.category_id,
          r.account_id,
          r.trip_id,
          r.kind,
          Number(r.amount),
          r.note,
          r.occurred_at,
          r.payment_method,
          r.fx_currency,
          r.fx_amount === null ? null : Number(r.fx_amount),
          r.fx_rate === null ? null : Number(r.fx_rate),
          r.created_at,
          r.updated_at,
        ],
      );
    }
  });

  await setSyncState(LAST_PULL_KEY, cursor);
  return { pulled: data?.length ?? 0 };
}

export async function pushTransactions(): Promise<{
  pushed: number;
  failed: number;
}> {
  const db = await getDb();
  const pending = await db.getAllAsync<LocalTx>(
    `SELECT * FROM transactions WHERE _sync_state IN ('pending_create','pending_update')`,
  );
  let pushed = 0;
  let failed = 0;

  for (const row of pending) {
    const payload = {
      id: row.id,
      ledger_id: row.ledger_id,
      user_id: row.user_id,
      category_id: row.category_id,
      account_id: row.account_id,
      trip_id: row.trip_id,
      kind: row.kind,
      amount: row.amount,
      note: row.note,
      occurred_at: row.occurred_at,
      payment_method: row.payment_method,
      fx_currency: row.fx_currency,
      fx_amount: row.fx_amount,
      fx_rate: row.fx_rate,
    };
    const { data, error } = await supabase
      .from('transactions')
      .upsert(payload, { onConflict: 'id' })
      .select('updated_at')
      .maybeSingle();
    if (error) {
      failed++;
      continue;
    }
    await db.runAsync(
      `UPDATE transactions SET _sync_state='clean', updated_at=? WHERE id=?`,
      [data?.updated_at ?? new Date().toISOString(), row.id],
    );
    pushed++;
  }

  return { pushed, failed };
}

export async function syncTransactions(opts: {
  ledgerIds: string[];
}): Promise<{ pushed: number; pulled: number; failed: number }> {
  // Push first so newly-uploaded rows pick up their server `updated_at`
  // on the pull pass that follows.
  const { pushed, failed } = await pushTransactions();
  const { pulled } = await pullTransactions(opts);
  return { pushed, pulled, failed };
}
