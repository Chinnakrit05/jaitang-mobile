import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listLocalLedgers } from '../db/ledgers';
import { pullLedgers } from '../sync/ledgers';
import { supabase } from '../supabase/client';

export type LedgerSummary = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string;
  is_personal: boolean;
  role: 'owner' | 'editor' | 'viewer';
};

/**
 * Reads the cached ledger list out of SQLite. SyncProvider's pull
 * refreshes the cache and invalidates `['local-ledgers']` to push the
 * fresh rows here.
 *
 * Same return shape as the previous Supabase-direct hook so screens
 * don't need to change.
 */
export function useLedgers() {
  return useQuery<LedgerSummary[]>({
    queryKey: ['local-ledgers'],
    queryFn: async () => {
      const rows = await listLocalLedgers();
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        currency: r.currency,
        is_personal: r.is_personal === 1,
        role: r.role,
      }));
    },
  });
}

export type NewLedgerInput = {
  name: string;
  icon?: string | null;
  color?: string | null;
  currency?: string;
  is_personal?: boolean;
};

/**
 * Creates a ledger directly against Supabase (writes don't go through
 * the sync engine — see `lib/db/schema.ts`: ledgers are pull-only for
 * now). After insert, kicks a `pullLedgers()` so the local mirror picks
 * up the new row immediately, and invalidates the query that screens
 * read from.
 *
 * Returns the new ledger's id so the caller can `setActiveLedger(id)`.
 */
export function useCreateLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLedgerInput) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('ledgers')
        .insert({
          name: input.name,
          icon: input.icon ?? null,
          color: input.color ?? null,
          currency: input.currency ?? 'THB',
          owner_id: userId,
          is_personal: input.is_personal ?? true,
        })
        .select('id')
        .single();
      if (error) throw error;
      // Refresh the local mirror so the new ledger appears in
      // `useLedgers()` without waiting for the 30s sync tick.
      await pullLedgers();
      await qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      return data.id as string;
    },
  });
}
