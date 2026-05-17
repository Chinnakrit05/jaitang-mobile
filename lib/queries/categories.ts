import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listLocalCategories } from '../db/categories';
import { refreshLedgerCategories } from '../sync/categories';
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

export type NewCategoryInput = {
  ledger_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  kind: 'income' | 'expense';
  parent_id?: string | null;
  sort_order?: number;
};

export type UpdateCategoryInput = {
  id: string;
  ledger_id: string; // for pull scope after mutation
  name: string;
  icon: string | null;
  parent_id: string | null;
};

/**
 * Mutations go through three Postgres functions (`create_category`,
 * `update_category`, `delete_category`) defined with SECURITY DEFINER —
 * same trick as the ledger create path. The functions bypass the
 * ledger-member RLS to do the write, but re-check membership inside so
 * a user can still only mutate categories of ledgers they belong to.
 *
 * Categories are a pull-only mirror in the sync engine (see
 * `lib/db/schema.ts`) so after each RPC we re-pull and invalidate the
 * React Query cache to refresh the screen without waiting for the 30s
 * sync tick.
 *
 * TODO(Phase E): switch to write-through the sync engine — set
 * `_sync_state='pending_create'` locally and let the engine push.
 */
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewCategoryInput) => {
      const { data, error } = await supabase.rpc('create_category', {
        p_ledger_id: input.ledger_id,
        p_name: input.name,
        p_kind: input.kind,
        p_icon: input.icon ?? null,
        p_color: input.color ?? null,
        p_parent_id: input.parent_id ?? null,
        p_sort_order: input.sort_order ?? 0,
      });
      if (error) throw error;
      await refreshLedgerCategories(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-categories'] });
      await qc.refetchQueries({ queryKey: ['local-categories'] });
      return data as string;
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCategoryInput) => {
      const { error } = await supabase.rpc('update_category', {
        p_id: input.id,
        p_name: input.name,
        p_icon: input.icon,
        p_parent_id: input.parent_id,
      });
      if (error) throw error;
      await refreshLedgerCategories(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-categories'] });
      await qc.refetchQueries({ queryKey: ['local-categories'] });
    },
  });
}

/**
 * Seed a fresh ledger with the default Thai expense/income hierarchy.
 * The server function is idempotent — it no-ops if the ledger already
 * has any non-deleted category. Useful for ledgers that were created
 * before the auto-seed wiring landed in `create_ledger`.
 */
export function useSeedDefaultCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ledger_id: string) => {
      const { data, error } = await supabase.rpc('seed_default_categories', {
        p_ledger_id: ledger_id,
      });
      if (error) throw error;
      await refreshLedgerCategories(ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-categories'] });
      await qc.refetchQueries({ queryKey: ['local-categories'] });
      return (data ?? 0) as number;
    },
  });
}

/**
 * Soft delete — the `delete_category` RPC sets `deleted_at`. Tombstones
 * propagate via `pullCategories`, so the local mirror picks them up and
 * `listLocalCategories` (with `WHERE deleted_at IS NULL`) hides them.
 *
 * Transactions that referenced the category keep their `category_id`
 * (no FK cascade); list screens render them as "อื่นๆ".
 */
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_category', {
        p_id: input.id,
      });
      if (error) throw error;
      await refreshLedgerCategories(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-categories'] });
      await qc.refetchQueries({ queryKey: ['local-categories'] });
    },
  });
}
