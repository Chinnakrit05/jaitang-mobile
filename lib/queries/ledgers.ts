import { useQuery } from '@tanstack/react-query';

import { listLocalLedgers } from '../db/ledgers';

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
