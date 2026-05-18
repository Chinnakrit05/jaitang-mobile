import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listLocalTrips } from '../db/trips';
import { refreshLedgerTrips } from '../sync/trips';
import { supabase } from '../supabase/client';

/**
 * Trip CRUD + queries.
 *
 * Reads come from the local SQLite mirror so the screen works offline.
 * Writes go through SECURITY DEFINER Postgres functions (`create_trip`
 * etc.) to bypass the trips-table RLS in one server-side hop.
 *
 * "Active" trip selection lives in `ActiveTripProvider` — a single
 * AsyncStorage-backed pointer per ledger. The query layer here only
 * deals with the trip rows themselves.
 */

export type Trip = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string | null;
  starts_at: string | null;
  ends_at: string | null;
  archived: boolean;
};

export function useTrips(ledgerId: string | undefined) {
  return useQuery<Trip[]>({
    queryKey: ['local-trips', ledgerId],
    queryFn: async () => {
      const rows = await listLocalTrips(ledgerId!);
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        currency: r.currency,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        archived: r.archived === 1,
      }));
    },
    enabled: !!ledgerId,
  });
}

export type NewTripInput = {
  ledger_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  currency?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTripInput) => {
      const { data, error } = await supabase.rpc('create_trip', {
        p_ledger_id: input.ledger_id,
        p_name: input.name,
        p_icon: input.icon ?? null,
        p_color: input.color ?? null,
        p_currency: input.currency ?? null,
        p_starts_at: input.starts_at ?? null,
        p_ends_at: input.ends_at ?? null,
      });
      if (error) throw error;
      await refreshLedgerTrips(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-trips'] });
      await qc.refetchQueries({ queryKey: ['local-trips'] });
      return data as string;
    },
  });
}

export type UpdateTripInput = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTripInput) => {
      const { error } = await supabase.rpc('update_trip', {
        p_id: input.id,
        p_name: input.name,
        p_icon: input.icon,
        p_color: input.color,
        p_currency: input.currency,
        p_starts_at: input.starts_at,
        p_ends_at: input.ends_at,
      });
      if (error) throw error;
      await refreshLedgerTrips(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-trips'] });
      await qc.refetchQueries({ queryKey: ['local-trips'] });
    },
  });
}

export function useSetTripArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      ledger_id: string;
      archived: boolean;
    }) => {
      const { error } = await supabase.rpc('set_trip_archived', {
        p_id: input.id,
        p_archived: input.archived,
      });
      if (error) throw error;
      await refreshLedgerTrips(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-trips'] });
      await qc.refetchQueries({ queryKey: ['local-trips'] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_trip', { p_id: input.id });
      if (error) throw error;
      await refreshLedgerTrips(input.ledger_id);
      await qc.invalidateQueries({ queryKey: ['local-trips'] });
      await qc.refetchQueries({ queryKey: ['local-trips'] });
      // Transactions that referenced this trip now have trip_id = NULL
      // server-side; invalidate so the local tx cache picks that up on
      // the next pull tick.
      await qc.invalidateQueries({ queryKey: ['local-tx'] });
    },
  });
}
