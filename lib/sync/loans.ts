import { supabase } from '../supabase/client';
import { getDb } from '../db/client';

/**
 * Loans + loan_repayments pull. Replace-all per ledger (like goals):
 * neither server table has `deleted_at`. Reads go through the SECURITY
 * DEFINER `list_loans` / `list_loan_repayments` RPCs to bypass RLS (the
 * web reads these via service role, so a direct authenticated select can
 * return zero rows).
 */

export type LocalLoan = {
  id: string;
  ledger_id: string;
  user_id: string | null;
  kind: 'lent' | 'borrowed';
  counterparty: string | null;
  principal: number;
  currency: string | null;
  started_at: string | null;
  due_date: string | null;
  status: string; // 'open' | 'settled'
  settled_at: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

export type LocalLoanRepayment = {
  id: string;
  loan_id: string;
  ledger_id: string;
  amount: number;
  occurred_at: string;
  note: string | null;
  created_at: string | null;
  _sync_state: 'clean' | 'pending_create' | 'pending_update' | 'pending_delete';
};

export async function pullLoans(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  const { data, error } = await supabase.rpc('list_loans', {
    p_ledger_ids: opts.ledgerIds,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<
    Omit<LocalLoan, '_sync_state' | 'updated_at'>
  >;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const lid of opts.ledgerIds) {
      await db.runAsync(`DELETE FROM loans WHERE ledger_id = ?`, [lid]);
    }
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO loans (
          id, ledger_id, user_id, kind, counterparty, principal, currency,
          started_at, due_date, status, settled_at, note,
          created_at, updated_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'clean')`,
        [
          r.id,
          r.ledger_id,
          r.user_id,
          r.kind,
          r.counterparty,
          Number(r.principal) || 0,
          r.currency,
          r.started_at,
          r.due_date,
          r.status ?? 'open',
          r.settled_at,
          r.note,
          r.created_at,
        ],
      );
    }
  });

  return { pulled: rows.length };
}

export async function pullLoanRepayments(opts: {
  ledgerIds: string[];
}): Promise<{ pulled: number }> {
  if (opts.ledgerIds.length === 0) return { pulled: 0 };

  const { data, error } = await supabase.rpc('list_loan_repayments', {
    p_ledger_ids: opts.ledgerIds,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<Omit<LocalLoanRepayment, '_sync_state'>>;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const lid of opts.ledgerIds) {
      await db.runAsync(`DELETE FROM loan_repayments WHERE ledger_id = ?`, [lid]);
    }
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO loan_repayments (
          id, loan_id, ledger_id, amount, occurred_at, note, created_at, _sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'clean')`,
        [
          r.id,
          r.loan_id,
          r.ledger_id,
          Number(r.amount) || 0,
          r.occurred_at,
          r.note,
          r.created_at,
        ],
      );
    }
  });

  return { pulled: rows.length };
}

/** Refresh both loans + repayments for one ledger (used after writes). */
export async function refreshLedgerLoans(
  ledgerId: string,
): Promise<{ pulled: number }> {
  const l = await pullLoans({ ledgerIds: [ledgerId] });
  const r = await pullLoanRepayments({ ledgerIds: [ledgerId] });
  return { pulled: l.pulled + r.pulled };
}
