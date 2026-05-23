-- ─────────────────────────────────────────────────────────────────────
-- Transfers: SECURITY DEFINER RPCs for the mobile app
--
-- Run this in the Supabase SQL editor. These functions let signed-in
-- users create / update / delete cross-account transfers in any ledger
-- they belong to, without each call passing through the per-table RLS
-- the web app bypasses with a service-role key.
--
-- All functions check `auth.uid()` against `ledger_members` themselves,
-- so RLS on `transfers` can stay strict (or absent) without blocking the
-- mobile client.
--
-- A transfer moves money between two accounts and is NOT income/expense.
--   • same-currency: from_amount == to_amount, currencies match, rate 1
--   • cross-currency: to_amount = from_amount × fx_rate, currencies differ
--
-- The `transfers` table has no `deleted_at`, so delete_transfer hard-
-- deletes (matching the web app + trips/recurring). The mobile mirror
-- pulls transfers with replace-all semantics, so a hard-deleted row
-- simply doesn't come back on the next pull.
-- ─────────────────────────────────────────────────────────────────────

-- ── create_transfer ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_transfer(
  uuid, uuid, uuid, numeric, text, numeric, text, numeric, text, timestamptz
);

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_ledger_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_from_amount numeric,
  p_from_currency text,
  p_to_amount numeric,
  p_to_currency text,
  p_fx_rate numeric,
  p_note text,
  p_occurred_at timestamptz
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

  INSERT INTO public.transfers (
    ledger_id, user_id, from_account_id, to_account_id,
    from_amount, from_currency, to_amount, to_currency, fx_rate,
    note, occurred_at
  ) VALUES (
    p_ledger_id,
    v_user_id,
    p_from_account_id,
    p_to_account_id,
    p_from_amount,
    p_from_currency,
    p_to_amount,
    p_to_currency,
    COALESCE(p_fx_rate, 1),
    p_note,
    COALESCE(p_occurred_at, now())
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transfer(
  uuid, uuid, uuid, numeric, text, numeric, text, numeric, text, timestamptz
) TO authenticated;


-- ── update_transfer ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_transfer(
  uuid, uuid, uuid, numeric, text, numeric, text, numeric, text, timestamptz
);

CREATE OR REPLACE FUNCTION public.update_transfer(
  p_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_from_amount numeric,
  p_from_currency text,
  p_to_amount numeric,
  p_to_currency text,
  p_fx_rate numeric,
  p_note text,
  p_occurred_at timestamptz
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

  SELECT ledger_id INTO v_ledger_id FROM public.transfers WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  UPDATE public.transfers SET
    from_account_id = p_from_account_id,
    to_account_id = p_to_account_id,
    from_amount = p_from_amount,
    from_currency = p_from_currency,
    to_amount = p_to_amount,
    to_currency = p_to_currency,
    fx_rate = COALESCE(p_fx_rate, 1),
    note = p_note,
    occurred_at = COALESCE(p_occurred_at, occurred_at)
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_transfer(
  uuid, uuid, uuid, numeric, text, numeric, text, numeric, text, timestamptz
) TO authenticated;


-- ── delete_transfer ──────────────────────────────────────────────────
-- Hard delete (no `deleted_at` on this table). The mobile mirror is
-- replace-all so the row won't reappear on the next pull.
DROP FUNCTION IF EXISTS public.delete_transfer(uuid);

CREATE OR REPLACE FUNCTION public.delete_transfer(p_id uuid)
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

  SELECT ledger_id INTO v_ledger_id FROM public.transfers WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  DELETE FROM public.transfers WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_transfer(uuid) TO authenticated;


-- ── list_transfers (read path) ───────────────────────────────────────
-- The mobile pull reads through this SECURITY DEFINER function instead of
-- `from('transfers').select()` so it bypasses RLS — same as the write
-- RPCs. `transfers` is a new table for mobile and may have RLS enabled
-- with no SELECT policy for the `authenticated` role (the web reads it
-- via a service-role key), which would make a direct select return zero
-- rows. Filtering by ledger membership here keeps it safe.
DROP FUNCTION IF EXISTS public.list_transfers(uuid[]);

CREATE OR REPLACE FUNCTION public.list_transfers(p_ledger_ids uuid[])
RETURNS SETOF public.transfers
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.*
  FROM public.transfers t
  WHERE t.ledger_id = ANY(p_ledger_ids)
    AND EXISTS (
      SELECT 1 FROM public.ledger_members m
      WHERE m.ledger_id = t.ledger_id AND m.user_id = auth.uid()
    )
  ORDER BY t.occurred_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_transfers(uuid[]) TO authenticated;
