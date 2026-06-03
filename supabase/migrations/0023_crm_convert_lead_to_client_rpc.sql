-- =========================================================
-- 0023 — Atomic lead-to-client conversion
--
-- Creates the client shell, initial advance payment, and client-created
-- activity in one database transaction. CRM financial rows are PKR-only.
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_clients_currency_pkr_only'
  ) THEN
    ALTER TABLE public.crm_clients
      ADD CONSTRAINT crm_clients_currency_pkr_only CHECK (currency = 'PKR') NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_client_payments_currency_pkr_only'
  ) THEN
    ALTER TABLE public.crm_client_payments
      ADD CONSTRAINT crm_client_payments_currency_pkr_only CHECK (currency = 'PKR') NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_client_refunds_currency_pkr_only'
  ) THEN
    ALTER TABLE public.crm_client_refunds
      ADD CONSTRAINT crm_client_refunds_currency_pkr_only CHECK (currency = 'PKR') NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_client_applications_offer_currency_pkr_only'
  ) THEN
    ALTER TABLE public.crm_client_applications
      ADD CONSTRAINT crm_client_applications_offer_currency_pkr_only
      CHECK (offer_amount_currency = 'PKR') NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm_convert_lead_to_client(
  p_lead_id uuid,
  p_target_country text,
  p_target_level text,
  p_agreement_signed_at timestamptz,
  p_advance_paid_at timestamptz,
  p_advance_amount numeric,
  p_total_fee numeric,
  p_actor_user_id uuid
) RETURNS TABLE(client_id uuid, client_code text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead public.crm_leads%ROWTYPE;
  v_actor_role public.user_role;
  v_actor_is_active boolean;
  v_actor_employee_id uuid;
  v_existing_id uuid;
  v_existing_code text;
  v_client_id uuid;
  v_client_code text;
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'Lead id is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_agreement_signed_at IS NULL THEN
    RAISE EXCEPTION 'Agreement signed date/time is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_advance_paid_at IS NULL THEN
    RAISE EXCEPTION 'Advance paid date/time is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_advance_amount IS NULL OR p_advance_amount <= 0 THEN
    RAISE EXCEPTION 'Advance amount must be greater than zero' USING ERRCODE = 'P0001';
  END IF;
  IF p_total_fee IS NOT NULL AND p_total_fee < 0 THEN
    RAISE EXCEPTION 'Total fee must be zero or greater' USING ERRCODE = 'P0001';
  END IF;

  SELECT role, is_active INTO v_actor_role, v_actor_is_active
  FROM public.app_users
  WHERE id = p_actor_user_id;

  IF v_actor_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Active user is required' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_actor_employee_id
  FROM public.employees
  WHERE user_id = p_actor_user_id
  LIMIT 1;

  SELECT * INTO v_lead
  FROM public.crm_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.status <> 'converted' THEN
    RAISE EXCEPTION 'Only converted leads can become clients; current status is %', v_lead.status USING ERRCODE = 'P0001';
  END IF;
  IF v_actor_role <> 'super_admin'
     AND (v_actor_employee_id IS NULL OR v_actor_employee_id <> v_lead.assigned_agent_id) THEN
    RAISE EXCEPTION 'Only the assigned counselor or super admin can convert this lead' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.id, c.client_code INTO v_existing_id, v_existing_code
  FROM public.crm_clients c
  WHERE c.lead_id = p_lead_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, v_existing_code;
    RETURN;
  END IF;

  INSERT INTO public.crm_clients AS c (
    lead_id,
    client_type,
    target_country,
    target_level,
    agreement_signed_at,
    advance_paid_at,
    advance_amount,
    total_fee,
    currency,
    assigned_agent_id,
    branch_id,
    created_by_user_id
  )
  VALUES (
    v_lead.id,
    'student',
    NULLIF(p_target_country, ''),
    NULLIF(p_target_level, ''),
    p_agreement_signed_at,
    p_advance_paid_at,
    p_advance_amount,
    p_total_fee,
    'PKR',
    v_lead.assigned_agent_id,
    v_lead.branch_id,
    p_actor_user_id
  )
  RETURNING c.id, c.client_code INTO v_client_id, v_client_code;

  INSERT INTO public.crm_client_payments (
    client_id,
    amount,
    currency,
    paid_at,
    method,
    reference,
    recorded_by_user_id
  )
  VALUES (
    v_client_id,
    p_advance_amount,
    'PKR',
    p_advance_paid_at,
    'other',
    'Initial advance on conversion',
    p_actor_user_id
  );

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    v_client_id,
    'client_created',
    p_actor_user_id,
    format('Client created from lead %s.', v_lead.customer_phone),
    jsonb_build_object(
      'lead_id', v_lead.id,
      'client_code', v_client_code,
      'advance_amount', p_advance_amount,
      'currency', 'PKR'
    )
  );

  RETURN QUERY SELECT v_client_id, v_client_code;
END;
$$;
