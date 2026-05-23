import { getDb } from './client';
import type { LocalGoal, LocalGoalContribution } from '../sync/goals';

export type LocalGoalRow = LocalGoal;
export type LocalGoalContributionRow = LocalGoalContribution;

export async function listLocalGoals(
  ledgerId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<LocalGoalRow[]> {
  const db = await getDb();
  if (opts.includeArchived) {
    return db.getAllAsync<LocalGoalRow>(
      `SELECT * FROM goals WHERE ledger_id = ?
       ORDER BY archived ASC, created_at DESC`,
      [ledgerId],
    );
  }
  return db.getAllAsync<LocalGoalRow>(
    `SELECT * FROM goals WHERE ledger_id = ? AND archived = 0
     ORDER BY created_at DESC`,
    [ledgerId],
  );
}

/**
 * Map of goal_id → total contributed (Σ amount) for a ledger. Pairs with
 * `listLocalGoals` so a screen renders the list and each goal's progress
 * in one cycle.
 */
export async function getLocalGoalProgress(
  ledgerId: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ goal_id: string; total: number }>(
    `SELECT goal_id, SUM(amount) AS total
     FROM goal_contributions
     WHERE ledger_id = ?
     GROUP BY goal_id`,
    [ledgerId],
  );
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.goal_id, Number(r.total) || 0);
  return out;
}

export async function listLocalGoalContributions(
  goalId: string,
): Promise<LocalGoalContributionRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalGoalContributionRow>(
    `SELECT * FROM goal_contributions WHERE goal_id = ?
     ORDER BY occurred_at DESC`,
    [goalId],
  );
}
