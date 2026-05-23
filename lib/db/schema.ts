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
 * Phase A covered `transactions`. Phase D added the read-mostly trio
 * `categories`, `accounts`, `ledgers`; v5 adds monthly budgets. These
 * mirrors are pull-only for now (writes still hit Supabase directly
 * until a phase wires up the push paths).
 */

const SCHEMA_VERSION = 8;

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

  // ---- v4: trips mirror (pull-only, replace-all) ----
  // Trips are scoped to a ledger and tag transactions. Like recurring,
  // the server table doesn't carry `deleted_at` (uses hard DELETE), so
  // the pull replaces local rows for the synced ledgers.
  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    currency TEXT,
    starts_at TEXT,
    ends_at TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trips_ledger ON trips(ledger_id, archived, starts_at DESC)`,

  // ---- v5: monthly budgets mirror (pull-only) ----
  `CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL,
    period TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_ledger_period ON budgets(ledger_id, period) WHERE deleted_at IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique_active ON budgets(ledger_id, category_id, period) WHERE deleted_at IS NULL`,

  // ---- v6: transfers mirror (pull-only, replace-all) ----
  // Cross-account money moves (cash → bank, bank → e-wallet, and
  // cross-currency variants). NOT income/expense — kept out of the
  // transactions table so they don't double-count in spend totals.
  //
  // The server `transfers` table has no `deleted_at` (it hard-deletes,
  // same as trips / recurring), so the pull replaces local rows for the
  // synced ledgers each cycle. `updated_at` is also absent server-side —
  // the local column exists for parity but is never populated.
  //
  // Same-currency transfer: from_amount == to_amount, from_currency ==
  // to_currency, fx_rate = 1. Cross-currency: to_amount = from_amount ×
  // fx_rate, currencies differ.
  `CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    user_id TEXT,
    from_account_id TEXT,
    to_account_id TEXT,
    from_amount REAL NOT NULL,
    from_currency TEXT,
    to_amount REAL NOT NULL,
    to_currency TEXT,
    fx_rate REAL,
    note TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transfers_ledger ON transfers(ledger_id, occurred_at DESC)`,

  // ---- v7: goals + goal_contributions mirror (pull-only, replace-all) ----
  // Savings targets and their contribution log. Contributions are a
  // SEPARATE ledger of deposits toward a goal — they do NOT touch the
  // transactions table or account balances (matches the web app).
  //
  // Neither server table has `deleted_at` (hard delete, like trips), so
  // the pull is replace-all per ledger. `goal_contributions` denormalizes
  // `ledger_id` (resolved server-side via the parent goal) so the mirror
  // can wipe-and-replace per ledger without a local join.
  `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    target_amount REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_goals_ledger ON goals(ledger_id, archived, created_at)`,

  `CREATE TABLE IF NOT EXISTS goal_contributions (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    user_id TEXT,
    amount REAL NOT NULL,
    note TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal ON goal_contributions(goal_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_goal_contrib_ledger ON goal_contributions(ledger_id)`,

  // ---- v8: loans + loan_repayments mirror (pull-only, replace-all) ----
  // Money lent to / borrowed from someone, with a partial-repayment log.
  // outstanding = principal − Σ repayments. Like trips, no `deleted_at`
  // server-side → replace-all pull. `loan_repayments` denormalizes
  // `ledger_id` (resolved server-side via the parent loan) for per-ledger
  // wipe-and-replace without a local join.
  `CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    user_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('lent','borrowed')),
    counterparty TEXT,
    principal REAL NOT NULL DEFAULT 0,
    currency TEXT,
    started_at TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    settled_at TEXT,
    note TEXT,
    created_at TEXT,
    updated_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loans_ledger ON loans(ledger_id, status, created_at)`,

  `CREATE TABLE IF NOT EXISTS loan_repayments (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL,
    ledger_id TEXT NOT NULL,
    amount REAL NOT NULL,
    occurred_at TEXT NOT NULL,
    note TEXT,
    created_at TEXT,
    _sync_state TEXT NOT NULL DEFAULT 'clean'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loan_repay_loan ON loan_repayments(loan_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_loan_repay_ledger ON loan_repayments(ledger_id)`,
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
