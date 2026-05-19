-- ─────────────────────────────────────────────────────────────────────
-- Budgets: SECURITY DEFINER RPCs for the mobile app
--
-- Period is stored as the backend `budget_period` enum (`month`,
-- etc.). Each active budget is unique by ledger_id + category_id +
-- period. The current web table does not expose `deleted_at`, so delete
-- is a hard delete.
--
-- The web schema uses the `budget_period` enum for budgets.period, so
-- this RPC accepts text from the mobile client and casts it explicitly.
-- ─────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_budget(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.upsert_budget(
  p_ledger_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_period text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_period budget_period := p_period::budget_period;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Budget amount must be greater than zero';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = p_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = p_category_id
      AND ledger_id = p_ledger_id
      AND kind = 'expense'
      AND parent_id IS NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Budget category must be a top-level expense category';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.budgets
  WHERE ledger_id = p_ledger_id
    AND category_id = p_category_id
    AND period = v_period
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.budgets
    SET amount = p_amount,
        updated_at = now()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.budgets (
    ledger_id, category_id, amount, period
  ) VALUES (
    p_ledger_id, p_category_id, p_amount, v_period
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_budget(uuid, uuid, numeric, text) TO authenticated;


DROP FUNCTION IF EXISTS public.delete_budget(uuid);

CREATE OR REPLACE FUNCTION public.delete_budget(p_id uuid)
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

  SELECT ledger_id INTO v_ledger_id FROM public.budgets WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Budget not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  DELETE FROM public.budgets WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_budget(uuid) TO authenticated;
