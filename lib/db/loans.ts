import { getDb } from './client';
import type { LocalLoan, LocalLoanRepayment } from '../sync/loans';

export type LocalLoanRow = LocalLoan;
export type LocalLoanRepaymentRow = LocalLoanRepayment;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──
//
// Neither `loans` nor `loan_repayments` has a `deleted_at` column server-side
// (hard DELETE). A `local` ledger's rows are all `pending_create` (never
// pushed), so deletes just hard-remove the row(s) — nothing to tombstone.
// Deleting a loan also removes its repayments (mirrors the server cascade).

export type NewLocalLoan = {
  ledger_id: string;
  user_id: string;
  kind: 'lent' | 'borrowed';
  counterparty: string;
  principal: number;
  currency: string;
  started_at?: string | null;
  due_date?: string | null;
  note?: string | null;
};

/** Create a loan on-device (client UUID, `pending_create`, status 'open'). */
export async function createLocalLoan(input: NewLocalLoan): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO loans (
      id, ledger_id, user_id, kind, counterparty, principal, currency,
      started_at, due_date, status, settled_at, note,
      created_at, updated_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?, ?, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.user_id,
      input.kind,
      input.counterparty,
      input.principal,
      input.currency,
      input.started_at ?? null,
      input.due_date ?? null,
      input.note ?? null,
      now,
      now,
    ],
  );
  return id;
}

/** Update a loan on-device (keeps a never-pushed row as pending_create). */
export async function updateLocalLoan(
  id: string,
  patch: {
    kind: 'lent' | 'borrowed';
    counterparty: string;
    principal: number;
    currency: string;
    started_at: string | null;
    due_date: string | null;
    note: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE loans
       SET kind=?, counterparty=?, principal=?, currency=?, started_at=?,
           due_date=?, note=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [
      patch.kind,
      patch.counterparty,
      patch.principal,
      patch.currency,
      patch.started_at,
      patch.due_date,
      patch.note,
      now,
      id,
    ],
  );
}

/**
 * Set a loan's status on-device. Settling stamps `settled_at`; reopening
 * clears it — mirrors the server `set_loan_status`.
 */
export async function setLocalLoanStatus(
  id: string,
  status: 'open' | 'settled',
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE loans
       SET status=?, settled_at=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [status, status === 'settled' ? now : null, now, id],
  );
}

/** Delete a loan and its repayments on-device. Hard delete — no tombstone. */
export async function deleteLocalLoan(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM loan_repayments WHERE loan_id=?`, [id]);
    await db.runAsync(`DELETE FROM loans WHERE id=?`, [id]);
  });
}

/** Add a repayment toward a loan on-device (client UUID, `pending_create`). */
export async function addLocalLoanRepayment(input: {
  loan_id: string;
  ledger_id: string;
  amount: number;
  note?: string | null;
  occurred_at?: string;
}): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO loan_repayments (
      id, loan_id, ledger_id, amount, occurred_at, note, created_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_create')`,
    [
      id,
      input.loan_id,
      input.ledger_id,
      input.amount,
      input.occurred_at ?? now,
      input.note ?? null,
      now,
    ],
  );
  return id;
}

/** Delete a loan repayment on-device. Hard delete — no tombstone. */
export async function deleteLocalLoanRepayment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM loan_repayments WHERE id=?`, [id]);
}

export async function listLocalLoans(ledgerId: string): Promise<LocalLoanRow[]> {
  const db = await getDb();
  // Open loans first, then settled; newest within each group.
  return db.getAllAsync<LocalLoanRow>(
    `SELECT * FROM loans WHERE ledger_id = ?
     ORDER BY (status = 'settled') ASC, created_at DESC`,
    [ledgerId],
  );
}

/** Map of loan_id → total repaid (Σ amount) for a ledger. */
export async function getLocalLoanRepaidTotals(
  ledgerId: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ loan_id: string; total: number }>(
    `SELECT loan_id, SUM(amount) AS total
     FROM loan_repayments
     WHERE ledger_id = ?
     GROUP BY loan_id`,
    [ledgerId],
  );
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.loan_id, Number(r.total) || 0);
  return out;
}

export async function listLocalLoanRepayments(
  loanId: string,
): Promise<LocalLoanRepaymentRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalLoanRepaymentRow>(
    `SELECT * FROM loan_repayments WHERE loan_id = ?
     ORDER BY occurred_at DESC`,
    [loanId],
  );
}
