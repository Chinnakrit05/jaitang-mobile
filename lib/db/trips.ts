import { getDb } from './client';
import type { LocalTrip } from '../sync/trips';

export type LocalTripRow = LocalTrip;

/**
 * Reads trips for the given ledger. Returns active (non-archived) trips
 * first, then archived — within each group, more-recent first by
 * `starts_at` then `created_at`. Mirrors the order the trips screen
 * expects to render.
 */
export async function listLocalTrips(
  ledgerId: string,
): Promise<LocalTripRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalTripRow>(
    `SELECT * FROM trips
     WHERE ledger_id = ?
     ORDER BY archived ASC, COALESCE(starts_at, created_at) DESC`,
    [ledgerId],
  );
}
