import { supabase } from '../supabase/client';
import { getDb } from '../db/client';

/**
 * Transfers pull. Same shape as `pullTrips` / `pullRecurring` —
 * replace-all per call because the server table has no `deleted_at`
 * tombstone column for an incremental cursor to follow. Transfer rows
 * are small (a typical user records a handful a month) so re-pulling the
 * whole set per ledger is negligible.
 *
 * Writes go through SECURITY DEFINER RPCs (`create_transfer` etc.), then
 * the mutation hook calls `refreshLedgerTransfers` to pull the fresh set
 * straight back so the UI updates without waiting for the next polling
 * tick — same pattern as accounts / trips.
 */

export type LocalTransfer = {
  id: string;
  ledger_id: string;
  user_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  from_amount: number;
  from_currency: string | null;
  to_amount: number;
  to_currency: string | null;
  fx_rate: number | null;
  note: string | null;
  occurred_at: string;
  created_at: string | null;
  updated_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

export async function pullTransfers(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  // Read through the SECURITY DEFINER `list_transfers` RPC rather than a
  // direct `from('transfers').select()`. The `transfers` table may have
  // RLS enabled with no SELECT policy for the mobile (`authenticated`)
  // user — the web reads it via a service-role key — so a direct select
  // would return zero rows. The RPC bypasses RLS and filters by ledger
  // membership itself.
  const { data, error } = await supabase.rpc('list_transfers', {
    p_ledger_ids: opts.ledgerIds,
  });
  if (error) throw error;

  await replaceTransfersForLedgers(
    opts.ledgerIds,
    (data ?? []) as Array<Omit<LocalTransfer, '_sync_state' | 'updated_at'>>,
  );
  return { pulled: data?.length ?? 0 };
}

export async function refreshLedgerTransfers(
  ledgerId: string,
): Promise<{ pulled: number }> {
  return pullTransfers({ ledgerIds: [ledgerId] });
}

async function replaceTransfersForLedgers(
  ledgerIds: string[],
  rows: Array<Omit<LocalTransfer, '_sync_state' | 'updated_at'>>,
) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const lid of ledgerIds) {
      await db.runAsync(`DELETE FROM transfers WHERE ledger_id = ?`, [lid]);
    }
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO transfers (
          id, ledger_id, user_id, from_account_id, to_account_id,
          from_amount, from_currency, to_amount, to_currency, fx_rate,
          note, occurred_at, created_at, updated_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'clean')`,
        [
          r.id,
          r.ledger_id,
          r.user_id,
          r.from_account_id,
          r.to_account_id,
          Number(r.from_amount),
          r.from_currency,
          Number(r.to_amount),
          r.to_currency,
          r.fx_rate === null || r.fx_rate === undefined
            ? null
            : Number(r.fx_rate),
          r.note,
          r.occurred_at,
          r.created_at,
        ],
      );
    }
  });
}
