import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getLocalLedger, listLocalLedgers } from '../db/ledgers';
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
 * Creates a ledger by calling the `create_ledger` Postgres function
 * (SECURITY DEFINER). The function bypasses the ledger-member RLS
 * policy and atomically writes both the `ledgers` row and the owner's
 * `ledger_members` row, sidestepping the chicken-and-egg problem where
 * INSERT-on-ledgers is blocked because the user isn't yet a member.
 *
 * After the RPC succeeds, kicks a `pullLedgers()` so the local mirror
 * picks up the new row immediately and invalidates the query screens
 * read from.
 *
 * TODO(Phase E): when the sync engine grows a push path for ledgers,
 * switch this to write through `_sync_state='pending_create'` instead
 * and let the engine call the RPC during the next push tick.
 */
export function useCreateLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLedgerInput) => {
      const { data, error } = await supabase.rpc('create_ledger', {
        p_name: input.name,
        p_icon: input.icon ?? null,
        p_color: input.color ?? null,
        p_currency: input.currency ?? 'THB',
        p_is_personal: input.is_personal ?? true,
      });
      if (error) throw error;
      if (!data) throw new Error('create_ledger returned no id');
      const newId = data as string;
      // Refresh the local mirror so the new ledger appears in
      // `useLedgers()` without waiting for the 30s sync tick.
      const pull = await pullLedgers();
      const local = await listLocalLedgers();
      const localHasIt = await getLocalLedger(newId);
      console.log('[createLedger] rpc id=', newId);
      console.log('[createLedger] pulled', pull.pulled, 'rows');
      console.log('[createLedger] local now has', local.length, 'ledgers');
      console.log('[createLedger] local has new id?', !!localHasIt);
      await qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      // Active queries refetch in the background after invalidate; force
      // a synchronous refetch so the screen that mounts next already sees
      // the new row instead of stale (empty) cache.
      await qc.refetchQueries({ queryKey: ['local-ledgers'] });
      return newId;
    },
  });
}
