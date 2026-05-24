import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addLocalGoalContribution,
  createLocalGoal,
  deleteLocalGoal,
  deleteLocalGoalContribution,
  getLocalGoalProgress,
  listLocalGoalContributions,
  listLocalGoals,
  setLocalGoalArchived,
  updateLocalGoal,
} from '../db/goals';
import { getLocalLedger } from '../db/ledgers';
import { refreshLedgerGoals } from '../sync/goals';
import { supabase } from '../supabase/client';
import { useAuth } from '../../providers/AuthProvider';

/** A ledger is local-first (no cloud) until the user enables sync / shares. */
async function isLocalLedger(ledgerId: string): Promise<boolean> {
  const l = await getLocalLedger(ledgerId);
  return l?.sync_mode === 'local';
}

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
      let id: string;
      if (await isLocalLedger(input.ledger_id)) {
        id = await createLocalGoal({
          ledger_id: input.ledger_id,
          name: input.name,
          icon: input.icon ?? null,
          color: input.color ?? null,
          target_amount: input.target_amount,
          deadline: input.deadline ?? null,
        });
      } else {
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
        id = data as string;
      }
      await invalidateGoals(qc);
      return id;
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
      if (await isLocalLedger(input.ledger_id)) {
        await updateLocalGoal(input.id, {
          name: input.name,
          icon: input.icon,
          color: input.color,
          target_amount: input.target_amount,
          deadline: input.deadline,
        });
      } else {
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
      }
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
      if (await isLocalLedger(input.ledger_id)) {
        await setLocalGoalArchived(input.id, input.archived);
      } else {
        const { error } = await supabase.rpc('set_goal_archived', {
          p_id: input.id,
          p_archived: input.archived,
        });
        if (error) throw error;
        await refreshLedgerGoals(input.ledger_id);
      }
      await invalidateGoals(qc);
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      if (await isLocalLedger(input.ledger_id)) {
        await deleteLocalGoal(input.id);
      } else {
        const { error } = await supabase.rpc('delete_goal', { p_id: input.id });
        if (error) throw error;
        await refreshLedgerGoals(input.ledger_id);
      }
      await invalidateGoals(qc);
    },
  });
}

export function useAddGoalContribution() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      goal_id: string;
      ledger_id: string;
      amount: number;
      note?: string | null;
      occurred_at?: string;
    }) => {
      let id: string;
      if (await isLocalLedger(input.ledger_id)) {
        const userId = session?.user.id;
        if (!userId) throw new Error('Not signed in');
        id = await addLocalGoalContribution({
          goal_id: input.goal_id,
          ledger_id: input.ledger_id,
          user_id: userId,
          amount: input.amount,
          note: input.note ?? null,
          occurred_at: input.occurred_at,
        });
      } else {
        const { data, error } = await supabase.rpc('add_goal_contribution', {
          p_goal_id: input.goal_id,
          p_amount: input.amount,
          p_note: input.note ?? null,
          p_occurred_at: input.occurred_at ?? new Date().toISOString(),
        });
        if (error) throw error;
        await refreshLedgerGoals(input.ledger_id);
        id = data as string;
      }
      await invalidateGoals(qc);
      return id;
    },
  });
}

export function useDeleteGoalContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      if (await isLocalLedger(input.ledger_id)) {
        await deleteLocalGoalContribution(input.id);
      } else {
        const { error } = await supabase.rpc('delete_goal_contribution', {
          p_id: input.id,
        });
        if (error) throw error;
        await refreshLedgerGoals(input.ledger_id);
      }
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
