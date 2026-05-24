import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createLocalRecurring,
  deleteLocalRecurring,
  fillPendingRecurringLocal,
  listLocalRecurring,
  runDueRecurringLocal,
  updateLocalRecurring,
} from '../db/recurring';
import { getLocalLedger } from '../db/ledgers';
import { refreshLedgerRecurring } from '../sync/recurring';
import { supabase } from '../supabase/client';
import { useAuth } from '../../providers/AuthProvider';

/** A ledger is local-first (no cloud) until the user enables sync / shares. */
async function isLocalLedger(ledgerId: string): Promise<boolean> {
  const l = await getLocalLedger(ledgerId);
  return l?.sync_mode === 'local';
}

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
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: NewRecurringInput) => {
      let newId: string;
      if (await isLocalLedger(input.ledger_id)) {
        const userId = session?.user.id;
        if (!userId) throw new Error('Not signed in');
        newId = await createLocalRecurring({
          ledger_id: input.ledger_id,
          user_id: userId,
          kind: input.kind,
          amount: input.amount,
          note: input.note,
          category_id: input.category_id,
          period: input.period,
          next_run_at: input.next_run_at,
        });
      } else {
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
        newId = data as string;
      }
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.refetchQueries({ queryKey: ['local-recurring'] });
      return newId;
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
      if (await isLocalLedger(input.ledger_id)) {
        await updateLocalRecurring(input.id, {
          kind: input.kind,
          amount: input.amount,
          note: input.note,
          category_id: input.category_id,
          period: input.period,
          active: input.active,
        });
      } else {
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
      }
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.refetchQueries({ queryKey: ['local-recurring'] });
    },
  });
}

export function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      if (await isLocalLedger(input.ledger_id)) {
        await deleteLocalRecurring(input.id);
      } else {
        const { error } = await supabase.rpc('delete_recurring', {
          p_id: input.id,
        });
        if (error) throw error;
        await refreshLedgerRecurring(input.ledger_id);
      }
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
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (ledgerId: string) => {
      let fired: number;
      if (await isLocalLedger(ledgerId)) {
        const userId = session?.user.id;
        if (!userId) throw new Error('Not signed in');
        fired = await runDueRecurringLocal(ledgerId, userId);
      } else {
        const { data, error } = await supabase.rpc('run_due_recurring', {
          p_ledger_id: ledgerId,
        });
        if (error) throw error;
        await refreshLedgerRecurring(ledgerId);
        fired = (data ?? 0) as number;
      }
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.invalidateQueries({ queryKey: ['local-tx'] });
      return fired;
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
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      ledger_id: string;
      amount: number;
    }) => {
      if (await isLocalLedger(input.ledger_id)) {
        const userId = session?.user.id;
        if (!userId) throw new Error('Not signed in');
        await fillPendingRecurringLocal(input.id, input.amount, userId);
      } else {
        const { error } = await supabase.rpc('fill_pending_recurring', {
          p_id: input.id,
          p_amount: input.amount,
        });
        if (error) throw error;
        await refreshLedgerRecurring(input.ledger_id);
      }
      await qc.invalidateQueries({ queryKey: ['local-recurring'] });
      await qc.invalidateQueries({ queryKey: ['local-tx'] });
    },
  });
}
