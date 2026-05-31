-- =========================================================
-- 0021 - CRM refund policy hardening
--
-- Refunds are only valid after a client has been withdrawn/refunded.
-- Alumni is a successful terminal state and must never accept refunds.
-- =========================================================

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
  v_status public.crm_client_status;
  v_refund_id uuid;
  v_currency text;
  v_actor_role public.user_role;
  v_actor_is_active boolean;
BEGIN
  SELECT role, is_active INTO v_actor_role, v_actor_is_active
  FROM public.app_users
  WHERE id = p_actor_user_id;

  IF v_actor_role <> 'super_admin' OR v_actor_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Only active super admins can record refunds' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_status
  FROM public.crm_clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Client % not found', p_client_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'withdrawn_refunded' THEN
    RAISE EXCEPTION 'Refunds can only be recorded for withdrawn/refunded clients; current status is %', v_status USING ERRCODE = 'P0001';
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
