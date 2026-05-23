import { getDb } from './client';
import type { LocalLoan, LocalLoanRepayment } from '../sync/loans';

export type LocalLoanRow = LocalLoan;
export type LocalLoanRepaymentRow = LocalLoanRepayment;

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
