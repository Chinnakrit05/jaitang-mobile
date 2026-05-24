import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createLocalLedger,
  deleteLocalLedgerRow,
  getLocalLedger,
  listLocalLedgers,
  updateLocalLedgerMeta,
} from '../db/ledgers';
import { seedDefaultCategoriesLocal } from '../db/categories';
import { pullLedgers } from '../sync/ledgers';
import { promoteLedger } from '../sync/promote';
import { supabase } from '../supabase/client';
import { useAuth } from '../../providers/AuthProvider';
import { useSync } from '../../providers/SyncProvider';

export type LedgerSummary = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string;
  is_personal: boolean;
  role: 'owner' | 'editor' | 'viewer';
  // Local-first: 'local' = on-device only (no cloud backup) until promoted.
  sync_mode: 'local' | 'synced';
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
        sync_mode: r.sync_mode,
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

export type UpdateLedgerInput = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string;
};

/**
 * Update ledger metadata (name / icon / color / currency). Server-side
 * enforces "only the owner can update". After success we re-pull so the
 * local mirror picks up the new values.
 */
export function useUpdateLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateLedgerInput) => {
      const existing = await getLocalLedger(input.id);
      if (existing?.sync_mode === 'local') {
        // Local-only ledger — edit in place, no cloud round-trip.
        await updateLocalLedgerMeta(input.id, {
          name: input.name,
          icon: input.icon,
          color: input.color,
          currency: input.currency,
        });
      } else {
        const { error } = await supabase.rpc('update_ledger', {
          p_id: input.id,
          p_name: input.name,
          p_icon: input.icon,
          p_color: input.color,
          p_currency: input.currency,
        });
        if (error) throw error;
        await pullLedgers();
      }
      await qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      await qc.refetchQueries({ queryKey: ['local-ledgers'] });
    },
  });
}

/**
 * Soft-delete a ledger (only owner). Transactions / categories stay in
 * the DB but the ledger row gets `deleted_at` set; pullLedgers picks
 * up the tombstone and `listLocalLedgers` filters it out.
 */
export function useDeleteLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const existing = await getLocalLedger(id);
      if (existing?.sync_mode === 'local') {
        // Never uploaded — hard-remove on-device, nothing to tombstone.
        await deleteLocalLedgerRow(id);
      } else {
        const { error } = await supabase.rpc('delete_ledger', { p_id: id });
        if (error) throw error;
        await pullLedgers();
      }
      await qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      await qc.refetchQueries({ queryKey: ['local-ledgers'] });
    },
  });
}

/**
 * Creates a ledger **local-first**: written to SQLite only, with a client
 * UUID, `sync_mode='local'` and `_sync_state='pending_create'`. Nothing is
 * uploaded — the ledger lives only on this device until the user enables
 * cloud sync or shares it, at which point the promote flow pushes it (and
 * its children) to the cloud and flips it to 'synced'. See
 * LOCAL_FIRST_PLAN.md.
 *
 * (Previously this called the `create_ledger` RPC and pulled it back; that
 * path moves into the promote step in a later phase.)
 */
export function useCreateLedger() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: NewLedgerInput) => {
      const userId = session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const newId = await createLocalLedger({
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? null,
        currency: input.currency ?? 'THB',
        is_personal: input.is_personal ?? true,
        owner_id: userId,
      });
      // Seed the default category hierarchy on-device so a brand-new local
      // ledger is immediately usable (the cloud path seeds server-side).
      await seedDefaultCategoriesLocal(newId);
      await qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      await qc.invalidateQueries({ queryKey: ['local-categories'] });
      // Force a synchronous refetch so the screen that mounts next already
      // sees the new row instead of stale (empty) cache.
      await qc.refetchQueries({ queryKey: ['local-ledgers'] });
      return newId;
    },
  });
}

/**
 * Enable cloud sync for a `local` ledger (Local-first Phase 3). Uploads the
 * ledger + every child entity in one transactional RPC, flips it to `synced`,
 * then kicks a normal sync pass. This is also the path Share should call
 * before inviting someone (sharing implies cloud — see LOCAL_FIRST_PLAN.md).
 *
 * No-ops gracefully if the ledger is already `synced`. Idempotent/resumable:
 * the underlying RPC upserts by id, so a retry after a mid-flight failure is
 * safe.
 */
export function useEnableLedgerSync() {
  const qc = useQueryClient();
  const { syncNow } = useSync();
  return useMutation({
    mutationFn: async (ledgerId: string) => {
      const existing = await getLocalLedger(ledgerId);
      if (!existing) throw new Error('Ledger not found');
      if (existing.sync_mode === 'synced') return; // already in the cloud
      await promoteLedger(ledgerId);
    },
    onSuccess: async () => {
      // The ledger (and its children) are now cloud-backed. Refresh every
      // local-* cache the promoted data feeds, and kick a sync so the loop
      // immediately starts treating this ledger as synced.
      await qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      await qc.refetchQueries({ queryKey: ['local-ledgers'] });
      for (const key of [
        'local-categories',
        'local-accounts',
        'local-budgets',
        'local-recurring',
        'local-trips',
        'local-transfers',
        'local-goals',
        'goal-progress',
        'local-goal-contributions',
        'local-loans',
        'loan-repaid',
        'local-loan-repayments',
        'local-tx',
        'account-balances',
      ]) {
        await qc.invalidateQueries({ queryKey: [key] });
      }
      void syncNow();
    },
  });
}
