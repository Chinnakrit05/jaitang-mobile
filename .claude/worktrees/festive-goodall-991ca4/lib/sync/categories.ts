import { supabase } from '../supabase/client';
import { getDb, getSyncState, setSyncState } from '../db/client';

/**
 * Pull categories for a known set of ledgers using the standard
 * `updated_at > since` cursor. Soft-deleted rows arrive with
 * `deleted_at` populated and the local mirror picks up the tombstone.
 *
 * Write path is still online-only (form actions hit Supabase directly).
 * Adding pending_create/update support means mirroring what
 * `pushTransactions` does, plus handling the parent_id constraint
 * locally — left out of this phase to keep the diff small.
 */

const LAST_PULL_KEY = 'categories.last_pulled_at';

export type LocalCategory = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  kind: 'income' | 'expense';
  sort_order: number;
  parent_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

const COLUMNS =
  'id, ledger_id, name, icon, color, kind, sort_order, parent_id, created_at, updated_at, deleted_at';

export async function pullCategories(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };
  const since = (await getSyncState(LAST_PULL_KEY)) ?? '1970-01-01T00:00:00Z';
  const cursor = new Date().toISOString();

  const { data, error } = await supabase
    .from('categories')
    .select(COLUMNS)
    .in('ledger_id', opts.ledgerIds)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (error) throw error;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const r of data ?? []) {
      await db.runAsync(
        `INSERT INTO categories (
          id, ledger_id, name, icon, color, kind, sort_order, parent_id,
          created_at, updated_at, deleted_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
        ON CONFLICT(id) DO UPDATE SET
          ledger_id=excluded.ledger_id,
          name=excluded.name,
          icon=excluded.icon,
          color=excluded.color,
          kind=excluded.kind,
          sort_order=excluded.sort_order,
          parent_id=excluded.parent_id,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at,
          deleted_at=excluded.deleted_at,
          _sync_state='clean'
        `,
        [
          r.id,
          r.ledger_id,
          r.name,
          r.icon,
          r.color,
          r.kind,
          r.sort_order,
          r.parent_id,
          r.created_at,
          r.updated_at,
          r.deleted_at,
        ],
      );
    }
  });

  await setSyncState(LAST_PULL_KEY, cursor);
  return { pulled: data?.length ?? 0 };
}
