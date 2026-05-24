-- ─────────────────────────────────────────────────────────────────────
-- promote_ledger: one-shot bulk-upload of a LOCAL ledger to the cloud
-- (Local-first Phase 3 — see LOCAL_FIRST_PLAN.md)
--
-- Run this in the Supabase SQL editor.
--
-- A `local` ledger lives only on the device (client UUIDs, never pushed).
-- When the user enables cloud sync (or shares), the mobile client calls
-- this RPC with a JSON snapshot of the ledger + every child entity. The
-- function, in ONE transaction:
--   1. ensures the cloud `ledgers` row + an owner `ledger_members` row
--      exist (using the client-generated ids, so every FK stays stable);
--   2. bulk-inserts every child entity in dependency order, upsert-by-id
--      (`ON CONFLICT (id) DO NOTHING`);
--   3. returns. The client then flips the local ledger to `sync_mode =
--      'synced'` and clears `_sync_state`, and the normal sync loop takes
--      over from there.
--
-- WHY ON CONFLICT DO NOTHING (not DO UPDATE):
--   A promote is a first upload — the rows don't exist server-side yet, so
--   nothing conflicts. DO NOTHING makes the call RESUMABLE: if the client
--   crashes after the server commits but before it marks the local rows
--   clean, re-running promote re-sends everything and the already-present
--   rows are simply skipped. Ongoing edits after promote are handled by the
--   normal sync push/pull, not here.
--
-- WHY jsonb_populate_recordset(null::public.<table>, …):
--   It coerces each JSON field to the table's REAL column type (incl.
--   enums like tx_kind / recur_period / budget_period and date /
--   timestamptz), so this file never has to hard-code enum names. We then
--   SELECT only the columns we want to insert, leaving trigger/default
--   columns (created_at, updated_at) to the server. `ledger_id` and
--   `user_id` are forced to the resolved ledger / caller so a tampered
--   payload can't attach rows elsewhere or spoof authorship.
--
-- SCHEMA ASSUMPTIONS (from HANDOFF.md §2.3 + sql/*-rpc.sql):
--   • goal_contributions and loan_repayments have NO ledger_id column
--     (it's derived via the parent goal/loan) — so they're not inserted
--     with one here.
--   • ledgers has no role/sync_mode/promoted_at columns (those are local).
--   • recurring_transactions / trips / transfers / goals / loans have no
--     deleted_at (hard delete) — irrelevant to insert.
--   If your live schema differs, adjust the column lists below.
-- ─────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.promote_ledger(jsonb);

CREATE OR REPLACE FUNCTION public.promote_ledger(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_ledger    jsonb := p_payload -> 'ledger';
  v_ledger_id uuid := (v_ledger ->> 'id')::uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_ledger IS NULL OR v_ledger_id IS NULL THEN
    RAISE EXCEPTION 'Missing ledger payload';
  END IF;

  -- If the ledger id already exists server-side, the caller must already be
  -- a member — prevents claiming/overwriting someone else's ledger id.
  IF EXISTS (SELECT 1 FROM public.ledgers WHERE id = v_ledger_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ledger_members
      WHERE ledger_id = v_ledger_id AND user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Not a member of this ledger';
    END IF;
  END IF;

  -- 1) Ledger row (client id; caller is the owner).
  INSERT INTO public.ledgers (id, name, icon, color, currency, owner_id, is_personal)
  SELECT id, name, icon, color, COALESCE(currency, 'THB'), v_user_id,
         COALESCE(is_personal, false)
  FROM jsonb_populate_record(null::public.ledgers, v_ledger)
  ON CONFLICT (id) DO NOTHING;

  -- 2) Owner membership.
  INSERT INTO public.ledger_members (ledger_id, user_id, role)
  VALUES (v_ledger_id, v_user_id, 'owner')
  ON CONFLICT (ledger_id, user_id) DO NOTHING;

  -- 3) Children, in dependency order. ledger_id/user_id forced to resolved
  --    values; ids preserved so FKs between these rows stay intact.

  -- categories (parent_id self-FK satisfied within the single statement)
  INSERT INTO public.categories
    (id, ledger_id, name, icon, color, kind, parent_id, sort_order)
  SELECT id, v_ledger_id, name, icon, color, kind, parent_id, sort_order
  FROM jsonb_populate_recordset(null::public.categories,
                                COALESCE(p_payload -> 'categories', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- accounts
  INSERT INTO public.accounts
    (id, ledger_id, name, type, icon, color, initial_balance, currency, archived)
  SELECT id, v_ledger_id, name, type, icon, color,
         COALESCE(initial_balance, 0), currency, COALESCE(archived, false)
  FROM jsonb_populate_recordset(null::public.accounts,
                                COALESCE(p_payload -> 'accounts', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- trips
  INSERT INTO public.trips
    (id, ledger_id, name, icon, color, currency, starts_at, ends_at, archived)
  SELECT id, v_ledger_id, name, icon, color, currency, starts_at, ends_at,
         COALESCE(archived, false)
  FROM jsonb_populate_recordset(null::public.trips,
                                COALESCE(p_payload -> 'trips', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- recurring_transactions
  INSERT INTO public.recurring_transactions
    (id, ledger_id, user_id, category_id, kind, amount, note, period,
     next_run_at, last_run_at, active)
  SELECT id, v_ledger_id, v_user_id, category_id, kind, amount, note, period,
         next_run_at, last_run_at, COALESCE(active, true)
  FROM jsonb_populate_recordset(null::public.recurring_transactions,
                                COALESCE(p_payload -> 'recurring', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- budgets
  INSERT INTO public.budgets (id, ledger_id, category_id, amount, period)
  SELECT id, v_ledger_id, category_id, amount, period
  FROM jsonb_populate_recordset(null::public.budgets,
                                COALESCE(p_payload -> 'budgets', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- transactions
  INSERT INTO public.transactions
    (id, ledger_id, user_id, category_id, account_id, trip_id, kind, amount,
     note, occurred_at, payment_method, fx_currency, fx_amount, fx_rate)
  SELECT id, v_ledger_id, v_user_id, category_id, account_id, trip_id, kind,
         amount, note, occurred_at, payment_method, fx_currency, fx_amount,
         fx_rate
  FROM jsonb_populate_recordset(null::public.transactions,
                                COALESCE(p_payload -> 'transactions', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- transfers
  INSERT INTO public.transfers
    (id, ledger_id, user_id, from_account_id, to_account_id, from_amount,
     from_currency, to_amount, to_currency, fx_rate, note, occurred_at)
  SELECT id, v_ledger_id, v_user_id, from_account_id, to_account_id,
         from_amount, from_currency, to_amount, to_currency, fx_rate, note,
         occurred_at
  FROM jsonb_populate_recordset(null::public.transfers,
                                COALESCE(p_payload -> 'transfers', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- goals
  INSERT INTO public.goals
    (id, ledger_id, name, icon, color, target_amount, deadline, archived)
  SELECT id, v_ledger_id, name, icon, color, COALESCE(target_amount, 0),
         deadline, COALESCE(archived, false)
  FROM jsonb_populate_recordset(null::public.goals,
                                COALESCE(p_payload -> 'goals', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- goal_contributions (no ledger_id column; FK via goal_id)
  INSERT INTO public.goal_contributions
    (id, goal_id, user_id, amount, note, occurred_at)
  SELECT id, goal_id, v_user_id, amount, note, occurred_at
  FROM jsonb_populate_recordset(null::public.goal_contributions,
                                COALESCE(p_payload -> 'goal_contributions', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- loans
  INSERT INTO public.loans
    (id, ledger_id, user_id, kind, counterparty, principal, currency,
     started_at, due_date, status, settled_at, note)
  SELECT id, v_ledger_id, v_user_id, kind, counterparty,
         COALESCE(principal, 0), currency, started_at, due_date,
         COALESCE(status, 'open'), settled_at, note
  FROM jsonb_populate_recordset(null::public.loans,
                                COALESCE(p_payload -> 'loans', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;

  -- loan_repayments (no ledger_id column; FK via loan_id)
  INSERT INTO public.loan_repayments (id, loan_id, amount, occurred_at, note)
  SELECT id, loan_id, amount, occurred_at, note
  FROM jsonb_populate_recordset(null::public.loan_repayments,
                                COALESCE(p_payload -> 'loan_repayments', '[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_ledger(jsonb) TO authenticated;
