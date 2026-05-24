import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createLocalAccount,
  deleteLocalAccount,
  getLocalAccountBalances,
  listLocalAccounts,
  setLocalAccountArchived,
  updateLocalAccount,
} from '../db/accounts';
import { getLocalLedger } from '../db/ledgers';
import { refreshLedgerAccounts } from '../sync/accounts';
import { supabase } from '../supabase/client';

/** A ledger is local-first (no cloud) until the user enables sync / shares. */
async function isLocalLedger(ledgerId: string): Promise<boolean> {
  const l = await getLocalLedger(ledgerId);
  return l?.sync_mode === 'local';
}

/**
 * Account CRUD + queries.
 *
 * Reads come from the local SQLite mirror so the screen works offline.
 * Writes go through SECURITY DEFINER Postgres functions (`create_account`
 * etc.) — same pattern as categories and trips. Each mutation calls
 * `refreshLedgerAccounts` to pull the fresh row back immediately and
 * then invalidates `['local-accounts']` / `['account-balances']` so the
 * UI re-renders without waiting for the next polling tick.
 *
 * `useAccountBalances` joins the account list with the live sum of
 * income/expense on each one out of the local transactions table — so
 * the displayed balance is whatever's been recorded locally, plus the
 * initial seed amount.
 */

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'e_wallet';

export type Account = {
  id: string;
  ledger_id: string;
  name: string;
  type: AccountType;
  icon: string | null;
  color: string | null;
  currency: string | null;
  initial_balance: number;
  archived: boolean;
};

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

/**
 * Map of account_id → current balance (initial + Σ tx delta) for the
 * given ledger. Pairs naturally with `useAccounts` — render the list
 * from one, read each row's balance from the other.
 */
export function useAccountBalances(ledgerId: string | undefined) {
  return useQuery<Map<string, number>>({
    queryKey: ['account-balances', ledgerId],
    queryFn: () => getLocalAccountBalances(ledgerId!),
    enabled: !!ledgerId,
  });
}

export type NewAccountInput = {
  ledger_id: string;
  name: string;
  type: AccountType;
  icon?: string | null;
  color?: string | null;
  initial_balance?: number;
  currency?: string | null;
};

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAccountInput) => {
      let newId: string;
      if (await isLocalLedger(input.ledger_id)) {
        newId = await createLocalAccount(input);
      } else {
        const { data, error } = await supabase.rpc('create_account', {
          p_ledger_id: input.ledger_id,
          p_name: input.name,
          p_type: input.type,
          p_icon: input.icon ?? null,
          p_color: input.color ?? null,
          p_initial_balance: input.initial_balance ?? 0,
          p_currency: input.currency ?? null,
        });
        if (error) throw error;
        await refreshLedgerAccounts(input.ledger_id);
        newId = data as string;
      }
      await qc.invalidateQueries({ queryKey: ['local-accounts'] });
      await qc.invalidateQueries({ queryKey: ['account-balances'] });
      await qc.refetchQueries({ queryKey: ['local-accounts'] });
      return newId;
    },
  });
}

export type UpdateAccountInput = {
  id: string;
  ledger_id: string;
  name: string;
  type: AccountType;
  icon: string | null;
  color: string | null;
  initial_balance: number;
  currency: string | null;
};

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAccountInput) => {
      if (await isLocalLedger(input.ledger_id)) {
        await updateLocalAccount(input.id, {
          name: input.name,
          type: input.type,
          icon: input.icon,
          color: input.color,
          initial_balance: input.initial_balance,
          currency: input.currency,
        });
      } else {
        const { error } = await supabase.rpc('update_account', {
          p_id: input.id,
          p_name: input.name,
          p_type: input.type,
          p_icon: input.icon,
          p_color: input.color,
          p_initial_balance: input.initial_balance,
          p_currency: input.currency,
        });
        if (error) throw error;
        await refreshLedgerAccounts(input.ledger_id);
      }
      await qc.invalidateQueries({ queryKey: ['local-accounts'] });
      await qc.invalidateQueries({ queryKey: ['account-balances'] });
      await qc.refetchQueries({ queryKey: ['local-accounts'] });
    },
  });
}

export function useSetAccountArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      ledger_id: string;
      archived: boolean;
    }) => {
      if (await isLocalLedger(input.ledger_id)) {
        await setLocalAccountArchived(input.id, input.archived);
      } else {
        const { error } = await supabase.rpc('set_account_archived', {
          p_id: input.id,
          p_archived: input.archived,
        });
        if (error) throw error;
        await refreshLedgerAccounts(input.ledger_id);
      }
      await qc.invalidateQueries({ queryKey: ['local-accounts'] });
      await qc.refetchQueries({ queryKey: ['local-accounts'] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      if (await isLocalLedger(input.ledger_id)) {
        await deleteLocalAccount(input.id);
      } else {
        const { error } = await supabase.rpc('delete_account', {
          p_id: input.id,
        });
        if (error) throw error;
        await refreshLedgerAccounts(input.ledger_id);
      }
      await qc.invalidateQueries({ queryKey: ['local-accounts'] });
      await qc.invalidateQueries({ queryKey: ['account-balances'] });
      await qc.refetchQueries({ queryKey: ['local-accounts'] });
      // Transactions that referenced this account now have account_id =
      // NULL (server-side for synced, in-place for local); invalidate so
      // the local tx cache picks that up.
      await qc.invalidateQueries({ queryKey: ['local-tx'] });
    },
  });
}

/**
 * Display metadata for each account type — surfaced in pickers + the
 * accounts screen so users see consistent labels everywhere.
 */
export const ACCOUNT_TYPES: AccountType[] = [
  'cash',
  'bank',
  'credit_card',
  'e_wallet',
];

export const ACCOUNT_TYPE_META: Record<
  AccountType,
  { label: string; icon: string }
> = {
  cash: { label: 'เงินสด', icon: '💵' },
  bank: { label: 'บัญชีธนาคาร', icon: '🏦' },
  credit_card: { label: 'บัตรเครดิต', icon: '💳' },
  e_wallet: { label: 'อีวอลเล็ต', icon: '📱' },
};
