import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Local SQLite schema — mirrors the Supabase tables the app caches
 * offline plus per-row sync metadata. Each table gets:
 *
 *   - the canonical fields from the server,
 *   - `updated_at` (server-side timestamp, used to drive the pull cursor),
 *   - `deleted_at` (soft delete so the sync engine can propagate
 *     tombstones in either direction),
 *   - `_sync_state` — 'clean' once committed to the server, otherwise
 *     'pending_create' / 'pending_update' / 'pending_delete'. The push
 *     loop scans for non-clean rows and uploads them.
 *
 * Phase A covered `transactions`. Phase D adds the read-mostly trio
 * `categories`, `accounts`, `ledgers` — pull-only for now (writes
 * still hit Supabase directly until a phase wires up the push paths).
 */

const SCHEMA_VERSION = 3;

const STATEMENTS = [
  // Bookkeeping for the sync engine itself.
  `CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    category_id TEXT,
    account_id TEXT,
    trip_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
    amount REAL NOT NULL,
    note TEXT,
    occurred_at TEXT NOT NULL,
    payment_method TEXT,
    fx_currency TEXT,
    fx_amount REAL,
    fx_rate REAL,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,

  `CREATE INDEX IF NOT EXISTS idx_tx_ledger ON transactions(ledger_id, occurred_at DESC) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_tx_pending ON transactions(_sync_state) WHERE _sync_state != 'clean'`,

  // ---- Phase D mirror tables (pull-only) ----
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cat_ledger ON categories(ledger_id, kind, sort_order) WHERE deleted_at IS NULL`,

  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    initial_balance REAL NOT NULL DEFAULT 0,
    currency TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_acc_ledger ON accounts(ledger_id) WHERE deleted_at IS NULL AND archived = 0`,

  // `role` ('owner'|'editor'|'viewer') comes from one of two server-side
  // sources: the row's own `owner_id` (→ 'owner') or the matching
  // `ledger_members.role`. The pull resolves it before insert so callers
  // don't have to join again.
  `CREATE TABLE IF NOT EXISTS ledgers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    currency TEXT NOT NULL DEFAULT 'THB',
    owner_id TEXT NOT NULL,
    is_personal INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_active ON ledgers(is_personal DESC, created_at) WHERE deleted_at IS NULL`,

  // ---- v3: recurring_transactions mirror (pull-only) ----
  // The server table doesn't have `deleted_at` (uses hard DELETE), so
  // pullRecurring does replace-all semantics instead of incremental
  // cursor: it deletes local rows for the synced ledgers and inserts
  // whatever the server returned. Cheap enough — typical user has < 30
  // rules total.
  //
  // `amount` is nullable to support variable-cost mode (bills like
  // utilities where the amount isn't known until the bill arrives).
  `CREATE TABLE IF NOT EXISTS recurring_transactions (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    category_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
    amount REAL,
    note TEXT,
    period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly','yearly')),
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_ledger ON recurring_transactions(ledger_id, active DESC, next_run_at)`,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');
  for (const sql of STATEMENTS) {
    await db.execAsync(sql);
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)`,
    ['schema_version', String(SCHEMA_VERSION)],
  );
}
