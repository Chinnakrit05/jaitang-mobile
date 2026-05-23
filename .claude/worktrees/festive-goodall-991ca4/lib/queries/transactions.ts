import { useQuery } from '@tanstack/react-query';

import { supabase } from '../supabase/client';

export type Transaction = {
  id: string;
  ledger_id: string;
  user_id: string;
  category_id: string | null;
  account_id: string | null;
  trip_id: string | null;
  kind: 'income' | 'expense';
  amount: number;
  note: string | null;
  occurred_at: string;
  payment_method: 'cash' | 'transfer' | null;
  fx_currency: string | null;
  fx_amount: number | null;
  fx_rate: number | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
};

async function fetchTransactions(opts: {
  ledgerId: string;
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<Transaction[]> {
  let q = supabase
    .from('transactions')
    .select(
      'id, ledger_id, user_id, category_id, account_id, trip_id, kind, amount, note, occurred_at, payment_method, fx_currency, fx_amount, fx_rate, category:categories(id, name, icon, color)',
    )
    .eq('ledger_id', opts.ledgerId)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.from) q = q.gte('occurred_at', opts.from.toISOString());
  if (opts.to) q = q.lt('occurred_at', opts.to.toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t) => ({
    ...t,
    amount: Number(t.amount),
    fx_amount: t.fx_amount === null ? null : Number(t.fx_amount),
    fx_rate: t.fx_rate === null ? null : Number(t.fx_rate),
    category:
      (Array.isArray(t.category) ? t.category[0] : t.category) ?? null,
  })) as Transaction[];
}

export function useTransactions(opts: {
  ledgerId: string | undefined;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  return useQuery({
    queryKey: [
      'transactions',
      opts.ledgerId,
      opts.from?.toISOString() ?? null,
      opts.to?.toISOString() ?? null,
      opts.limit ?? 100,
    ],
    queryFn: () =>
      fetchTransactions({
        ledgerId: opts.ledgerId!,
        from: opts.from,
        to: opts.to,
        limit: opts.limit,
      }),
    enabled: !!opts.ledgerId,
  });
}

export function useMonthTransactions(ledgerId: string | undefined) {
  const now = new Date();
  // Match the web app: month bucketing uses local time, not UTC.
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return useTransactions({ ledgerId, from, to, limit: 500 });
}
