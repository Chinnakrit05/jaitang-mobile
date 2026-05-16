import { useQuery } from '@tanstack/react-query';

import { supabase } from '../supabase/client';

export type Category = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: 'income' | 'expense';
  sort_order: number;
  parent_id: string | null;
};

async function fetchCategories(ledgerId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, ledger_id, name, icon, color, kind, sort_order, parent_id')
    .eq('ledger_id', ledgerId)
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, parent_id: c.parent_id ?? null }));
}

export function useCategories(ledgerId: string | undefined) {
  return useQuery({
    queryKey: ['categories', ledgerId],
    queryFn: () => fetchCategories(ledgerId!),
    enabled: !!ledgerId,
  });
}
