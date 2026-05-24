import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createLocalTransfer,
  deleteLocalTransfer,
  listLocalTransfers,
  updateLocalTransfer,
} from '../db/transfers';
import { getLocalLedger } from '../db/ledgers';
import { refreshLedgerTransfers } from '../sync/transfers';
import { supabase } from '../supabase/client';
import { useAuth } from '../../providers/AuthProvider';

/** A ledger is local-first (no cloud) until the user enables sync / shares. */
async function isLocalLedger(ledgerId: string): Promise<boolean> {
  const l = await getLocalLedger(ledgerId);
  return l?.sync_mode === 'local';
}

/**
 * Transfer CRUD + queries.
 *
 * Reads come from the local SQLite mirror so the screen works offline.
 * Writes go through SECURITY DEFINER Postgres functions (`create_transfer`
 * etc.) — same pattern as accounts. Each mutation calls
 * `refreshLedgerTransfers` to pull the fresh set back immediately, then
 * invalidates `['local-transfers']` + `['account-balances']` (transfers
 * shift account balances) so the UI re-renders without waiting for the
 * next polling tick.
 */

export type Transfer = {
  id: string;
  ledger_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  from_amount: number;
  from_currency: string | null;
  to_amount: number;
  to_currency: string | null;
  fx_rate: number | null;
  note: string | null;
  occurred_at: string;
  _sync_state: string;
};

export function useTransfers(ledgerId: string | undefined) {
  return useQuery<Transfer[]>({
    queryKey: ['local-transfers', ledgerId],
    queryFn: async () => {
      const rows = await listLocalTransfers({ ledgerId: ledgerId! });
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        from_account_id: r.from_account_id,
        to_account_id: r.to_account_id,
        from_amount: r.from_amount,
        from_currency: r.from_currency,
        to_amount: r.to_amount,
        to_currency: r.to_currency,
        fx_rate: r.fx_rate,
        note: r.note,
        occurred_at: r.occurred_at,
        _sync_state: r._sync_state,
      }));
    },
    enabled: !!ledgerId,
  });
}

export type NewTransferInput = {
  ledger_id: string;
  from_account_id: string;
  to_account_id: string;
  from_amount: number;
  from_currency: string;
  to_amount: number;
  to_currency: string;
  fx_rate: number;
  note?: string | null;
  occurred_at?: string;
};

export function useCreateTransfer() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: NewTransferInput) => {
      let id: string;
      if (await isLocalLedger(input.ledger_id)) {
        const userId = session?.user.id;
        if (!userId) throw new Error('Not signed in');
        id = await createLocalTransfer({
          ledger_id: input.ledger_id,
          user_id: userId,
          from_account_id: input.from_account_id,
          to_account_id: input.to_account_id,
          from_amount: input.from_amount,
          from_currency: input.from_currency,
          to_amount: input.to_amount,
          to_currency: input.to_currency,
          fx_rate: input.fx_rate,
          note: input.note ?? null,
          occurred_at: input.occurred_at,
        });
      } else {
        const { data, error } = await supabase.rpc('create_transfer', {
          p_ledger_id: input.ledger_id,
          p_from_account_id: input.from_account_id,
          p_to_account_id: input.to_account_id,
          p_from_amount: input.from_amount,
          p_from_currency: input.from_currency,
          p_to_amount: input.to_amount,
          p_to_currency: input.to_currency,
          p_fx_rate: input.fx_rate,
          p_note: input.note ?? null,
          p_occurred_at: input.occurred_at ?? new Date().toISOString(),
        });
        if (error) throw error;
        await refreshLedgerTransfers(input.ledger_id);
        id = data as string;
      }
      await qc.invalidateQueries({ queryKey: ['local-transfers'] });
      await qc.invalidateQueries({ queryKey: ['account-balances'] });
      await qc.refetchQueries({ queryKey: ['local-transfers'] });
      return id;
    },
  });
}

export type UpdateTransferInput = {
  id: string;
  ledger_id: string;
  from_account_id: string;
  to_account_id: string;
  from_amount: number;
  from_currency: string;
  to_amount: number;
  to_currency: string;
  fx_rate: number;
  note?: string | null;
  occurred_at?: string;
};

export function useUpdateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTransferInput) => {
      if (await isLocalLedger(input.ledger_id)) {
        await updateLocalTransfer(input.id, {
          from_account_id: input.from_account_id,
          to_account_id: input.to_account_id,
          from_amount: input.from_amount,
          from_currency: input.from_currency,
          to_amount: input.to_amount,
          to_currency: input.to_currency,
          fx_rate: input.fx_rate,
          note: input.note ?? null,
          occurred_at: input.occurred_at ?? new Date().toISOString(),
        });
      } else {
        const { error } = await supabase.rpc('update_transfer', {
          p_id: input.id,
          p_from_account_id: input.from_account_id,
          p_to_account_id: input.to_account_id,
          p_from_amount: input.from_amount,
          p_from_currency: input.from_currency,
          p_to_amount: input.to_amount,
          p_to_currency: input.to_currency,
          p_fx_rate: input.fx_rate,
          p_note: input.note ?? null,
          p_occurred_at: input.occurred_at ?? new Date().toISOString(),
        });
        if (error) throw error;
        await refreshLedgerTransfers(input.ledger_id);
      }
      await qc.invalidateQueries({ queryKey: ['local-transfers'] });
      await qc.invalidateQueries({ queryKey: ['account-balances'] });
      await qc.refetchQueries({ queryKey: ['local-transfers'] });
    },
  });
}

export function useDeleteTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      if (await isLocalLedger(input.ledger_id)) {
        await deleteLocalTransfer(input.id);
      } else {
        const { error } = await supabase.rpc('delete_transfer', {
          p_id: input.id,
        });
        if (error) throw error;
        await refreshLedgerTransfers(input.ledger_id);
      }
      await qc.invalidateQueries({ queryKey: ['local-transfers'] });
      await qc.invalidateQueries({ queryKey: ['account-balances'] });
      await qc.refetchQueries({ queryKey: ['local-transfers'] });
    },
  });
}
