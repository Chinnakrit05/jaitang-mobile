import { getDb } from './client';
import type { LocalBudget } from '../sync/budgets';

export type LocalBudgetRow = LocalBudget;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──
//
// A `local` ledger's budgets live only on-device with `pending_*` state until
// the ledger is promoted. Delete reuses the hard-delete `deleteLocalBudget`
// below: every local row is `pending_create` (never pushed), so there's no
// server tombstone to keep — exactly what the synced mirror-refresh also wants.

/**
 * Local-first upsert mirroring the server `upsert_budget`: one active budget
 * per (ledger_id, category_id, period). Updates the existing row's amount if
 * present, otherwise inserts a new row with a client UUID and `pending_create`.
 * Returns the budget id.
 */
export async function createOrUpdateLocalBudget(input: {
  ledger_id: string;
  category_id: string;
  amount: number;
  period: string;
}): Promise<string> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM budgets
     WHERE ledger_id=? AND category_id=? AND period=? AND deleted_at IS NULL`,
    [input.ledger_id, input.category_id, input.period],
  );
  if (existing) {
    await db.runAsync(
      `UPDATE budgets
         SET amount=?, updated_at=?,
             _sync_state=CASE WHEN _sync_state='pending_create'
                              THEN 'pending_create' ELSE 'pending_update' END
       WHERE id=?`,
      [input.amount, now, existing.id],
    );
    return existing.id;
  }
  const id = randomUuid();
  await db.runAsync(
    `INSERT INTO budgets (
      id, ledger_id, category_id, amount, period,
      created_at, updated_at, deleted_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
    [id, input.ledger_id, input.category_id, input.amount, input.period, now, now],
  );
  return id;
}

export async function upsertLocalBudget(row: {
  id: string;
  ledger_id: string;
  category_id: string;
  amount: number;
  period: string;
  created_at?: string | null;
  updated_at?: string | null;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO budgets (
      id, ledger_id, category_id, amount, period,
      created_at, updated_at, deleted_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'clean')
    ON CONFLICT(id) DO UPDATE SET
      ledger_id=excluded.ledger_id,
      category_id=excluded.category_id,
      amount=excluded.amount,
      period=excluded.period,
      created_at=excluded.created_at,
      updated_at=excluded.updated_at,
      deleted_at=NULL,
      _sync_state='clean'
    `,
    [
      row.id,
      row.ledger_id,
      row.category_id,
      row.amount,
      row.period,
      row.created_at ?? null,
      row.updated_at ?? new Date().toISOString(),
    ],
  );
}

export async function deleteLocalBudget(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
}

export async function listLocalBudgets(
  ledgerId: string,
  period: string,
): Promise<LocalBudgetRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalBudgetRow>(
    `SELECT * FROM budgets
     WHERE ledger_id = ? AND period = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [ledgerId, period],
  );
}

/**
 * Expense totals for parent categories in a month. Subcategories roll
 * up into their parent so a budget set on "Food" includes "Coffee",
 * "Groceries", etc.
 */
export async function getCategorySpendForPeriod(
  ledgerId: string,
  fromIso: string,
  toIso: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category_id: string; amount: number }>(
    `SELECT COALESCE(c.parent_id, t.category_id) AS category_id,
            SUM(t.amount) AS amount
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.ledger_id = ?
       AND t.kind = 'expense'
       AND t.deleted_at IS NULL
       AND t.category_id IS NOT NULL
       AND t.occurred_at >= ?
       AND t.occurred_at < ?
     GROUP BY COALESCE(c.parent_id, t.category_id)`,
    [ledgerId, fromIso, toIso],
  );
  return new Map(
    rows
      .filter((r) => !!r.category_id)
      .map((r) => [r.category_id, Number(r.amount) || 0]),
  );
}
