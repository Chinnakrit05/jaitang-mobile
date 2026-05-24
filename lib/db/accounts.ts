import { getDb } from './client';
import type { LocalAccount } from '../sync/accounts';

export type LocalAccountRow = LocalAccount;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type AccountType = 'cash' | 'bank' | 'credit_card' | 'e_wallet';

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──

export type NewLocalAccount = {
  ledger_id: string;
  name: string;
  type: AccountType;
  icon?: string | null;
  color?: string | null;
  initial_balance?: number;
  currency?: string | null;
};

/** Create an account on-device (client UUID, `pending_create`). */
export async function createLocalAccount(input: NewLocalAccount): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO accounts (
      id, ledger_id, name, type, icon, color, initial_balance, currency,
      archived, created_at, updated_at, deleted_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.name,
      input.type,
      input.icon ?? null,
      input.color ?? null,
      input.initial_balance ?? 0,
      input.currency ?? null,
      now,
      now,
    ],
  );
  return id;
}

/** Update an account on-device (keeps a never-pushed row as pending_create). */
export async function updateLocalAccount(
  id: string,
  patch: {
    name: string;
    type: AccountType;
    icon: string | null;
    color: string | null;
    initial_balance: number;
    currency: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE accounts
       SET name=?, type=?, icon=?, color=?, initial_balance=?, currency=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [
      patch.name,
      patch.type,
      patch.icon,
      patch.color,
      patch.initial_balance,
      patch.currency,
      now,
      id,
    ],
  );
}

/** Toggle archived on-device. */
export async function setLocalAccountArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE accounts
       SET archived=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [archived ? 1 : 0, now, id],
  );
}

/**
 * Delete an account on-device. A never-pushed row is hard-removed; an
 * already-synced row is soft-deleted (tombstone). Either way, local
 * transactions that referenced it have their `account_id` cleared (mirrors
 * the server's `delete_account`, which nulls the FK).
 */
export async function deleteLocalAccount(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ _sync_state: string }>(
    `SELECT _sync_state FROM accounts WHERE id=?`,
    [id],
  );
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE transactions SET account_id=NULL WHERE account_id=?`,
      [id],
    );
    if (row?._sync_state === 'pending_create') {
      await db.runAsync(`DELETE FROM accounts WHERE id=?`, [id]);
    } else {
      await db.runAsync(
        `UPDATE accounts SET deleted_at=?, updated_at=?, _sync_state='pending_delete' WHERE id=?`,
        [now, now, id],
      );
    }
  });
}

export async function listLocalAccounts(
  ledgerId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<LocalAccountRow[]> {
  const db = await getDb();
  if (opts.includeArchived) {
    return db.getAllAsync<LocalAccountRow>(
      `SELECT * FROM accounts
       WHERE ledger_id = ? AND deleted_at IS NULL
       ORDER BY archived ASC, created_at DESC`,
      [ledgerId],
    );
  }
  return db.getAllAsync<LocalAccountRow>(
    `SELECT * FROM accounts
     WHERE ledger_id = ? AND deleted_at IS NULL AND archived = 0
     ORDER BY created_at DESC`,
    [ledgerId],
  );
}

/**
 * Compute the current balance of every account in a ledger, expressed
 * in each account's OWN currency. Returns a `Map<account_id, balance>`
 * so callers can render the list and balances in one render cycle.
 *
 * Per-transaction native amount for an account in currency X:
 *   - if the tx carries a foreign trio in X (`fx_currency === X`), use
 *     `fx_amount` (the value actually recorded in X);
 *   - otherwise use `amount`, which holds the home-currency value — and
 *     for a home-currency account that IS the native value.
 * This is exact for the dominant case (one currency per account, foreign
 * spends tagged with their fx trio). A genuine currency mismatch (e.g. a
 * THB-only tx logged against a JPY account) falls back to `amount` and
 * is left as a known edge case rather than guessing a conversion.
 *
 * Transfers move money between accounts in each side's own currency:
 * the source loses `from_amount` (from_currency), the destination gains
 * `to_amount` (to_currency) — already native, so they're applied as-is.
 *
 * `initial_balance` is stored in the account's currency. Account rows
 * with no activity still appear, at their bare initial balance.
 */
export async function getLocalAccountBalances(
  ledgerId: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const accounts = await db.getAllAsync<{
    id: string;
    initial_balance: number;
    currency: string | null;
  }>(
    `SELECT id, initial_balance, currency FROM accounts
     WHERE ledger_id = ? AND deleted_at IS NULL`,
    [ledgerId],
  );
  const currencyByAccount = new Map<string, string | null>();
  for (const a of accounts) currencyByAccount.set(a.id, a.currency);

  // Per-transaction rows (not a SQL GROUP BY) so we can pick the native
  // amount based on each account's currency vs the tx's fx trio.
  const txRows = await db.getAllAsync<{
    account_id: string;
    kind: 'income' | 'expense';
    amount: number;
    fx_currency: string | null;
    fx_amount: number | null;
  }>(
    `SELECT account_id, kind, amount, fx_currency, fx_amount
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND account_id IS NOT NULL`,
    [ledgerId],
  );
  const sumByAccount = new Map<string, number>();
  for (const r of txRows) {
    const acctCurrency = currencyByAccount.get(r.account_id);
    const native =
      r.fx_currency && r.fx_amount != null && r.fx_currency === acctCurrency
        ? Number(r.fx_amount)
        : Number(r.amount);
    const signed = r.kind === 'income' ? native : -native;
    sumByAccount.set(
      r.account_id,
      (sumByAccount.get(r.account_id) ?? 0) + (signed || 0),
    );
  }

  // Transfer deltas: outflow from the source, inflow to the destination
  // — each already in its own account's currency.
  const transfers = await db.getAllAsync<{
    from_account_id: string | null;
    to_account_id: string | null;
    from_amount: number;
    to_amount: number;
  }>(
    `SELECT from_account_id, to_account_id, from_amount, to_amount
     FROM transfers
     WHERE ledger_id = ?`,
    [ledgerId],
  );
  for (const tr of transfers) {
    if (tr.from_account_id) {
      sumByAccount.set(
        tr.from_account_id,
        (sumByAccount.get(tr.from_account_id) ?? 0) - (Number(tr.from_amount) || 0),
      );
    }
    if (tr.to_account_id) {
      sumByAccount.set(
        tr.to_account_id,
        (sumByAccount.get(tr.to_account_id) ?? 0) + (Number(tr.to_amount) || 0),
      );
    }
  }

  const out = new Map<string, number>();
  for (const a of accounts) {
    out.set(
      a.id,
      Number(a.initial_balance ?? 0) + (sumByAccount.get(a.id) ?? 0),
    );
  }
  return out;
}
