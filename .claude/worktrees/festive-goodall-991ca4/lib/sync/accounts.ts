import { supabase } from '../supabase/client';
import { getDb, getSyncState, setSyncState } from '../db/client';

/**
 * Pull accounts for the user's ledgers. Same `updated_at > since`
 * cursor pattern as transactions/categories; soft-deleted rows arrive
 * with `deleted_at` populated.
 *
 * Pull-only — account create / update / delete still go through the
 * web-style action that hits Supabase directly.
 */

const LAST_PULL_KEY = 'accounts.last_pulled_at';

export type LocalAccount = {
  id: string;
  ledger_id: string;
  name: string;
  type: 'cash' | 'bank' | 'credit_card' | 'e_wallet';
  icon: string | null;
  color: string | null;
  initial_balance: number;
  currency: string | null;
  archived: number; // SQLite bool
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

const COLUMNS =
  'id, ledger_id, name, type, icon, color, initial_balance, currency, archived, created_at, updated_at, deleted_at';

export async function pullAccounts(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };
  const since = (await getSyncState(LAST_PULL_KEY)) ?? '1970-01-01T00:00:00Z';
  const cursor = new Date().toISOString();

  const { data, error } = await supabase
    .from('accounts')
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
        `INSERT INTO accounts (
          id, ledger_id, name, type, icon, color, initial_balance,
          currency, archived, created_at, updated_at, deleted_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
        ON CONFLICT(id) DO UPDATE SET
          ledger_id=excluded.ledger_id,
          name=excluded.name,
          type=excluded.type,
          icon=excluded.icon,
          color=excluded.color,
          initial_balance=excluded.initial_balance,
          currency=excluded.currency,
          archived=excluded.archived,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at,
          deleted_at=excluded.deleted_at,
          _sync_state='clean'
        `,
        [
          r.id,
          r.ledger_id,
          r.name,
          r.type,
          r.icon,
          r.color,
          Number(r.initial_balance),
          r.currency,
          r.archived ? 1 : 0,
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
