import { getDb } from './client';
import type { LocalBudget } from '../sync/budgets';

export type LocalBudgetRow = LocalBudget;

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
