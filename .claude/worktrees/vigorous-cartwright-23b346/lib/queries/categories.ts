import { useQuery } from '@tanstack/react-query';

import { listLocalCategories } from '../db/categories';

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

/**
 * Reads the cached category list out of SQLite for the given ledger.
 * Returns the same shape the previous Supabase-direct hook exposed.
 * SyncProvider invalidates `['local-categories']` after each pull.
 */
export function useCategories(ledgerId: string | undefined) {
  return useQuery<Category[]>({
    queryKey: ['local-categories', ledgerId],
    queryFn: async () => {
      const rows = await listLocalCategories(ledgerId!);
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        kind: r.kind,
        sort_order: r.sort_order,
        parent_id: r.parent_id,
      }));
    },
    enabled: !!ledgerId,
  });
}
