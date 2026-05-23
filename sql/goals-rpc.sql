-- ─────────────────────────────────────────────────────────────────────
-- Goals (savings targets): SECURITY DEFINER RPCs for the mobile app
--
-- Run this in the Supabase SQL editor.
--
-- Mirrors the accounts/transfers pattern: every function checks
-- `auth.uid()` against `ledger_members` itself so the mobile client never
-- depends on per-table RLS. Reads ALSO go through SECURITY DEFINER
-- functions (`list_goals`, `list_goal_contributions`) because these
-- tables are new to mobile — the web reads them via a service-role key,
-- so they may have RLS enabled with no SELECT policy for `authenticated`,
-- which would make a direct select return zero rows.
--
-- `goals` and `goal_contributions` have no `deleted_at` (hard delete,
-- like trips). The mobile mirror is replace-all, so hard-deleted rows
-- simply don't come back on the next pull.
--
-- Contributions are a SEPARATE log: adding one does NOT create a
-- transaction or move an account balance (matches the web app).
-- ─────────────────────────────────────────────────────────────────────

-- ── create_goal ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_goal(uuid, text, text, text, numeric, date);

CREATE OR REPLACE FUNCTION public.create_goal(
  p_ledger_id uuid,
  p_name text,
  p_icon text,
  p_color text,
  p_target_amount numeric,
  p_deadline date
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

  INSERT INTO public.goals (
    ledger_id, name, icon, color, target_amount, deadline, archived
  ) VALUES (
    p_ledger_id, p_name, p_icon, p_color, p_target_amount, p_deadline, false
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_goal(uuid, text, text, text, numeric, date) TO authenticated;


-- ── update_goal ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_goal(uuid, text, text, text, numeric, date);

CREATE OR REPLACE FUNCTION public.update_goal(
  p_id uuid,
  p_name text,
  p_icon text,
  p_color text,
  p_target_amount numeric,
  p_deadline date
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
  SELECT ledger_id INTO v_ledger_id FROM public.goals WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  UPDATE public.goals SET
    name = p_name,
    icon = p_icon,
    color = p_color,
    target_amount = p_target_amount,
    deadline = p_deadline
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_goal(uuid, text, text, text, numeric, date) TO authenticated;


-- ── set_goal_archived ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_goal_archived(uuid, boolean);

CREATE OR REPLACE FUNCTION public.set_goal_archived(
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
  SELECT ledger_id INTO v_ledger_id FROM public.goals WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  UPDATE public.goals SET archived = p_archived WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_goal_archived(uuid, boolean) TO authenticated;


-- ── delete_goal ──────────────────────────────────────────────────────
-- Hard delete the goal and its contributions.
DROP FUNCTION IF EXISTS public.delete_goal(uuid);

CREATE OR REPLACE FUNCTION public.delete_goal(p_id uuid)
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
  SELECT ledger_id INTO v_ledger_id FROM public.goals WHERE id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  DELETE FROM public.goal_contributions WHERE goal_id = p_id;
  DELETE FROM public.goals WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_goal(uuid) TO authenticated;


-- ── add_goal_contribution ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_goal_contribution(uuid, numeric, text, timestamptz);

CREATE OR REPLACE FUNCTION public.add_goal_contribution(
  p_goal_id uuid,
  p_amount numeric,
  p_note text,
  p_occurred_at timestamptz
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
  SELECT ledger_id INTO v_ledger_id FROM public.goals WHERE id = p_goal_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  INSERT INTO public.goal_contributions (goal_id, user_id, amount, note, occurred_at)
  VALUES (p_goal_id, v_user_id, p_amount, p_note, COALESCE(p_occurred_at, now()))
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_goal_contribution(uuid, numeric, text, timestamptz) TO authenticated;


-- ── delete_goal_contribution ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.delete_goal_contribution(uuid);

CREATE OR REPLACE FUNCTION public.delete_goal_contribution(p_id uuid)
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
  SELECT g.ledger_id INTO v_ledger_id
  FROM public.goal_contributions gc
  JOIN public.goals g ON g.id = gc.goal_id
  WHERE gc.id = p_id;
  IF v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Contribution not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_members
    WHERE ledger_id = v_ledger_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger';
  END IF;

  DELETE FROM public.goal_contributions WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_goal_contribution(uuid) TO authenticated;


-- ── list_goals (read path) ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.list_goals(uuid[]);

CREATE OR REPLACE FUNCTION public.list_goals(p_ledger_ids uuid[])
RETURNS SETOF public.goals
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.*
  FROM public.goals g
  WHERE g.ledger_id = ANY(p_ledger_ids)
    AND EXISTS (
      SELECT 1 FROM public.ledger_members m
      WHERE m.ledger_id = g.ledger_id AND m.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_goals(uuid[]) TO authenticated;


-- ── list_goal_contributions (read path) ──────────────────────────────
-- Returns the goal's ledger_id alongside each contribution so the mobile
-- mirror can do replace-all per ledger without re-joining.
DROP FUNCTION IF EXISTS public.list_goal_contributions(uuid[]);

CREATE OR REPLACE FUNCTION public.list_goal_contributions(p_ledger_ids uuid[])
RETURNS TABLE (
  id uuid,
  goal_id uuid,
  ledger_id uuid,
  user_id uuid,
  amount numeric,
  note text,
  occurred_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gc.id, gc.goal_id, g.ledger_id, gc.user_id, gc.amount, gc.note,
         gc.occurred_at, gc.created_at
  FROM public.goal_contributions gc
  JOIN public.goals g ON g.id = gc.goal_id
  WHERE g.ledger_id = ANY(p_ledger_ids)
    AND EXISTS (
      SELECT 1 FROM public.ledger_members m
      WHERE m.ledger_id = g.ledger_id AND m.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_goal_contributions(uuid[]) TO authenticated;
