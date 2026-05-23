import { useQuery } from '@tanstack/react-query';

import { listLocalAccounts } from '../db/accounts';

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

/**
 * Reads the cached account list out of SQLite for the given ledger.
 * SyncProvider invalidates `['local-accounts']` after each pull.
 */
export function useAccounts(
  ledgerId: string | undefined,
  opts: { includeArchived?: boolean } = {},
) {
  return useQuery<Account[]>({
    queryKey: ['local-accounts', ledgerId, opts.includeArchived ?? false],
    queryFn: async () => {
      const rows = await listLocalAccounts(ledgerId!, opts);
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        name: r.name,
        type: r.type,
        icon: r.icon,
        color: r.color,
        currency: r.currency,
        initial_balance: r.initial_balance,
        archived: r.archived === 1,
      }));
    },
    enabled: !!ledgerId,
  });
}
