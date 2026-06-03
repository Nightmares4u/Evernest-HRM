-- =========================================================
-- 0022 — Phase 2A/2D multi-table writes → atomic RPCs
--
-- Backfills the §14 "RPC-first" transaction policy onto pre-existing
-- compensation-pattern actions:
--   A-2  recordClientPayment            → crm_record_client_payment
--   A-8  setMilestoneStatus             → crm_set_milestone_status
--   A-9  updateClientStatusWithActivity → crm_update_client_status_with_activity
--   A-10 ensureClientMilestonesSeeded   → crm_seed_client_milestones
--
-- Permissions stay in TypeScript callers. These functions guard data
-- integrity only (existence, terminal-state, expected-from-status,
-- input validation).
-- =========================================================

CREATE OR REPLACE FUNCTION public.crm_record_client_payment(
  p_client_id uuid,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_method text,
  p_reference text,
  p_notes text,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.crm_client_status;
  v_currency text;
  v_payment_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = 'P0001';
  END IF;
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Payment date/time is required' USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(p_method, '') IS NULL THEN
    RAISE EXCEPTION 'Payment method is required' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status IN ('alumni', 'withdrawn_refunded') THEN
    RAISE EXCEPTION 'Cannot record a payment against a % client', v_status USING ERRCODE = 'P0001';
  END IF;

  v_currency := COALESCE(NULLIF(p_currency, ''), 'PKR');

  INSERT INTO public.crm_client_payments (
    client_id,
    amount,
    currency,
    paid_at,
    method,
    reference,
    notes,
    recorded_by_user_id
  )
  VALUES (
    p_client_id,
    p_amount,
    v_currency,
    p_paid_at,
    p_method,
    NULLIF(p_reference, ''),
    NULLIF(p_notes, ''),
    p_actor_user_id
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    p_client_id,
    'payment_recorded',
    p_actor_user_id,
    format('Payment recorded: %s %s.', v_currency, p_amount),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'currency', v_currency,
      'paid_at', p_paid_at,
      'method', p_method,
      'reference', NULLIF(p_reference, '')
    )
  );

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_set_milestone_status(
  p_milestone_id uuid,
  p_to_status public.crm_client_milestone_status,
  p_due_at timestamptz,
  p_note text,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_id uuid;
  v_milestone_code text;
  v_from_status public.crm_client_milestone_status;
  v_client_status public.crm_client_status;
BEGIN
  SELECT m.client_id, m.milestone_code, m.status
    INTO v_client_id, v_milestone_code, v_from_status
  FROM public.crm_client_country_milestones m
  WHERE m.id = p_milestone_id
  FOR UPDATE;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Milestone % not found', p_milestone_id USING ERRCODE = 'P0002';
  END IF;

  SELECT status INTO v_client_status
  FROM public.crm_clients
  WHERE id = v_client_id
  FOR UPDATE;

  IF v_client_status IN ('alumni', 'withdrawn_refunded') THEN
    RAISE EXCEPTION 'Cannot modify milestones on a % client', v_client_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_client_country_milestones
  SET status = p_to_status,
      due_at = p_due_at,
      notes = p_note,
      completed_at = CASE WHEN p_to_status = 'done' THEN now() ELSE NULL END,
      completed_by_user_id = CASE WHEN p_to_status = 'done' THEN p_actor_user_id ELSE NULL END
  WHERE id = p_milestone_id;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    v_client_id,
    'milestone_status_changed',
    p_actor_user_id,
    format('Milestone %s changed from %s to %s.', v_milestone_code, v_from_status, p_to_status),
    jsonb_build_object(
      'milestone_id', p_milestone_id,
      'milestone_code', v_milestone_code,
      'from_status', v_from_status,
      'to_status', p_to_status,
      'note', p_note
    )
  );

  RETURN v_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_update_client_status_with_activity(
  p_client_id uuid,
  p_expected_from_status public.crm_client_status,
  p_to_status public.crm_client_status,
  p_activity_type text,
  p_note text,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_from_status public.crm_client_status;
BEGIN
  IF p_activity_type NOT IN ('client_status_changed', 'client_status_rolled_back') THEN
    RAISE EXCEPTION 'Invalid activity_type % for status transition', p_activity_type USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_from_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_from_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_from_status IN ('alumni', 'withdrawn_refunded') THEN
    RAISE EXCEPTION 'Cannot transition a % client', v_from_status USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_from_status IS NOT NULL AND v_from_status <> p_expected_from_status THEN
    RAISE EXCEPTION 'Client status changed; expected % but is %', p_expected_from_status, v_from_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_clients
  SET status = p_to_status,
      updated_at = now()
  WHERE id = p_client_id;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    p_client_id,
    p_activity_type,
    p_actor_user_id,
    format('Client status changed from %s to %s.', v_from_status, p_to_status),
    jsonb_build_object(
      'from', v_from_status,
      'to', p_to_status,
      'note', p_note,
      'reason', CASE WHEN p_activity_type = 'client_status_rolled_back' THEN p_note ELSE NULL END
    )
  );

  RETURN p_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_seed_client_milestones(
  p_client_id uuid,
  p_country text,
  p_candidate_codes text[],
  p_actor_user_id uuid
) RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted text[];
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'Client id is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_country IS NULL OR p_country = '' THEN
    RAISE EXCEPTION 'Country is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_candidate_codes IS NULL OR array_length(p_candidate_codes, 1) IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  PERFORM 1 FROM public.crm_clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;

  WITH ins AS (
    INSERT INTO public.crm_client_country_milestones (client_id, milestone_code)
    SELECT p_client_id, code
    FROM unnest(p_candidate_codes) AS code
    ON CONFLICT (client_id, milestone_code) DO NOTHING
    RETURNING milestone_code
  )
  SELECT COALESCE(array_agg(milestone_code), ARRAY[]::text[]) INTO v_inserted FROM ins;

  IF array_length(v_inserted, 1) IS NOT NULL THEN
    INSERT INTO public.crm_client_activities (
      client_id,
      activity_type,
      actor_user_id,
      description,
      payload
    )
    VALUES (
      p_client_id,
      'milestones_seeded',
      p_actor_user_id,
      format('Country milestones seeded for %s.', p_country),
      jsonb_build_object(
        'country', p_country,
        'codes', to_jsonb(v_inserted)
      )
    );
  END IF;

  RETURN v_inserted;
END;
$$;
