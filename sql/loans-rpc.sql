-- ─────────────────────────────────────────────────────────────────────
-- Loans (money lent / borrowed): SECURITY DEFINER RPCs for the mobile app
--
-- Run this in the Supabase SQL editor. Same pattern as goals/accounts:
-- every function checks `auth.uid()` against `ledger_members`, and reads
-- go through SECURITY DEFINER functions (`list_loans`,
-- `list_loan_repayments`) so they bypass any RLS that has no SELECT
-- policy for the mobile `authenticated` user.
--
-- `loans` + `loan_repayments` have no `deleted_at` (hard delete), so the
-- mobile mirror is replace-all.
--
-- NOTE: `loans.kind` ('lent'/'borrowed') and `loans.status`
-- ('open'/'settled') are treated as TEXT. If they are Postgres enums in
-- your schema, add the cast (e.g. p_kind::loan_kind) — HANDOFF only lists
-- enum casts for tx_kind / recur_period / ledger_role, so text is assumed.
-- ─────────────────────────────────────────────────────────────────────

-- ── create_loan ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_loan(text, text, numeric, text, date, date, text, uuid);

CREATE OR REPLACE FUNCTION public.create_loan(
  p_kind text,
  p_counterparty text,
  p_principal numeric,
  p_currency text,
  p_started_at date,
  p_due_date date,
  p_note text,
  p_ledger_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = p_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  INSERT INTO public.loans (
    ledger_id, user_id, kind, counterparty, principal, currency,
    started_at, due_date, status, note
  ) VALUES (
    p_ledger_id, v_user_id, p_kind, p_counterparty, p_principal, p_currency,
    COALESCE(p_started_at, CURRENT_DATE), p_due_date, 'open', p_note
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_loan(text, text, numeric, text, date, date, text, uuid) TO authenticated;


-- ── update_loan ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_loan(uuid, text, text, numeric, text, date, date, text);

CREATE OR REPLACE FUNCTION public.update_loan(
  p_id uuid,
  p_kind text,
  p_counterparty text,
  p_principal numeric,
  p_currency text,
  p_started_at date,
  p_due_date date,
  p_note text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ledger_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT ledger_id INTO v_ledger_id FROM public.loans WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  UPDATE public.loans SET
    kind = p_kind,
    counterparty = p_counterparty,
    principal = p_principal,
    currency = p_currency,
    started_at = COALESCE(p_started_at, started_at),
    due_date = p_due_date,
    note = p_note
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_loan(uuid, text, text, numeric, text, date, date, text) TO authenticated;


-- ── set_loan_status ──────────────────────────────────────────────────
-- 'settled' stamps settled_at = now(); 'open' clears it.
DROP FUNCTION IF EXISTS public.set_loan_status(uuid, text);

CREATE OR REPLACE FUNCTION public.set_loan_status(
  p_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ledger_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT ledger_id INTO v_ledger_id FROM public.loans WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  UPDATE public.loans SET
    status = p_status,
    settled_at = CASE WHEN p_status = 'settled' THEN now() ELSE NULL END
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_loan_status(uuid, text) TO authenticated;


-- ── delete_loan ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.delete_loan(uuid);

CREATE OR REPLACE FUNCTION public.delete_loan(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ledger_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT ledger_id INTO v_ledger_id FROM public.loans WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  DELETE FROM public.loan_repayments WHERE loan_id = p_id;
  DELETE FROM public.loans WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_loan(uuid) TO authenticated;


-- ── add_loan_repayment ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_loan_repayment(uuid, numeric, timestamptz, text);

CREATE OR REPLACE FUNCTION public.add_loan_repayment(
  p_loan_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ledger_id uuid;
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT ledger_id INTO v_ledger_id FROM public.loans WHERE id = p_loan_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  INSERT INTO public.loan_repayments (loan_id, amount, occurred_at, note)
  VALUES (p_loan_id, p_amount, COALESCE(p_occurred_at, now()), p_note)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_loan_repayment(uuid, numeric, timestamptz, text) TO authenticated;


-- ── delete_loan_repayment ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.delete_loan_repayment(uuid);

CREATE OR REPLACE FUNCTION public.delete_loan_repayment(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ledger_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT l.ledger_id INTO v_ledger_id
  FROM public.loan_repayments lr
  JOIN public.loans l ON l.id = lr.loan_id
  WHERE lr.id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Repayment not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  DELETE FROM public.loan_repayments WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_loan_repayment(uuid) TO authenticated;


-- ── list_loans (read path) ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.list_loans(uuid[]);

CREATE OR REPLACE FUNCTION public.list_loans(p_ledger_ids uuid[])
RETURNS SETOF public.loans
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.*
  FROM public.loans l
  WHERE l.ledger_id = ANY(p_ledger_ids)
    AND EXISTS (
      SELECT 1 FROM public.ledger_members m
      WHERE m.ledger_id = l.ledger_id AND m.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_loans(uuid[]) TO authenticated;


-- ── list_loan_repayments (read path) ─────────────────────────────────
DROP FUNCTION IF EXISTS public.list_loan_repayments(uuid[]);

CREATE OR REPLACE FUNCTION public.list_loan_repayments(p_ledger_ids uuid[])
RETURNS TABLE (
  id uuid,
  loan_id uuid,
  ledger_id uuid,
  amount numeric,
  occurred_at timestamptz,
  note text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lr.id, lr.loan_id, l.ledger_id, lr.amount, lr.occurred_at, lr.note,
         lr.created_at
  FROM public.loan_repayments lr
  JOIN public.loans l ON l.id = lr.loan_id
  WHERE l.ledger_id = ANY(p_ledger_ids)
    AND EXISTS (
      SELECT 1 FROM public.ledger_members m
      WHERE m.ledger_id = l.ledger_id AND m.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_loan_repayments(uuid[]) TO authenticated;
