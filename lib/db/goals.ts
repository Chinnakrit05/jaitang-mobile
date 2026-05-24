import { getDb } from './client';
import type { LocalGoal, LocalGoalContribution } from '../sync/goals';

export type LocalGoalRow = LocalGoal;
export type LocalGoalContributionRow = LocalGoalContribution;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──
//
// Neither `goals` nor `goal_contributions` has a `deleted_at` column
// server-side (hard DELETE). A `local` ledger's rows are all `pending_create`
// (never pushed), so deletes just hard-remove the row(s) — nothing to
// tombstone. Deleting a goal also removes its contributions (the server's
// `delete_goal` cascades the same way).

export type NewLocalGoal = {
  ledger_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  target_amount: number;
  deadline?: string | null;
};

/** Create a goal on-device (client UUID, `pending_create`). */
export async function createLocalGoal(input: NewLocalGoal): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO goals (
      id, ledger_id, name, icon, color, target_amount, deadline,
      archived, created_at, updated_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.target_amount,
      input.deadline ?? null,
      now,
      now,
    ],
  );
  return id;
}

/** Update a goal on-device (keeps a never-pushed row as pending_create). */
export async function updateLocalGoal(
  id: string,
  patch: {
    name: string;
    icon: string | null;
    color: string | null;
    target_amount: number;
    deadline: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE goals
       SET name=?, icon=?, color=?, target_amount=?, deadline=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [
      patch.name,
      patch.icon,
      patch.color,
      patch.target_amount,
      patch.deadline,
      now,
      id,
    ],
  );
}

/** Toggle archived on-device. */
export async function setLocalGoalArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE goals
       SET archived=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [archived ? 1 : 0, now, id],
  );
}

/** Delete a goal and its contributions on-device. Hard delete — no tombstone. */
export async function deleteLocalGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM goal_contributions WHERE goal_id=?`, [id]);
    await db.runAsync(`DELETE FROM goals WHERE id=?`, [id]);
  });
}

/** Add a contribution toward a goal on-device (client UUID, `pending_create`). */
export async function addLocalGoalContribution(input: {
  goal_id: string;
  ledger_id: string;
  user_id: string;
  amount: number;
  note?: string | null;
  occurred_at?: string;
}): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO goal_contributions (
      id, goal_id, ledger_id, user_id, amount, note, occurred_at,
      created_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
    [
      id,
      input.goal_id,
      input.ledger_id,
      input.user_id,
      input.amount,
      input.note ?? null,
      input.occurred_at ?? now,
      now,
    ],
  );
  return id;
}

/** Delete a goal contribution on-device. Hard delete — no tombstone. */
export async function deleteLocalGoalContribution(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM goal_contributions WHERE id=?`, [id]);
}

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
