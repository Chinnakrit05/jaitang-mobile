import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listLocalRecurring } from '../db/recurring';
import { refreshLedgerRecurring } from '../sync/recurring';
import { supabase } from '../supabase/client';

/**
 * Recurring rules — local SQLite mirror for read, RPC for write.
 *
 * Reads (`useRecurringRules`) go straight to the local SQLite cache so
 * the screen works offline. SyncProvider's poll refreshes the mirror
 * every 30s via `pullRecurring`, and individual mutations also call
 * `refreshLedgerRecurring` right after the server write so the change
 * lands locally without waiting for the next tick.
 *
 * Writes go through SECURITY DEFINER Postgres functions
 * (`create_recurring`, `update_recurring`, `delete_recurring`,
 * `run_due_recurring`, `fill_pending_recurring`) so the ledger-member
 * RLS is enforced server-side without us having to round-trip through
 * the mobile sync engine's pending-state machine. The mutations are
 * online-only — if you're offline they'll throw; that's acceptable for
 * recurring since rules are configured rarely.
 *
 * Variable-cost mode: rules with `amount = null` don't auto-fire from
 * `run_due_recurring`. Instead they show up in the "pending bills"
 * section and the user fills the amount inline via
 * `fill_pending_recurring`.
 */

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RecurringRule = {
  id: string;
  ledger_id: string;
  user_id: string;
  category_id: string | null;
  kind: 'income' | 'expense';
  amount: number | null;
  note: string | null;
  period: Period;
  next_run_at: string;
  last_run_at: string | null;
  active: boolean;
};

export function useRecurringRules(ledgerId: string | undefined) {
  return useQuery<RecurringRule[]>({
    queryKey: ['local-recurring', ledgerId],
    queryFn: async () => {
      const rows = await listLocalRecurring(ledgerId!);
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        user_id: r.user_id,
        category_id: r.category_id,
        kind: r.kind,
        amount: r.amount,
        note: r.note,
        period: r.period,
        next_run_at: r.next_run_at,
        last_run_at: r.last_run_at,
        active: r.active === 1,
      }));
    },
    enabled: !!ledgerId,
  });
}

export type NewRecurringInput = {
  ledger_id: string;
  kind: 'income' | 'expense';
  amount: number | null; // null = variable mode (fill at run time)
  note: string | null;
  category_id: string | null;
  period: Period;
  next_run_at: string;
};

export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewRecurringInput) => {
      const { data, error } = await supabase.rpc('create_recurring', {
        p_ledger_id: input.ledger_id,
        p_kind: input.kind,
        p_amount: input.amount,
        p_note: input.note,
        p_category_id: input.category_id,
        p_period: input.period,
        p_next_run_at: input.next_run_at,
      });
      if (error) throw error;
      await refreshLedgerRecurring(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.refetchQueries({ queryKey: ['local-recurring'] });
      return data as string;
    },
  });
}

export type UpdateRecurringInput = {
  id: string;
  ledger_id: string;
  kind: 'income' | 'expense';
  amount: number | null;
  note: string | null;
  category_id: string | null;
  period: Period;
  active: boolean;
};

export function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateRecurringInput) => {
      const { error } = await supabase.rpc('update_recurring', {
        p_id: input.id,
        p_kind: input.kind,
        p_amount: input.amount,
        p_note: input.note,
        p_category_id: input.category_id,
        p_period: input.period,
        p_active: input.active,
      });
      if (error) throw error;
      await refreshLedgerRecurring(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.refetchQueries({ queryKey: ['local-recurring'] });
    },
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_recurring', {
        p_id: input.id,
      });
      if (error) throw error;
      await refreshLedgerRecurring(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.refetchQueries({ queryKey: ['local-recurring'] });
    },
  });
}

/**
 * Manually fires all due fixed-amount rules. Variable-cost rules
 * (amount = null) are skipped — those need explicit
 * `fill_pending_recurring` because the user has to type the bill total.
 */
export function useRunDueRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ledgerId: string) => {
      const { data, error } = await supabase.rpc('run_due_recurring', {
        p_ledger_id: ledgerId,
      });
      if (error) throw error;
      await refreshLedgerRecurring(ledgerId);
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.invalidateQueries({ queryKey: ['local-tx'] });
      return (data ?? 0) as number;
    },
  });
}

/**
 * Fill in the amount for a variable-cost rule whose due date has
 * passed. Server-side this inserts the transaction and advances the
 * rule's next_run_at by its period — same effect as a normal run, but
 * with the user-supplied amount.
 */
export function useFillPendingRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      ledger_id: string;
      amount: number;
    }) => {
      const { error } = await supabase.rpc('fill_pending_recurring', {
        p_id: input.id,
        p_amount: input.amount,
      });
      if (error) throw error;
      await refreshLedgerRecurring(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.invalidateQueries({ queryKey: ['local-tx'] });
    },
  });
}
