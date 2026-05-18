import { supabase } from '../supabase/client';
import { getDb } from '../db/client';

/**
 * Trips pull. Same shape as `pullRecurring` — replace-all per call
 * because the server table has no `deleted_at` tombstone column for
 * incremental sync to follow. Trip rows are small (typical user has
 * < 10 trips) so the cost is negligible.
 */

export type LocalTrip = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string | null;
  starts_at: string | null;
  ends_at: string | null;
  archived: number; // SQLite bool
  created_at: string | null;
  updated_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

// `updated_at` is not on the server table (same as recurring) — leave
// the local column nullable and never populate it from the pull.
const COLUMNS =
  'id, ledger_id, name, icon, color, currency, starts_at, ends_at, archived, created_at';

export async function pullTrips(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  const { data, error } = await supabase
    .from('trips')
    .select(COLUMNS)
    .in('ledger_id', opts.ledgerIds);
  if (error) throw error;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const lid of opts.ledgerIds) {
      await db.runAsync(`DELETE FROM trips WHERE ledger_id = ?`, [lid]);
    }
    for (const r of data ?? []) {
      await db.runAsync(
        `INSERT INTO trips (
          id, ledger_id, name, icon, color, currency,
          starts_at, ends_at, archived,
          created_at, updated_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'clean')`,
        [
          r.id,
          r.ledger_id,
          r.name,
          r.icon,
          r.color,
          r.currency,
          r.starts_at,
          r.ends_at,
          r.archived ? 1 : 0,
          r.created_at,
        ],
      );
    }
  });

  return { pulled: data?.length ?? 0 };
}

export async function refreshLedgerTrips(
  ledgerId: string,
): Promise<{ pulled: number }> {
  return pullTrips({ ledgerIds: [ledgerId] });
}
