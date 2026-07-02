-- =========================================================
-- 0026 — CRM client invoices
--
-- Adds invoice-first client financials while keeping the existing
-- PKR-only crm_client_payments table as the source for received cash.
-- Paid invoice steps create/link normal payment rows so admin financials
-- continue to aggregate without a reporting rewrite.
-- =========================================================

DO $$
BEGIN
  CREATE TYPE public.crm_client_invoice_status AS ENUM ('draft', 'issued', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_client_invoice_step_status AS ENUM ('due', 'paid', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.crm_client_invoice_seq START 1;

CREATE TABLE IF NOT EXISTS public.crm_client_invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL UNIQUE REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  invoice_number        text NOT NULL UNIQUE DEFAULT (
                          'INV-' ||
                          to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY') ||
                          '-' ||
                          lpad(nextval('public.crm_client_invoice_seq')::text, 4, '0')
                        ),
  file_number           text,
  status                public.crm_client_invoice_status NOT NULL DEFAULT 'issued',
  currency              text NOT NULL DEFAULT 'PKR',
  invoice_date          date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Karachi')::date),
  due_label             text NOT NULL DEFAULT 'Immediate',
  bill_to_name          text,
  bill_to_location      text,
  package_title         text NOT NULL DEFAULT 'Student Services Package',
  office_name           text NOT NULL DEFAULT 'EN Consultants Pvt Ltd',
  office_address        text NOT NULL DEFAULT 'Portway Trade Center office no 912,\nSMCHS Main Shahrah-e-Faisal,\nKarachi – Pakistan',
  office_phone          text NOT NULL DEFAULT 'Landline +92 21 343 03745',
  office_email          text NOT NULL DEFAULT 'evernestconsultant@gmail.com',
  office_website        text NOT NULL DEFAULT 'www.evernestconsultants.com',
  terms                 text NOT NULL DEFAULT 'All payment will be made through Direct Bank Transfer and Cheque in the name of EN Consultants Pvt Ltd',
  footer_note           text NOT NULL DEFAULT 'This is computer generated invoice doesn''t require signature',
  created_by_user_id    uuid REFERENCES public.app_users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_client_invoices_currency_pkr_only CHECK (currency = 'PKR')
);

CREATE INDEX IF NOT EXISTS crm_client_invoices_client_idx
  ON public.crm_client_invoices(client_id);

CREATE TRIGGER crm_client_invoices_touch_updated_at
BEFORE UPDATE ON public.crm_client_invoices
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_client_invoice_steps (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            uuid NOT NULL REFERENCES public.crm_client_invoices(id) ON DELETE CASCADE,
  line_order            int NOT NULL CHECK (line_order > 0),
  description           text NOT NULL,
  quantity              numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price            numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  status                public.crm_client_invoice_step_status NOT NULL DEFAULT 'due',
  detail_label          text,
  detail_status         text,
  paid_at               timestamptz,
  payment_id            uuid UNIQUE REFERENCES public.crm_client_payments(id) ON DELETE SET NULL,
  created_by_user_id    uuid REFERENCES public.app_users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_client_invoice_steps_invoice_order_unique UNIQUE (invoice_id, line_order)
);

CREATE INDEX IF NOT EXISTS crm_client_invoice_steps_invoice_idx
  ON public.crm_client_invoice_steps(invoice_id, line_order);

CREATE INDEX IF NOT EXISTS crm_client_invoice_steps_status_idx
  ON public.crm_client_invoice_steps(status)
  WHERE status IN ('due', 'paid');

CREATE TRIGGER crm_client_invoice_steps_touch_updated_at
BEFORE UPDATE ON public.crm_client_invoice_steps
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

ALTER TABLE public.crm_client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_client_invoice_steps ENABLE ROW LEVEL SECURITY;

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
        detail_status = COALESCE(NULLIF(detail_status, ''), 'Paid')
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
        WHEN p_status = 'waived' THEN COALESCE(NULLIF(detail_status, ''), 'Waived')
        ELSE COALESCE(NULLIF(detail_status, ''), 'Due')
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

CREATE OR REPLACE FUNCTION public.crm_upsert_client_invoice_step(
  p_invoice_id uuid,
  p_step_id uuid,
  p_line_order int,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric,
  p_status public.crm_client_invoice_step_status,
  p_detail_label text,
  p_detail_status text,
  p_paid_at timestamptz,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice public.crm_client_invoices%ROWTYPE;
  v_step_id uuid;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_line_order IS NULL OR p_line_order <= 0 THEN
    RAISE EXCEPTION 'Line order must be greater than zero' USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(p_description, '') IS NULL THEN
    RAISE EXCEPTION 'Step description is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero' USING ERRCODE = 'P0001';
  END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'Unit price must be zero or greater' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_invoice
  FROM public.crm_client_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'Cannot edit a void invoice' USING ERRCODE = 'P0001';
  END IF;

  IF p_step_id IS NULL THEN
    INSERT INTO public.crm_client_invoice_steps (
      invoice_id,
      line_order,
      description,
      quantity,
      unit_price,
      status,
      detail_label,
      detail_status,
      created_by_user_id
    )
    VALUES (
      p_invoice_id,
      p_line_order,
      p_description,
      p_quantity,
      p_unit_price,
      COALESCE(p_status, 'due'),
      NULLIF(p_detail_label, ''),
      NULLIF(p_detail_status, ''),
      p_actor_user_id
    )
    RETURNING id INTO v_step_id;
  ELSE
    UPDATE public.crm_client_invoice_steps
    SET line_order = p_line_order,
        description = p_description,
        quantity = p_quantity,
        unit_price = p_unit_price,
        detail_label = NULLIF(p_detail_label, ''),
        detail_status = NULLIF(p_detail_status, '')
    WHERE id = p_step_id
      AND invoice_id = p_invoice_id
    RETURNING id INTO v_step_id;

    IF v_step_id IS NULL THEN
      RAISE EXCEPTION 'Invoice step % not found for invoice %', p_step_id, p_invoice_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.crm_apply_invoice_step_payment(
    v_step_id,
    COALESCE(p_status, 'due'),
    p_paid_at,
    p_actor_user_id
  );

  RETURN v_step_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_update_client_invoice(
  p_invoice_id uuid,
  p_invoice_number text,
  p_file_number text,
  p_status public.crm_client_invoice_status,
  p_invoice_date date,
  p_due_label text,
  p_bill_to_name text,
  p_bill_to_location text,
  p_package_title text,
  p_terms text,
  p_footer_note text,
  p_actor_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice public.crm_client_invoices%ROWTYPE;
  v_client_status public.crm_client_status;
BEGIN
  SELECT * INTO v_invoice
  FROM public.crm_client_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  SELECT status INTO v_client_status
  FROM public.crm_clients
  WHERE id = v_invoice.client_id
  FOR UPDATE;

  IF v_client_status IN ('alumni', 'withdrawn_refunded') THEN
    RAISE EXCEPTION 'Cannot update the invoice for a % client', v_client_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.crm_client_invoices
  SET invoice_number = COALESCE(NULLIF(p_invoice_number, ''), invoice_number),
      file_number = NULLIF(p_file_number, ''),
      status = COALESCE(p_status, status),
      invoice_date = COALESCE(p_invoice_date, invoice_date),
      due_label = COALESCE(NULLIF(p_due_label, ''), due_label),
      bill_to_name = NULLIF(p_bill_to_name, ''),
      bill_to_location = NULLIF(p_bill_to_location, ''),
      package_title = COALESCE(NULLIF(p_package_title, ''), package_title),
      terms = COALESCE(NULLIF(p_terms, ''), terms),
      footer_note = COALESCE(NULLIF(p_footer_note, ''), footer_note)
  WHERE id = p_invoice_id;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    v_invoice.client_id,
    'invoice_updated',
    p_actor_user_id,
    format('Invoice %s updated.', v_invoice.invoice_number),
    jsonb_build_object('invoice_id', v_invoice.id)
  );

  RETURN p_invoice_id;
END;
$$;

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
  v_invoice_id uuid;
  v_payment_id uuid;
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

  INSERT INTO public.crm_client_invoices (
    client_id,
    invoice_number,
    file_number,
    status,
    currency,
    invoice_date,
    bill_to_name,
    bill_to_location,
    package_title,
    created_by_user_id
  )
  VALUES (
    v_client_id,
    v_client_code || '-01',
    v_client_code,
    'issued',
    'PKR',
    (p_agreement_signed_at AT TIME ZONE 'Asia/Karachi')::date,
    v_lead.customer_name,
    COALESCE(NULLIF(v_lead.city, ''), 'Karachi') || ' - Pakistan',
    COALESCE(NULLIF(p_target_country, ''), 'Student') || ' Services Package',
    p_actor_user_id
  )
  RETURNING id INTO v_invoice_id;

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
    v_client_id,
    p_advance_amount,
    'PKR',
    p_advance_paid_at,
    'invoice_step_paid',
    v_client_code || '-01',
    'Step 1 Registration / Agreement Fees',
    p_actor_user_id
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.crm_client_invoice_steps (
    invoice_id,
    line_order,
    description,
    quantity,
    unit_price,
    status,
    detail_label,
    detail_status,
    paid_at,
    payment_id,
    created_by_user_id
  )
  VALUES (
    v_invoice_id,
    1,
    'Step 1 Registration / Agreement Fees',
    1,
    p_advance_amount,
    'paid',
    v_client_code || '-01',
    'Paid',
    p_advance_paid_at,
    v_payment_id,
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
    format('Client created from lead %s with invoice %s.', v_lead.customer_phone, v_client_code || '-01'),
    jsonb_build_object(
      'lead_id', v_lead.id,
      'client_code', v_client_code,
      'invoice_id', v_invoice_id,
      'advance_amount', p_advance_amount,
      'currency', 'PKR'
    )
  );

  RETURN QUERY SELECT v_client_id, v_client_code;
END;
$$;

INSERT INTO public.crm_client_invoices (
  client_id,
  invoice_number,
  file_number,
  status,
  currency,
  invoice_date,
  bill_to_name,
  bill_to_location,
  package_title,
  created_by_user_id
)
SELECT
  c.id,
  c.client_code || '-01',
  c.client_code,
  'issued',
  'PKR',
  (c.agreement_signed_at AT TIME ZONE 'Asia/Karachi')::date,
  l.customer_name,
  COALESCE(NULLIF(l.city, ''), 'Karachi') || ' - Pakistan',
  COALESCE(NULLIF(c.target_country, ''), 'Student') || ' Services Package',
  c.created_by_user_id
FROM public.crm_clients c
JOIN public.crm_leads l ON l.id = c.lead_id
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO public.crm_client_invoice_steps (
  invoice_id,
  line_order,
  description,
  quantity,
  unit_price,
  status,
  detail_label,
  detail_status,
  paid_at,
  payment_id,
  created_by_user_id
)
SELECT
  i.id,
  1,
  'Step 1 Registration / Agreement Fees',
  1,
  COALESCE(c.advance_amount, 0),
  CASE WHEN p.id IS NULL THEN 'due'::public.crm_client_invoice_step_status ELSE 'paid'::public.crm_client_invoice_step_status END,
  i.invoice_number,
  CASE WHEN p.id IS NULL THEN 'Due' ELSE 'Paid' END,
  p.paid_at,
  p.id,
  c.created_by_user_id
FROM public.crm_client_invoices i
JOIN public.crm_clients c ON c.id = i.client_id
LEFT JOIN LATERAL (
  SELECT cp.id, cp.paid_at
  FROM public.crm_client_payments cp
  WHERE cp.client_id = c.id
    AND cp.amount = c.advance_amount
  ORDER BY cp.paid_at ASC
  LIMIT 1
) p ON true
WHERE c.advance_amount IS NOT NULL
  AND c.advance_amount >= 0
ON CONFLICT (invoice_id, line_order) DO NOTHING;
