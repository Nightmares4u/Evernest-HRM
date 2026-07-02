-- =========================================================
-- 0028 — Keep invoice step detail_status in sync with status
--
-- Bug: crm_apply_invoice_step_payment only auto-filled detail_status
-- when it was empty. Flipping a step due → paid kept the stale "Due"
-- text (the edit form re-submits the old label), so the printable
-- invoice showed "Due" for paid steps.
--
-- Fix: treat the auto labels (Due / Paid / Waived, any casing) as
-- system-managed — overwrite them whenever the step status changes.
-- Genuinely custom text (e.g. "Partial", "Adjusted") is preserved.
-- =========================================================

CREATE OR REPLACE FUNCTION public.crm_apply_invoice_step_payment(
  p_step_id uuid,
  p_status public.crm_client_invoice_step_status,
  p_paid_at timestamptz,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_step public.crm_client_invoice_steps%ROWTYPE;
  v_invoice public.crm_client_invoices%ROWTYPE;
  v_client_status public.crm_client_status;
  v_payment_id uuid;
  v_amount numeric(12,2);
  v_paid_at timestamptz;
BEGIN
  SELECT * INTO v_step
  FROM public.crm_client_invoice_steps
  WHERE id = p_step_id
  FOR UPDATE;

  IF v_step.id IS NULL THEN
    RAISE EXCEPTION 'Invoice step % not found', p_step_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_invoice
  FROM public.crm_client_invoices
  WHERE id = v_step.invoice_id
  FOR UPDATE;

  SELECT status INTO v_client_status
  FROM public.crm_clients
  WHERE id = v_invoice.client_id
  FOR UPDATE;

  IF v_client_status IN ('alumni', 'withdrawn_refunded') THEN
    RAISE EXCEPTION 'Cannot update invoice payments for a % client', v_client_status USING ERRCODE = 'P0001';
  END IF;
  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'Cannot update payments on a void invoice' USING ERRCODE = 'P0001';
  END IF;

  v_amount := v_step.quantity * v_step.unit_price;
  v_paid_at := COALESCE(p_paid_at, now());

  IF p_status = 'paid' THEN
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Paid invoice step amount must be greater than zero' USING ERRCODE = 'P0001';
    END IF;

    IF v_step.payment_id IS NULL THEN
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
        v_invoice.client_id,
        v_amount,
        'PKR',
        v_paid_at,
        'invoice_step_paid',
        COALESCE(v_step.detail_label, v_invoice.invoice_number || '-' || lpad(v_step.line_order::text, 2, '0')),
        v_step.description,
        p_actor_user_id
      )
      RETURNING id INTO v_payment_id;
    ELSE
      UPDATE public.crm_client_payments
      SET amount = v_amount,
          currency = 'PKR',
          paid_at = v_paid_at,
          method = 'invoice_step_paid',
          reference = COALESCE(v_step.detail_label, v_invoice.invoice_number || '-' || lpad(v_step.line_order::text, 2, '0')),
          notes = v_step.description,
          recorded_by_user_id = p_actor_user_id
      WHERE id = v_step.payment_id
      RETURNING id INTO v_payment_id;
    END IF;

    UPDATE public.crm_client_invoice_steps
    SET status = 'paid',
        paid_at = v_paid_at,
        payment_id = v_payment_id,
        detail_status = CASE
          WHEN detail_status IS NULL
            OR btrim(detail_status) = ''
            OR lower(btrim(detail_status)) IN ('due', 'paid', 'waived')
          THEN 'Paid'
          ELSE detail_status
        END
    WHERE id = v_step.id;

    INSERT INTO public.crm_client_activities (
      client_id,
      activity_type,
      actor_user_id,
      description,
      payload
    )
    VALUES (
      v_invoice.client_id,
      'invoice_step_paid',
      p_actor_user_id,
      format('Invoice step paid: %s PKR %s.', v_step.description, v_amount),
      jsonb_build_object(
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'step_id', v_step.id,
        'payment_id', v_payment_id,
        'amount', v_amount,
        'currency', 'PKR'
      )
    );

    RETURN v_payment_id;
  END IF;

  IF v_step.payment_id IS NOT NULL THEN
    v_payment_id := v_step.payment_id;
    UPDATE public.crm_client_invoice_steps
    SET payment_id = NULL,
        paid_at = NULL
    WHERE id = v_step.id;
    DELETE FROM public.crm_client_payments WHERE id = v_payment_id;
  END IF;

  UPDATE public.crm_client_invoice_steps
  SET status = p_status,
      paid_at = NULL,
      detail_status = CASE
        WHEN detail_status IS NULL
          OR btrim(detail_status) = ''
          OR lower(btrim(detail_status)) IN ('due', 'paid', 'waived')
        THEN CASE WHEN p_status = 'waived' THEN 'Waived' ELSE 'Due' END
        ELSE detail_status
      END
  WHERE id = v_step.id;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    v_invoice.client_id,
    'invoice_step_status_changed',
    p_actor_user_id,
    format('Invoice step marked %s: %s.', p_status, v_step.description),
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'step_id', v_step.id,
      'status', p_status
    )
  );

  RETURN NULL;
END;
$$;

-- Data fix: normalize stale auto labels on existing rows so exports
-- immediately reflect the real step status. Custom text is untouched.
UPDATE public.crm_client_invoice_steps
SET detail_status = CASE status
  WHEN 'paid' THEN 'Paid'
  WHEN 'waived' THEN 'Waived'
  ELSE 'Due'
END
WHERE detail_status IS NULL
   OR btrim(detail_status) = ''
   OR lower(btrim(detail_status)) IN ('due', 'paid', 'waived');
