import { useMutation, useQueryClient } from '@tanstack/react-query';

import { pullLedgers } from '../sync/ledgers';
import { supabase } from '../supabase/client';

/**
 * Invite codes for sharing a ledger with another user.
 *
 * Writes (`create_invite`, `accept_invite`) go through SECURITY DEFINER
 * Postgres functions so the membership / role checks happen server-side
 * and we don't have to expose the `invites` table to direct writes.
 *
 * `acceptInvite` returns the joined ledger id; the screen calling it is
 * expected to switch the active ledger and pull data for it.
 */

export type CreateInviteInput = {
  ledger_id: string;
  role?: 'editor' | 'viewer';
  max_uses?: number;
  expires_days?: number;
};

export type CreateInviteResult = {
  code: string;
  expires_at: string | null;
};

export function useCreateInvite() {
  return useMutation({
    mutationFn: async (
      input: CreateInviteInput,
    ): Promise<CreateInviteResult> => {
      const { data, error } = await supabase.rpc('create_invite', {
        p_ledger_id: input.ledger_id,
        p_role: input.role ?? 'editor',
        p_max_uses: input.max_uses ?? 1,
        p_expires_days: input.expires_days ?? 7,
      });
      if (error) throw error;
      // RPC returns TABLE(code, expires_at) → supabase-js gives us an array
      const row = Array.isArray(data) ? data[0] : data;
      return {
        code: row?.code as string,
        expires_at: (row?.expires_at as string | null) ?? null,
      };
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_invite', {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      // Refresh ledger list so the newly-joined book shows up.
      await pullLedgers();
      await qc.invalidateQueries({ queryKey: ['local-ledgers'] });
      await qc.refetchQueries({ queryKey: ['local-ledgers'] });
      return data as string;
    },
  });
}
