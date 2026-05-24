import { supabase } from '../supabase/client';
import { getDb } from '../db/client';

/**
 * Promote a LOCAL ledger to the cloud (Local-first Phase 3 — see
 * LOCAL_FIRST_PLAN.md).
 *
 * A `local` ledger has only ever lived in SQLite (client UUIDs,
 * `_sync_state='pending_create'`, `sync_mode='local'`). This is the one-shot
 * "enable cloud sync / share" step: it snapshots the ledger + every child
 * entity, hands the whole thing to the transactional `promote_ledger`
 * Postgres RPC (upsert-by-id), and — only once the server commits — flips the
 * local ledger to `synced` and marks every uploaded row `clean`. From then on
 * the normal SyncProvider loop keeps it in sync.
 *
 * Ordering note: we do the cloud write FIRST and the local finalize SECOND.
 * If the app dies in between, the local ledger stays `local` with
 * `pending_create` rows, so a retry simply re-promotes — the RPC's
 * `ON CONFLICT (id) DO NOTHING` makes the re-send a no-op for rows already
 * uploaded. The reverse order could leave a ledger marked `synced` whose rows
 * never reached the server (the sync loop would then never push them, since
 * non-transaction entities have no push path — promote IS their upload).
 */

/** Trim an ISO datetime to a bare `YYYY-MM-DD` for `date`-typed columns. */
function dateOnly(v: string | null): string | null {
  if (!v) return null;
  return v.length > 10 ? v.slice(0, 10) : v;
}

type Row = Record<string, unknown>;

const bool = (v: unknown): boolean => v === 1 || v === true;

export async function promoteLedger(ledgerId: string): Promise<void> {
  const db = await getDb();

  const ledger = await db.getFirstAsync<Row>(
    `SELECT id, name, icon, color, currency, is_personal
       FROM ledgers WHERE id = ?`,
    [ledgerId],
  );
  if (!ledger) throw new Error('Ledger not found');

  const categories = await db.getAllAsync<Row>(
    // Parents (parent_id IS NULL) first so the categories self-FK is
    // satisfiable as the server inserts the array in order.
    `SELECT id, name, icon, color, kind, parent_id, sort_order
       FROM categories WHERE ledger_id = ? AND deleted_at IS NULL
       ORDER BY (parent_id IS NULL) DESC, sort_order ASC`,
    [ledgerId],
  );
  const accounts = await db.getAllAsync<Row>(
    `SELECT id, name, type, icon, color, initial_balance, currency, archived
       FROM accounts WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const trips = await db.getAllAsync<Row>(
    `SELECT id, name, icon, color, currency, starts_at, ends_at, archived
       FROM trips WHERE ledger_id = ?`,
    [ledgerId],
  );
  const recurring = await db.getAllAsync<Row>(
    `SELECT id, category_id, kind, amount, note, period, next_run_at,
            last_run_at, active
       FROM recurring_transactions WHERE ledger_id = ?`,
    [ledgerId],
  );
  const budgets = await db.getAllAsync<Row>(
    `SELECT id, category_id, amount, period
       FROM budgets WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const transactions = await db.getAllAsync<Row>(
    `SELECT id, category_id, account_id, trip_id, kind, amount, note,
            occurred_at, payment_method, fx_currency, fx_amount, fx_rate
       FROM transactions WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const transfers = await db.getAllAsync<Row>(
    `SELECT id, from_account_id, to_account_id, from_amount, from_currency,
            to_amount, to_currency, fx_rate, note, occurred_at
       FROM transfers WHERE ledger_id = ?`,
    [ledgerId],
  );
  const goals = await db.getAllAsync<Row>(
    `SELECT id, name, icon, color, target_amount, deadline, archived
       FROM goals WHERE ledger_id = ?`,
    [ledgerId],
  );
  const goalContributions = await db.getAllAsync<Row>(
    `SELECT id, goal_id, amount, note, occurred_at
       FROM goal_contributions WHERE ledger_id = ?`,
    [ledgerId],
  );
  const loans = await db.getAllAsync<Row>(
    `SELECT id, kind, counterparty, principal, currency, started_at, due_date,
            status, settled_at, note
       FROM loans WHERE ledger_id = ?`,
    [ledgerId],
  );
  const loanRepayments = await db.getAllAsync<Row>(
    `SELECT id, loan_id, amount, occurred_at, note
       FROM loan_repayments WHERE ledger_id = ?`,
    [ledgerId],
  );

  // Shape the payload to the server column types: SQLite ints → JSON
  // booleans, and `date`-typed columns trimmed to YYYY-MM-DD (timestamptz
  // columns like occurred_at / next_run_at keep their full value).
  const payload = {
    ledger: {
      id: ledger.id,
      name: ledger.name,
      icon: ledger.icon,
      color: ledger.color,
      currency: ledger.currency,
      is_personal: bool(ledger.is_personal),
    },
    categories,
    accounts: accounts.map((a) => ({ ...a, archived: bool(a.archived) })),
    trips: trips.map((t) => ({
      ...t,
      starts_at: dateOnly(t.starts_at as string | null),
      ends_at: dateOnly(t.ends_at as string | null),
      archived: bool(t.archived),
    })),
    recurring: recurring.map((r) => ({ ...r, active: bool(r.active) })),
    budgets,
    transactions,
    transfers,
    goals: goals.map((g) => ({
      ...g,
      deadline: dateOnly(g.deadline as string | null),
      archived: bool(g.archived),
    })),
    goal_contributions: goalContributions,
    loans: loans.map((l) => ({
      ...l,
      started_at: dateOnly(l.started_at as string | null),
      due_date: dateOnly(l.due_date as string | null),
    })),
    loan_repayments: loanRepayments,
  };

  // 1) Cloud write — transactional + resumable server-side.
  const { error } = await supabase.rpc('promote_ledger', { p_payload: payload });
  if (error) throw error;

  // 2) Local finalize — only after the server committed. Mark every uploaded
  // row clean and flip the ledger to synced so SyncProvider starts including
  // it in the push/pull loop.
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const table of [
      'categories',
      'accounts',
      'trips',
      'recurring_transactions',
      'budgets',
      'transactions',
      'transfers',
      'goals',
      'goal_contributions',
      'loans',
      'loan_repayments',
    ]) {
      await db.runAsync(
        `UPDATE ${table} SET _sync_state='clean' WHERE ledger_id = ?`,
        [ledgerId],
      );
    }
    await db.runAsync(
      `UPDATE ledgers
         SET sync_mode='synced', promoted_at=?, _sync_state='clean'
       WHERE id = ?`,
      [now, ledgerId],
    );
  });
}
