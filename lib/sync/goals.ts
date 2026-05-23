import { supabase } from '../supabase/client';
import { getDb } from '../db/client';

/**
 * Goals + goal_contributions pull. Replace-all per ledger (like trips):
 * neither server table has a `deleted_at` tombstone column. Reads go
 * through the SECURITY DEFINER `list_goals` / `list_goal_contributions`
 * RPCs rather than direct selects, because these tables are new to
 * mobile and may have RLS with no SELECT policy for the authenticated
 * user (the web reads them via service role).
 */

export type LocalGoal = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  target_amount: number;
  deadline: string | null;
  archived: number; // SQLite bool
  created_at: string | null;
  updated_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

export type LocalGoalContribution = {
  id: string;
  goal_id: string;
  ledger_id: string;
  user_id: string | null;
  amount: number;
  note: string | null;
  occurred_at: string;
  created_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

export async function pullGoals(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  const { data, error } = await supabase.rpc('list_goals', {
    p_ledger_ids: opts.ledgerIds,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<
    Omit<LocalGoal, '_sync_state' | 'updated_at' | 'archived'> & {
      archived: boolean | number;
    }
  >;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const lid of opts.ledgerIds) {
      await db.runAsync(`DELETE FROM goals WHERE ledger_id = ?`, [lid]);
    }
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO goals (
          id, ledger_id, name, icon, color, target_amount, deadline,
          archived, created_at, updated_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'clean')`,
        [
          r.id,
          r.ledger_id,
          r.name,
          r.icon,
          r.color,
          Number(r.target_amount) || 0,
          r.deadline,
          r.archived ? 1 : 0,
          r.created_at,
        ],
      );
    }
  });

  return { pulled: rows.length };
}

export async function pullGoalContributions(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  const { data, error } = await supabase.rpc('list_goal_contributions', {
    p_ledger_ids: opts.ledgerIds,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<
    Omit<LocalGoalContribution, '_sync_state'>
  >;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const lid of opts.ledgerIds) {
      await db.runAsync(`DELETE FROM goal_contributions WHERE ledger_id = ?`, [
        lid,
      ]);
    }
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO goal_contributions (
          id, goal_id, ledger_id, user_id, amount, note, occurred_at,
          created_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clean')`,
        [
          r.id,
          r.goal_id,
          r.ledger_id,
          r.user_id,
          Number(r.amount) || 0,
          r.note,
          r.occurred_at,
          r.created_at,
        ],
      );
    }
  });

  return { pulled: rows.length };
}

/** Refresh both goals + contributions for one ledger (used after writes). */
export async function refreshLedgerGoals(
  ledgerId: string,
): Promise<{ pulled: number }> {
  const g = await pullGoals({ ledgerIds: [ledgerId] });
  const c = await pullGoalContributions({ ledgerIds: [ledgerId] });
  return { pulled: g.pulled + c.pulled };
}
