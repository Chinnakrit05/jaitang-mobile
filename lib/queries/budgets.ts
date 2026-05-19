import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteLocalBudget,
  getCategorySpendForPeriod,
  listLocalBudgets,
  upsertLocalBudget,
} from '../db/budgets';
import { supabase } from '../supabase/client';

export type Budget = {
  id: string;
  ledger_id: string;
  category_id: string;
  amount: number;
  period: string;
};

export const MONTHLY_BUDGET_PERIOD = 'month';

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(period: string): { from: Date; to: Date } {
  const [year, month] = period.split('-').map(Number);
  const from = new Date(year, (month || 1) - 1, 1);
  const to = new Date(year, month || 1, 1);
  return { from, to };
}

export function moveMonth(period: string, delta: number): string {
  const { from } = monthRange(period);
  from.setMonth(from.getMonth() + delta);
  return monthKey(from);
}

export function useBudgets(
  ledgerId: string | undefined,
  period: string,
) {
  return useQuery<Budget[]>({
    queryKey: ['local-budgets', ledgerId, period],
    queryFn: async () => {
      const rows = await listLocalBudgets(ledgerId!, period);
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        category_id: r.category_id,
        amount: r.amount,
        period: r.period,
      }));
    },
    enabled: !!ledgerId,
  });
}

export function useCategorySpend(
  ledgerId: string | undefined,
  period: string,
) {
  return useQuery<Map<string, number>>({
    queryKey: ['category-spend', ledgerId, period],
    queryFn: () => {
      const range = monthRange(period);
      return getCategorySpendForPeriod(
        ledgerId!,
        range.from.toISOString(),
        range.to.toISOString(),
      );
    },
    enabled: !!ledgerId,
  });
}

export type UpsertBudgetInput = {
  ledger_id: string;
  category_id: string;
  amount: number;
  period: string;
};

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertBudgetInput) => {
      const { data, error } = await supabase.rpc('upsert_budget', {
        p_ledger_id: input.ledger_id,
        p_category_id: input.category_id,
        p_amount: input.amount,
        p_period: input.period,
      });
      if (error) throw error;
      await upsertLocalBudget({
        id: data as string,
        ledger_id: input.ledger_id,
        category_id: input.category_id,
        amount: input.amount,
        period: input.period,
      });
      await qc.invalidateQueries({ queryKey: ['local-budgets'] });
      await qc.refetchQueries({ queryKey: ['local-budgets'] });
      return data as string;
    },
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_budget', {
        p_id: input.id,
      });
      if (error) throw error;
      await deleteLocalBudget(input.id);
      await qc.invalidateQueries({ queryKey: ['local-budgets'] });
      await qc.refetchQueries({ queryKey: ['local-budgets'] });
    },
  });
}
