import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getLocalGoalProgress,
  listLocalGoalContributions,
  listLocalGoals,
} from '../db/goals';
import { refreshLedgerGoals } from '../sync/goals';
import { supabase } from '../supabase/client';

/**
 * Goals CRUD + contribution log.
 *
 * Reads come from the local SQLite mirror (offline-safe). Writes go
 * through SECURITY DEFINER RPCs (`create_goal` etc.); each mutation calls
 * `refreshLedgerGoals` to re-pull goals + contributions, then invalidates
 * the relevant query keys so the UI updates without waiting for the next
 * polling tick. Contributions are a separate log and never touch
 * transactions or account balances.
 */

export type Goal = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  target_amount: number;
  deadline: string | null;
  archived: boolean;
};

export type GoalContribution = {
  id: string;
  goal_id: string;
  ledger_id: string;
  amount: number;
  note: string | null;
  occurred_at: string;
  _sync_state: string;
};

export function useGoals(
  ledgerId: string | undefined,
  opts: { includeArchived?: boolean } = {},
) {
  return useQuery<Goal[]>({
    queryKey: ['local-goals', ledgerId, opts.includeArchived ?? false],
    queryFn: async () => {
      const rows = await listLocalGoals(ledgerId!, opts);
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        target_amount: r.target_amount,
        deadline: r.deadline,
        archived: r.archived === 1,
      }));
    },
    enabled: !!ledgerId,
  });
}

/** Map of goal_id → total contributed for the ledger. */
export function useGoalProgress(ledgerId: string | undefined) {
  return useQuery<Map<string, number>>({
    queryKey: ['goal-progress', ledgerId],
    queryFn: () => getLocalGoalProgress(ledgerId!),
    enabled: !!ledgerId,
  });
}

export function useGoalContributions(goalId: string | undefined) {
  return useQuery<GoalContribution[]>({
    queryKey: ['local-goal-contributions', goalId],
    queryFn: async () => {
      const rows = await listLocalGoalContributions(goalId!);
      return rows.map((r) => ({
        id: r.id,
        goal_id: r.goal_id,
        ledger_id: r.ledger_id,
        amount: r.amount,
        note: r.note,
        occurred_at: r.occurred_at,
        _sync_state: r._sync_state,
      }));
    },
    enabled: !!goalId,
  });
}

export type NewGoalInput = {
  ledger_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  target_amount: number;
  deadline?: string | null;
};

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewGoalInput) => {
      const { data, error } = await supabase.rpc('create_goal', {
        p_ledger_id: input.ledger_id,
        p_name: input.name,
        p_icon: input.icon ?? null,
        p_color: input.color ?? null,
        p_target_amount: input.target_amount,
        p_deadline: input.deadline ?? null,
      });
      if (error) throw error;
      await refreshLedgerGoals(input.ledger_id);
      await invalidateGoals(qc);
      return data as string;
    },
  });
}

export type UpdateGoalInput = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  target_amount: number;
  deadline: string | null;
};

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateGoalInput) => {
      const { error } = await supabase.rpc('update_goal', {
        p_id: input.id,
        p_name: input.name,
        p_icon: input.icon,
        p_color: input.color,
        p_target_amount: input.target_amount,
        p_deadline: input.deadline,
      });
      if (error) throw error;
      await refreshLedgerGoals(input.ledger_id);
      await invalidateGoals(qc);
    },
  });
}

export function useSetGoalArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      ledger_id: string;
      archived: boolean;
    }) => {
      const { error } = await supabase.rpc('set_goal_archived', {
        p_id: input.id,
        p_archived: input.archived,
      });
      if (error) throw error;
      await refreshLedgerGoals(input.ledger_id);
      await invalidateGoals(qc);
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_goal', { p_id: input.id });
      if (error) throw error;
      await refreshLedgerGoals(input.ledger_id);
      await invalidateGoals(qc);
    },
  });
}

export function useAddGoalContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      goal_id: string;
      ledger_id: string;
      amount: number;
      note?: string | null;
      occurred_at?: string;
    }) => {
      const { data, error } = await supabase.rpc('add_goal_contribution', {
        p_goal_id: input.goal_id,
        p_amount: input.amount,
        p_note: input.note ?? null,
        p_occurred_at: input.occurred_at ?? new Date().toISOString(),
      });
      if (error) throw error;
      await refreshLedgerGoals(input.ledger_id);
      await invalidateGoals(qc);
      return data as string;
    },
  });
}

export function useDeleteGoalContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_goal_contribution', {
        p_id: input.id,
      });
      if (error) throw error;
      await refreshLedgerGoals(input.ledger_id);
      await invalidateGoals(qc);
    },
  });
}

async function invalidateGoals(
  qc: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await qc.invalidateQueries({ queryKey: ['local-goals'] });
  await qc.invalidateQueries({ queryKey: ['goal-progress'] });
  await qc.invalidateQueries({ queryKey: ['local-goal-contributions'] });
  await qc.refetchQueries({ queryKey: ['local-goals'] });
  await qc.refetchQueries({ queryKey: ['goal-progress'] });
}
