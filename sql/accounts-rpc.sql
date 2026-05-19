-- ─────────────────────────────────────────────────────────────────────
-- Accounts: SECURITY DEFINER RPCs for the mobile app
--
-- Run this in the Supabase SQL editor. These functions let signed-in
-- users create / update / archive / delete accounts in any ledger they
-- belong to, without each call passing through the per-table RLS that
-- the web app relies on a service-role key to bypass.
--
-- All functions check `auth.uid()` against `ledger_members` themselves,
-- so RLS on `accounts` can stay strict (or absent) without blocking the
-- mobile client.
-- ─────────────────────────────────────────────────────────────────────

-- ── create_account ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_account(
  uuid, text, text, text, text, numeric, text
);

CREATE OR REPLACE FUNCTION public.create_account(
  p_ledger_id uuid,
  p_name text,
  p_type text,
  p_icon text,
  p_color text,
  p_initial_balance numeric,
  p_currency text
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

  INSERT INTO public.accounts (
    ledger_id, name, type, icon, color, initial_balance, currency, archived
  ) VALUES (
    p_ledger_id,
    p_name,
    p_type,
    p_icon,
    p_color,
    COALESCE(p_initial_balance, 0),
    p_currency,
    false
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_account(
  uuid, text, text, text, text, numeric, text
) TO authenticated;


-- ── update_account ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_account(
  uuid, text, text, text, text, numeric, text
);

CREATE OR REPLACE FUNCTION public.update_account(
  p_id uuid,
  p_name text,
  p_type text,
  p_icon text,
  p_color text,
  p_initial_balance numeric,
  p_currency text
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

  SELECT ledger_id INTO v_ledger_id FROM public.accounts WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  UPDATE public.accounts SET
    name = p_name,
    type = p_type,
    icon = p_icon,
    color = p_color,
    initial_balance = COALESCE(p_initial_balance, 0),
    currency = p_currency
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_account(
  uuid, text, text, text, text, numeric, text
) TO authenticated;


-- ── set_account_archived ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_account_archived(uuid, boolean);

CREATE OR REPLACE FUNCTION public.set_account_archived(
  p_id uuid,
  p_archived boolean
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

  SELECT ledger_id INTO v_ledger_id FROM public.accounts WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  UPDATE public.accounts SET archived = p_archived WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_account_archived(uuid, boolean) TO authenticated;


-- ── delete_account ───────────────────────────────────────────────────
-- Soft-delete. Also nulls out `account_id` on any transactions that
-- referenced it so those rows don't dangle. (Equivalent to ON DELETE
-- SET NULL, but the delete itself is a soft tombstone.)
DROP FUNCTION IF EXISTS public.delete_account(uuid);

CREATE OR REPLACE FUNCTION public.delete_account(p_id uuid)
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

  SELECT ledger_id INTO v_ledger_id FROM public.accounts WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  -- Detach transactions first so the soft-deleted account doesn't leave
  -- ghost references hanging around.
  UPDATE public.transactions SET account_id = NULL WHERE account_id = p_id;

  UPDATE public.accounts SET deleted_at = now() WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_account(uuid) TO authenticated;
