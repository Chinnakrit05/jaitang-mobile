import { useQuery } from '@tanstack/react-query';

import { supabase } from '../supabase/client';

export type Account = {
  id: string;
  ledger_id: string;
  name: string;
  type: 'cash' | 'bank' | 'credit_card' | 'e_wallet';
  icon: string | null;
  color: string | null;
  currency: string | null;
  initial_balance: number;
  archived: boolean;
};

async function fetchAccounts(ledgerId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(
      'id, ledger_id, name, type, icon, color, currency, initial_balance, archived',
    )
    .eq('ledger_id', ledgerId)
    .eq('archived', false)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((a) => ({
    ...a,
    initial_balance: Number(a.initial_balance),
  }));
}

export function useAccounts(ledgerId: string | undefined) {
  return useQuery({
    queryKey: ['accounts', ledgerId],
    queryFn: () => fetchAccounts(ledgerId!),
    enabled: !!ledgerId,
  });
}
