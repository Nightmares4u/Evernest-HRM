-- =========================================================
-- 0020 - CRM Stage 2 Phase 2E: closure + refunds
--
-- First RPC-first CRM phase. All closure mutations that write activity
-- rows are implemented as Postgres functions for atomicity.
-- =========================================================

DO $$
BEGIN
  CREATE TYPE public.crm_client_visa_decision_outcome AS ENUM (
    'granted',
    'refused',
    'additional_info_requested'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.crm_client_visa_decisions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  outcome                  public.crm_client_visa_decision_outcome NOT NULL,
  decided_at               timestamptz NOT NULL DEFAULT now(),
  note                     text,
  recorded_by_user_id      uuid REFERENCES public.app_users(id),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_client_visa_decisions_client_idx
  ON public.crm_client_visa_decisions(client_id, decided_at DESC);

CREATE TABLE public.crm_client_refunds (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  amount                   numeric(12,2) NOT NULL CHECK (amount > 0),
  currency                 text NOT NULL DEFAULT 'PKR',
  refunded_at              timestamptz NOT NULL DEFAULT now(),
  reason                   text NOT NULL,
  recorded_by_user_id      uuid REFERENCES public.app_users(id),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_client_refunds_client_idx
  ON public.crm_client_refunds(client_id, refunded_at DESC);

ALTER TABLE public.crm_clients
  ADD COLUMN flight_date              timestamptz,
  ADD COLUMN flight_details           text,
  ADD COLUMN accommodation_details    text,
  ADD COLUMN briefing_completed_at    timestamptz,
  ADD COLUMN briefing_notes           text,
  ADD COLUMN departure_date           timestamptz,
  ADD COLUMN arrival_date             timestamptz,
  ADD COLUMN alumni_started_at        timestamptz,
  ADD COLUMN alumni_notes             text,
  ADD COLUMN withdrawn_at             timestamptz,
  ADD COLUMN withdrawn_reason         text;

ALTER TABLE public.crm_client_visa_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_client_refunds ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.crm_record_visa_decision(
  p_client_id uuid,
  p_outcome public.crm_client_visa_decision_outcome,
  p_decided_at timestamptz,
  p_note text,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.crm_client_status;
  v_decision_id uuid;
  v_decided_at timestamptz;
BEGIN
  SELECT status INTO v_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('visa_submitted', 'visa_decision') THEN
    RAISE EXCEPTION 'Cannot record visa decision while client status is %', v_status USING ERRCODE = 'P0001';
  END IF;

  v_decided_at := COALESCE(p_decided_at, now());

  INSERT INTO public.crm_client_visa_decisions (
    client_id,
    outcome,
    decided_at,
    note,
    recorded_by_user_id
  )
  VALUES (
    p_client_id,
    p_outcome,
    v_decided_at,
    NULLIF(p_note, ''),
    p_actor_user_id
  )
  RETURNING id INTO v_decision_id;

  UPDATE public.crm_clients
  SET status = 'visa_decision',
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
    'visa_decision_recorded',
    p_actor_user_id,
    format('Visa decision recorded: %s.', p_outcome),
    jsonb_build_object(
      'decision_id', v_decision_id,
      'outcome', p_outcome,
      'decided_at', v_decided_at,
      'note', NULLIF(p_note, '')
    )
  );

  RETURN v_decision_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_transition_to_pre_departure(
  p_client_id uuid,
  p_note text,
  p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.crm_client_status;
  v_decision_id uuid;
  v_outcome public.crm_client_visa_decision_outcome;
BEGIN
  SELECT status INTO v_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'visa_decision' THEN
    RAISE EXCEPTION 'Cannot move to pre_departure while client status is %', v_status USING ERRCODE = 'P0001';
  END IF;

  SELECT id, outcome INTO v_decision_id, v_outcome
  FROM public.crm_client_visa_decisions
  WHERE client_id = p_client_id
  ORDER BY decided_at DESC, created_at DESC
  LIMIT 1;

  IF v_decision_id IS NULL THEN
    RAISE EXCEPTION 'No visa decision found for client %', p_client_id USING ERRCODE = 'P0001';
  END IF;
  IF v_outcome <> 'granted' THEN
    RAISE EXCEPTION 'Latest visa decision is %, not granted', v_outcome USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_clients
  SET status = 'pre_departure',
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
    'client_transitioned_to_pre_departure',
    p_actor_user_id,
    'Client moved to pre-departure.',
    jsonb_build_object(
      'from', v_status,
      'to', 'pre_departure',
      'latest_decision_id', v_decision_id,
      'note', NULLIF(p_note, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_rollback_to_visa_prep(
  p_client_id uuid,
  p_note text,
  p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.crm_client_status;
  v_decision_id uuid;
  v_outcome public.crm_client_visa_decision_outcome;
BEGIN
  SELECT status INTO v_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'visa_decision' THEN
    RAISE EXCEPTION 'Cannot roll back to visa_prep while client status is %', v_status USING ERRCODE = 'P0001';
  END IF;

  SELECT id, outcome INTO v_decision_id, v_outcome
  FROM public.crm_client_visa_decisions
  WHERE client_id = p_client_id
  ORDER BY decided_at DESC, created_at DESC
  LIMIT 1;

  IF v_decision_id IS NULL THEN
    RAISE EXCEPTION 'No visa decision found for client %', p_client_id USING ERRCODE = 'P0001';
  END IF;
  IF v_outcome NOT IN ('refused', 'additional_info_requested') THEN
    RAISE EXCEPTION 'Latest visa decision is %, not eligible for re-apply rollback', v_outcome USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_clients
  SET status = 'visa_prep',
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
    'client_status_rolled_back_to_visa_prep',
    p_actor_user_id,
    'Client rolled back to visa prep for re-application.',
    jsonb_build_object(
      'from', v_status,
      'to', 'visa_prep',
      'previous_decision_id', v_decision_id,
      'previous_outcome', v_outcome,
      'note', NULLIF(p_note, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_update_pre_departure_fields(
  p_client_id uuid,
  p_flight_date timestamptz,
  p_flight_details text,
  p_accommodation_details text,
  p_briefing_completed_at timestamptz,
  p_briefing_notes text,
  p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_client public.crm_clients%ROWTYPE;
BEGIN
  SELECT * INTO v_client
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_client.status <> 'pre_departure' THEN
    RAISE EXCEPTION 'Cannot update pre-departure fields while client status is %', v_client.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_clients
  SET flight_date = COALESCE(p_flight_date, flight_date),
      flight_details = COALESCE(NULLIF(p_flight_details, ''), flight_details),
      accommodation_details = COALESCE(NULLIF(p_accommodation_details, ''), accommodation_details),
      briefing_completed_at = COALESCE(p_briefing_completed_at, briefing_completed_at),
      briefing_notes = COALESCE(NULLIF(p_briefing_notes, ''), briefing_notes),
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
    'pre_departure_fields_updated',
    p_actor_user_id,
    'Pre-departure fields updated.',
    jsonb_build_object(
      'flight_date', p_flight_date,
      'flight_details', NULLIF(p_flight_details, ''),
      'accommodation_details', NULLIF(p_accommodation_details, ''),
      'briefing_completed_at', p_briefing_completed_at,
      'briefing_notes', NULLIF(p_briefing_notes, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_transition_to_departed(
  p_client_id uuid,
  p_departure_date timestamptz,
  p_note text,
  p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.crm_client_status;
BEGIN
  SELECT status INTO v_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'pre_departure' THEN
    RAISE EXCEPTION 'Cannot mark departed while client status is %', v_status USING ERRCODE = 'P0001';
  END IF;
  IF p_departure_date IS NULL THEN
    RAISE EXCEPTION 'Departure date is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_departure_date > now() THEN
    RAISE EXCEPTION 'Departure date cannot be in the future' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_clients
  SET status = 'departed',
      departure_date = p_departure_date,
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
    'client_transitioned_to_departed',
    p_actor_user_id,
    'Client marked departed.',
    jsonb_build_object(
      'from', v_status,
      'to', 'departed',
      'departure_date', p_departure_date,
      'note', NULLIF(p_note, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_transition_to_alumni(
  p_client_id uuid,
  p_arrival_date timestamptz,
  p_alumni_notes text,
  p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_client public.crm_clients%ROWTYPE;
BEGIN
  SELECT * INTO v_client
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_client.status <> 'departed' THEN
    RAISE EXCEPTION 'Cannot mark alumni while client status is %', v_client.status USING ERRCODE = 'P0001';
  END IF;
  IF p_arrival_date IS NOT NULL AND v_client.departure_date IS NOT NULL AND p_arrival_date < v_client.departure_date THEN
    RAISE EXCEPTION 'Arrival date cannot be before departure date' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_clients
  SET status = 'alumni',
      arrival_date = p_arrival_date,
      alumni_started_at = now(),
      alumni_notes = NULLIF(p_alumni_notes, ''),
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
    'client_transitioned_to_alumni',
    p_actor_user_id,
    'Client marked alumni.',
    jsonb_build_object(
      'from', v_client.status,
      'to', 'alumni',
      'arrival_date', p_arrival_date,
      'alumni_notes', NULLIF(p_alumni_notes, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_withdraw_client(
  p_client_id uuid,
  p_reason text,
  p_refund_amount numeric,
  p_refund_currency text,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.crm_client_status;
  v_refund_id uuid;
  v_currency text;
BEGIN
  SELECT status INTO v_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status IN ('alumni', 'withdrawn_refunded') THEN
    RAISE EXCEPTION 'Cannot withdraw terminal client with status %', v_status USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(p_reason, '') IS NULL THEN
    RAISE EXCEPTION 'Withdrawal reason is required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_clients
  SET status = 'withdrawn_refunded',
      withdrawn_at = now(),
      withdrawn_reason = p_reason,
      updated_at = now()
  WHERE id = p_client_id;

  IF p_refund_amount IS NOT NULL AND p_refund_amount > 0 THEN
    v_currency := COALESCE(NULLIF(p_refund_currency, ''), 'PKR');
    INSERT INTO public.crm_client_refunds (
      client_id,
      amount,
      currency,
      reason,
      recorded_by_user_id
    )
    VALUES (
      p_client_id,
      p_refund_amount,
      v_currency,
      p_reason,
      p_actor_user_id
    )
    RETURNING id INTO v_refund_id;
  END IF;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    p_client_id,
    'client_withdrawn',
    p_actor_user_id,
    'Client withdrawn.',
    jsonb_build_object(
      'previous_status', v_status,
      'reason', p_reason,
      'refund_id', v_refund_id,
      'refund_amount', p_refund_amount,
      'refund_currency', COALESCE(NULLIF(p_refund_currency, ''), 'PKR')
    )
  );

  RETURN v_refund_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_record_client_refund(
  p_client_id uuid,
  p_amount numeric,
  p_currency text,
  p_reason text,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_id uuid;
  v_refund_id uuid;
  v_currency text;
BEGIN
  SELECT id INTO v_client_id
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than zero' USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(p_reason, '') IS NULL THEN
    RAISE EXCEPTION 'Refund reason is required' USING ERRCODE = 'P0001';
  END IF;

  v_currency := COALESCE(NULLIF(p_currency, ''), 'PKR');

  INSERT INTO public.crm_client_refunds (
    client_id,
    amount,
    currency,
    reason,
    recorded_by_user_id
  )
  VALUES (
    p_client_id,
    p_amount,
    v_currency,
    p_reason,
    p_actor_user_id
  )
  RETURNING id INTO v_refund_id;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    p_client_id,
    'client_refund_recorded',
    p_actor_user_id,
    format('Refund recorded: %s %s.', v_currency, p_amount),
    jsonb_build_object(
      'refund_id', v_refund_id,
      'amount', p_amount,
      'currency', v_currency,
      'reason', p_reason
    )
  );

  RETURN v_refund_id;
END;
$$;
