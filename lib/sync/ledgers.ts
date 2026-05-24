import { supabase } from '../supabase/client';
import { getDb, getSyncState, setSyncState } from '../db/client';

/**
 * Ledger pull.
 *
 * Mirrors `listLedgersForUser` from the web app: two queries (one for
 * ledgers the user owns, one for shared ledgers via `ledger_members!inner`)
 * merged into the local mirror. Each row carries a resolved `role`
 * column so screens don't have to re-join.
 *
 * Why no incremental cursor here:
 * - The OR of "owned + member-joined" doesn't compose cleanly with a
 *   single `updated_at > since` filter (a ledger you were just added to
 *   could have an older `updated_at` than the cursor and slip through).
 * - Ledgers count is tiny (single digits per user in practice), so a
 *   full re-pull every cycle is cheap.
 *
 * The pull does honor `deleted_at` — soft-deleted rows on the server
 * arrive with `deleted_at` populated and the local row picks up the
 * tombstone, hiding it from `useLocalLedgers` immediately.
 */

const LAST_PULL_KEY = 'ledgers.last_pulled_at';

export type LocalLedger = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string;
  owner_id: string;
  is_personal: number; // SQLite bool
  role: 'owner' | 'editor' | 'viewer';
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  // Local-first: 'local' ledgers never sync; 'synced' ledgers push/pull.
  sync_mode: 'local' | 'synced';
  promoted_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

type RawLedger = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string | null;
  owner_id: string;
  is_personal: boolean;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export async function pullLedgers(): Promise<{ pulled: number }> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return { pulled: 0 };

  // Owned — straight select.
  const owned = await supabase
    .from('ledgers')
    .select(
      'id, name, icon, color, currency, owner_id, is_personal, created_at, updated_at, deleted_at',
    )
    .eq('owner_id', userId);
  if (owned.error) throw owned.error;

  // Shared — join through ledger_members. We include soft-deleted ledger
  // rows on purpose so the local cache picks up tombstones and drops them.
  const shared = await supabase
    .from('ledger_members')
    .select(
      'role, ledgers!inner(id, name, icon, color, currency, owner_id, is_personal, created_at, updated_at, deleted_at)',
    )
    .eq('user_id', userId);
  if (shared.error) throw shared.error;

  const merged = new Map<string, LocalLedger>();
  for (const l of (owned.data ?? []) as RawLedger[]) {
    merged.set(l.id, toLocal(l, 'owner'));
  }
  for (const row of shared.data ?? []) {
    const lRaw = (row as { ledgers: RawLedger | RawLedger[] }).ledgers;
    const l = Array.isArray(lRaw) ? lRaw[0] : lRaw;
    if (!l) continue;
    // Owner row already in — skip (you can't be both owner and member of
    // the same ledger via ledger_members in practice, but be defensive).
    if (merged.has(l.id)) continue;
    merged.set(
      l.id,
      toLocal(l, (row as { role: LocalLedger['role'] }).role),
    );
  }

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const r of merged.values()) {
      await db.runAsync(
        // Anything coming back from the cloud is by definition synced. We
        // never downgrade a row to 'local' here, and we don't touch
        // `promoted_at` (not a server column).
        `INSERT INTO ledgers (
          id, name, icon, color, currency, owner_id, is_personal, role,
          created_at, updated_at, deleted_at, sync_mode, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', 'clean')
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          icon=excluded.icon,
          color=excluded.color,
          currency=excluded.currency,
          owner_id=excluded.owner_id,
          is_personal=excluded.is_personal,
          role=excluded.role,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at,
          deleted_at=excluded.deleted_at,
          sync_mode='synced',
          _sync_state='clean'
        `,
        [
          r.id,
          r.name,
          r.icon,
          r.color,
          r.currency,
          r.owner_id,
          r.is_personal,
          r.role,
          r.created_at,
          r.updated_at,
          r.deleted_at,
        ],
      );
    }
  });

  await setSyncState(LAST_PULL_KEY, new Date().toISOString());
  return { pulled: merged.size };
}

function toLocal(l: RawLedger, role: LocalLedger['role']): LocalLedger {
  return {
    id: l.id,
    name: l.name,
    icon: l.icon,
    color: l.color,
    currency: l.currency ?? 'THB',
    owner_id: l.owner_id,
    is_personal: l.is_personal ? 1 : 0,
    role,
    created_at: l.created_at,
    updated_at: l.updated_at,
    deleted_at: l.deleted_at,
    sync_mode: 'synced',
    promoted_at: null,
    _sync_state: 'clean',
  };
}
