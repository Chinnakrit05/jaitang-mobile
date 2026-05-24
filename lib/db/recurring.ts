import { getDb } from './client';
import { createLocalTransaction } from './transactions';
import type { LocalRecurring } from '../sync/recurring';

export type LocalRecurringRow = LocalRecurring;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Advance an ISO timestamp by one occurrence of `period`. Mirrors the
 * server's `next_run_at + interval` step used by `run_due_recurring` /
 * `fill_pending_recurring`. Monthly/yearly use JS `setMonth`/`setFullYear`
 * which roll overflowing day-of-month forward (e.g. Jan 31 → Mar 3 in a
 * non-leap year) — acceptable and matches Date arithmetic the rest of the
 * app relies on.
 */
function advanceNextRun(iso: string, period: Period): string {
  const d = new Date(iso);
  switch (period) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString();
}

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

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──
//
// `recurring_transactions` has no `deleted_at` column server-side (it uses
// hard DELETE), so there's no tombstone to propagate: a `local` ledger's
// rows are all `pending_create` and never pushed, so deletes just hard-remove
// the row. At promote-time the bulk upload sends whatever rows still exist.

export type NewLocalRecurring = {
  ledger_id: string;
  user_id: string;
  kind: 'income' | 'expense';
  amount: number | null; // null = variable mode (fill at run time)
  note: string | null;
  category_id: string | null;
  period: Period;
  next_run_at: string;
};

/** Create a recurring rule on-device (client UUID, `pending_create`). */
export async function createLocalRecurring(
  input: NewLocalRecurring,
): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO recurring_transactions (
      id, ledger_id, user_id, category_id, kind, amount, note,
      period, next_run_at, last_run_at, active,
      created_at, updated_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.user_id,
      input.category_id,
      input.kind,
      input.amount,
      input.note,
      input.period,
      input.next_run_at,
      now,
      now,
    ],
  );
  return id;
}

/** Update a recurring rule on-device (keeps a never-pushed row as pending_create). */
export async function updateLocalRecurring(
  id: string,
  patch: {
    kind: 'income' | 'expense';
    amount: number | null;
    note: string | null;
    category_id: string | null;
    period: Period;
    active: boolean;
  },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE recurring_transactions
       SET kind=?, amount=?, note=?, category_id=?, period=?, active=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [
      patch.kind,
      patch.amount,
      patch.note,
      patch.category_id,
      patch.period,
      patch.active ? 1 : 0,
      now,
      id,
    ],
  );
}

/** Delete a recurring rule on-device. Hard delete — no server tombstone. */
export async function deleteLocalRecurring(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM recurring_transactions WHERE id=?`, [id]);
}

/**
 * Fire every due fixed-amount rule for a `local` ledger: one transaction per
 * rule, then advance the rule by one period and stamp `last_run_at`. Variable
 * rules (amount IS NULL) are skipped — they need an explicit amount via
 * `fillPendingRecurringLocal`. Returns the number of rules fired. Mirrors the
 * server `run_due_recurring` semantics (one occurrence per rule per call).
 */
export async function runDueRecurringLocal(
  ledgerId: string,
  userId: string,
): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const due = await db.getAllAsync<LocalRecurringRow>(
    `SELECT * FROM recurring_transactions
     WHERE ledger_id = ? AND active = 1 AND amount IS NOT NULL
       AND next_run_at <= ?`,
    [ledgerId, now],
  );
  let fired = 0;
  for (const rule of due) {
    await createLocalTransaction({
      ledger_id: rule.ledger_id,
      user_id: userId,
      category_id: rule.category_id,
      kind: rule.kind,
      amount: rule.amount as number,
      note: rule.note,
      occurred_at: rule.next_run_at,
    });
    const next = advanceNextRun(rule.next_run_at, rule.period);
    await db.runAsync(
      `UPDATE recurring_transactions
         SET last_run_at=?, next_run_at=?, updated_at=?,
             _sync_state=CASE WHEN _sync_state='pending_create'
                              THEN 'pending_create' ELSE 'pending_update' END
       WHERE id=?`,
      [rule.next_run_at, next, now, rule.id],
    );
    fired++;
  }
  return fired;
}

/**
 * Fill the amount for a due variable-cost rule on a `local` ledger: insert the
 * transaction with the user-supplied amount, then advance the rule by one
 * period and stamp `last_run_at`. Mirrors the server `fill_pending_recurring`.
 */
export async function fillPendingRecurringLocal(
  id: string,
  amount: number,
  userId: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const rule = await db.getFirstAsync<LocalRecurringRow>(
    `SELECT * FROM recurring_transactions WHERE id=?`,
    [id],
  );
  if (!rule) return;
  await createLocalTransaction({
    ledger_id: rule.ledger_id,
    user_id: userId,
    category_id: rule.category_id,
    kind: rule.kind,
    amount,
    note: rule.note,
    occurred_at: rule.next_run_at,
  });
  const next = advanceNextRun(rule.next_run_at, rule.period);
  await db.runAsync(
    `UPDATE recurring_transactions
       SET last_run_at=?, next_run_at=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [rule.next_run_at, next, now, id],
  );
}
