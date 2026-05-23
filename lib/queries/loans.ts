import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getLocalLoanRepaidTotals,
  listLocalLoanRepayments,
  listLocalLoans,
} from '../db/loans';
import { refreshLedgerLoans } from '../sync/loans';
import { supabase } from '../supabase/client';

/**
 * Loans CRUD + repayment log.
 *
 * Reads come from the local SQLite mirror (offline-safe). Writes go
 * through SECURITY DEFINER RPCs (`create_loan` etc.); each mutation
 * re-pulls loans + repayments and invalidates the query keys. Repayments
 * are a separate log — they don't create transactions or move balances.
 */

export type LoanKind = 'lent' | 'borrowed';

export type Loan = {
  id: string;
  ledger_id: string;
  kind: LoanKind;
  counterparty: string | null;
  principal: number;
  currency: string | null;
  started_at: string | null;
  due_date: string | null;
  status: string; // 'open' | 'settled'
  settled_at: string | null;
  note: string | null;
};

export type LoanRepayment = {
  id: string;
  loan_id: string;
  ledger_id: string;
  amount: number;
  occurred_at: string;
  note: string | null;
  _sync_state: string;
};

export function useLoans(ledgerId: string | undefined) {
  return useQuery<Loan[]>({
    queryKey: ['local-loans', ledgerId],
    queryFn: async () => {
      const rows = await listLocalLoans(ledgerId!);
      return rows.map((r) => ({
        id: r.id,
        ledger_id: r.ledger_id,
        kind: r.kind,
        counterparty: r.counterparty,
        principal: r.principal,
        currency: r.currency,
        started_at: r.started_at,
        due_date: r.due_date,
        status: r.status,
        settled_at: r.settled_at,
        note: r.note,
      }));
    },
    enabled: !!ledgerId,
  });
}

/** Map of loan_id → total repaid for the ledger. */
export function useLoanRepaidTotals(ledgerId: string | undefined) {
  return useQuery<Map<string, number>>({
    queryKey: ['loan-repaid', ledgerId],
    queryFn: () => getLocalLoanRepaidTotals(ledgerId!),
    enabled: !!ledgerId,
  });
}

export function useLoanRepayments(loanId: string | undefined) {
  return useQuery<LoanRepayment[]>({
    queryKey: ['local-loan-repayments', loanId],
    queryFn: async () => {
      const rows = await listLocalLoanRepayments(loanId!);
      return rows.map((r) => ({
        id: r.id,
        loan_id: r.loan_id,
        ledger_id: r.ledger_id,
        amount: r.amount,
        occurred_at: r.occurred_at,
        note: r.note,
        _sync_state: r._sync_state,
      }));
    },
    enabled: !!loanId,
  });
}

export type NewLoanInput = {
  ledger_id: string;
  kind: LoanKind;
  counterparty: string;
  principal: number;
  currency: string;
  started_at?: string | null;
  due_date?: string | null;
  note?: string | null;
};

export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewLoanInput) => {
      const { data, error } = await supabase.rpc('create_loan', {
        p_kind: input.kind,
        p_counterparty: input.counterparty,
        p_principal: input.principal,
        p_currency: input.currency,
        p_started_at: input.started_at ?? null,
        p_due_date: input.due_date ?? null,
        p_note: input.note ?? null,
        p_ledger_id: input.ledger_id,
      });
      if (error) throw error;
      await refreshLedgerLoans(input.ledger_id);
      await invalidateLoans(qc);
      return data as string;
    },
  });
}

export type UpdateLoanInput = {
  id: string;
  ledger_id: string;
  kind: LoanKind;
  counterparty: string;
  principal: number;
  currency: string;
  started_at: string | null;
  due_date: string | null;
  note: string | null;
};

export function useUpdateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateLoanInput) => {
      const { error } = await supabase.rpc('update_loan', {
        p_id: input.id,
        p_kind: input.kind,
        p_counterparty: input.counterparty,
        p_principal: input.principal,
        p_currency: input.currency,
        p_started_at: input.started_at,
        p_due_date: input.due_date,
        p_note: input.note,
      });
      if (error) throw error;
      await refreshLedgerLoans(input.ledger_id);
      await invalidateLoans(qc);
    },
  });
}

export function useSetLoanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      ledger_id: string;
      status: 'open' | 'settled';
    }) => {
      const { error } = await supabase.rpc('set_loan_status', {
        p_id: input.id,
        p_status: input.status,
      });
      if (error) throw error;
      await refreshLedgerLoans(input.ledger_id);
      await invalidateLoans(qc);
    },
  });
}

export function useDeleteLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_loan', { p_id: input.id });
      if (error) throw error;
      await refreshLedgerLoans(input.ledger_id);
      await invalidateLoans(qc);
    },
  });
}

export function useAddLoanRepayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      loan_id: string;
      ledger_id: string;
      amount: number;
      note?: string | null;
      occurred_at?: string;
    }) => {
      const { data, error } = await supabase.rpc('add_loan_repayment', {
        p_loan_id: input.loan_id,
        p_amount: input.amount,
        p_occurred_at: input.occurred_at ?? new Date().toISOString(),
        p_note: input.note ?? null,
      });
      if (error) throw error;
      await refreshLedgerLoans(input.ledger_id);
      await invalidateLoans(qc);
      return data as string;
    },
  });
}

export function useDeleteLoanRepayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ledger_id: string }) => {
      const { error } = await supabase.rpc('delete_loan_repayment', {
        p_id: input.id,
      });
      if (error) throw error;
      await refreshLedgerLoans(input.ledger_id);
      await invalidateLoans(qc);
    },
  });
}

async function invalidateLoans(
  qc: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await qc.invalidateQueries({ queryKey: ['local-loans'] });
  await qc.invalidateQueries({ queryKey: ['loan-repaid'] });
  await qc.invalidateQueries({ queryKey: ['local-loan-repayments'] });
  await qc.refetchQueries({ queryKey: ['local-loans'] });
  await qc.refetchQueries({ queryKey: ['loan-repaid'] });
}
