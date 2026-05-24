import { getDb } from './client';
import type { LocalTrip } from '../sync/trips';

export type LocalTripRow = LocalTrip;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──
//
// `trips` has no `deleted_at` column server-side (hard DELETE). A `local`
// ledger's rows are all `pending_create` (never pushed), so deletes just
// hard-remove the row — nothing to tombstone.

export type NewLocalTrip = {
  ledger_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  currency?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

/** Create a trip on-device (client UUID, `pending_create`). */
export async function createLocalTrip(input: NewLocalTrip): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO trips (
      id, ledger_id, name, icon, color, currency,
      starts_at, ends_at, archived, created_at, updated_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.currency ?? null,
      input.starts_at ?? null,
      input.ends_at ?? null,
      now,
      now,
    ],
  );
  return id;
}

/** Update a trip on-device (keeps a never-pushed row as pending_create). */
export async function updateLocalTrip(
  id: string,
  patch: {
    name: string;
    icon: string | null;
    color: string | null;
    currency: string | null;
    starts_at: string | null;
    ends_at: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE trips
       SET name=?, icon=?, color=?, currency=?, starts_at=?, ends_at=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [
      patch.name,
      patch.icon,
      patch.color,
      patch.currency,
      patch.starts_at,
      patch.ends_at,
      now,
      id,
    ],
  );
}

/** Toggle archived on-device. */
export async function setLocalTripArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE trips
       SET archived=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [archived ? 1 : 0, now, id],
  );
}

/**
 * Delete a trip on-device. Hard delete — no server tombstone. Local
 * transactions that tagged this trip have their `trip_id` cleared (mirrors
 * the server's `delete_trip`, which nulls the FK).
 */
export async function deleteLocalTrip(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE transactions SET trip_id=NULL WHERE trip_id=?`, [id]);
    await db.runAsync(`DELETE FROM trips WHERE id=?`, [id]);
  });
}

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
