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
 * Phase A wires this up for `transactions` only; other tables fall
 * through to direct Supabase calls until Phase D ports them.
 */

const SCHEMA_VERSION = 1;

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
