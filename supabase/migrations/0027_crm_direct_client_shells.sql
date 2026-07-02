-- =========================================================
-- 0027 — Direct client shells (intake pipeline paused)
--
-- Business pivot: the raw-inbox → lead → client lifecycle is paused.
-- Clients are now created directly as "client shells" with their own
-- identity fields; lead linkage becomes optional so the old pipeline
-- can be re-wired later without another schema change.
--
-- Also widens invoice editing to ops + assigned counselors, so the
-- invoice RPCs now record field-level change diffs in the client
-- activity payload as an audit trail.
-- =========================================================

-- ---------------------------------------------------------
-- 1. crm_clients: optional lead, own identity, optional advance
-- ---------------------------------------------------------

ALTER TABLE public.crm_clients ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.crm_clients ALTER COLUMN agreement_signed_at DROP NOT NULL;
ALTER TABLE public.crm_clients ALTER COLUMN advance_paid_at DROP NOT NULL;

ALTER TABLE public.crm_clients ADD COLUMN IF NOT EXISTS customer_name  text;
ALTER TABLE public.crm_clients ADD COLUMN IF NOT EXISTS customer_phone text;

-- Backfill identity from the linked lead for any pre-existing rows.
UPDATE public.crm_clients c
SET customer_name  = COALESCE(c.customer_name, l.customer_name),
    customer_phone = COALESCE(c.customer_phone, l.customer_phone)
FROM public.crm_leads l
WHERE l.id = c.lead_id
  AND (c.customer_name IS NULL OR c.customer_phone IS NULL);

-- Shells created without a lead must carry their own identity.
ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_shell_identity_check
  CHECK (lead_id IS NOT NULL OR customer_name IS NOT NULL) NOT VALID;

-- ---------------------------------------------------------
-- 2. Direct client shell creation RPC
--
-- Creates the client shell, its invoice, and a DUE Step 1
-- "Registration / Agreement Fees" row atomically. No payment row is
-- created — cash is only recorded when a step is marked paid.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_create_client_shell(
  p_customer_name text,
  p_customer_phone text,
  p_target_country text,
  p_target_level text,
  p_total_fee numeric,
  p_registration_fee numeric,
  p_branch_id uuid,
  p_assigned_agent_id uuid,
  p_actor_user_id uuid
) RETURNS TABLE(client_id uuid, client_code text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_is_active boolean;
  v_client_id uuid;
  v_client_code text;
  v_invoice_id uuid;
BEGIN
  IF NULLIF(btrim(p_customer_name), '') IS NULL THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(btrim(p_customer_phone), '') IS NULL THEN
    RAISE EXCEPTION 'Customer phone is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_total_fee IS NOT NULL AND p_total_fee < 0 THEN
    RAISE EXCEPTION 'Total fee must be zero or greater' USING ERRCODE = 'P0001';
  END IF;
  IF p_registration_fee IS NOT NULL AND p_registration_fee < 0 THEN
    RAISE EXCEPTION 'Registration fee must be zero or greater' USING ERRCODE = 'P0001';
  END IF;

  SELECT is_active INTO v_actor_is_active
  FROM public.app_users
  WHERE id = p_actor_user_id;

  IF v_actor_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Active user is required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.crm_clients AS c (
    lead_id,
    client_type,
    customer_name,
    customer_phone,
    target_country,
    target_level,
    total_fee,
    currency,
    assigned_agent_id,
    branch_id,
    created_by_user_id
  )
  VALUES (
    NULL,
    'student',
    btrim(p_customer_name),
    btrim(p_customer_phone),
    NULLIF(p_target_country, ''),
    NULLIF(p_target_level, ''),
    p_total_fee,
    'PKR',
    p_assigned_agent_id,
    p_branch_id,
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
    ((now() AT TIME ZONE 'Asia/Karachi'))::date,
    btrim(p_customer_name),
    'Karachi - Pakistan',
    COALESCE(NULLIF(p_target_country, ''), 'Student') || ' Services Package',
    p_actor_user_id
  )
  RETURNING id INTO v_invoice_id;

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
    v_invoice_id,
    1,
    'Step 1 Registration / Agreement Fees',
    1,
    COALESCE(p_registration_fee, 0),
    'due',
    v_client_code || '-01',
    'Due',
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
    format('Client shell created directly (%s) with invoice %s.', btrim(p_customer_name), v_client_code || '-01'),
    jsonb_build_object(
      'client_code', v_client_code,
      'invoice_id', v_invoice_id,
      'direct_shell', true,
      'registration_fee', COALESCE(p_registration_fee, 0),
      'currency', 'PKR'
    )
  );

  RETURN QUERY SELECT v_client_id, v_client_code;
END;
$$;

-- ---------------------------------------------------------
-- 3. Invoice header update: field-level audit trail
-- ---------------------------------------------------------

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
  v_old public.crm_client_invoices%ROWTYPE;
  v_new public.crm_client_invoices%ROWTYPE;
  v_client_status public.crm_client_status;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_old
  FROM public.crm_client_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  SELECT status INTO v_client_status
  FROM public.crm_clients
  WHERE id = v_old.client_id
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
  WHERE id = p_invoice_id
  RETURNING * INTO v_new;

  -- Field-level diff so counselor/ops edits leave a reviewable trail.
  IF v_new.invoice_number IS DISTINCT FROM v_old.invoice_number THEN
    v_changes := v_changes || jsonb_build_object('invoice_number', jsonb_build_object('from', v_old.invoice_number, 'to', v_new.invoice_number));
  END IF;
  IF v_new.file_number IS DISTINCT FROM v_old.file_number THEN
    v_changes := v_changes || jsonb_build_object('file_number', jsonb_build_object('from', v_old.file_number, 'to', v_new.file_number));
  END IF;
  IF v_new.status IS DISTINCT FROM v_old.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('from', v_old.status, 'to', v_new.status));
  END IF;
  IF v_new.invoice_date IS DISTINCT FROM v_old.invoice_date THEN
    v_changes := v_changes || jsonb_build_object('invoice_date', jsonb_build_object('from', v_old.invoice_date, 'to', v_new.invoice_date));
  END IF;
  IF v_new.due_label IS DISTINCT FROM v_old.due_label THEN
    v_changes := v_changes || jsonb_build_object('due_label', jsonb_build_object('from', v_old.due_label, 'to', v_new.due_label));
  END IF;
  IF v_new.bill_to_name IS DISTINCT FROM v_old.bill_to_name THEN
    v_changes := v_changes || jsonb_build_object('bill_to_name', jsonb_build_object('from', v_old.bill_to_name, 'to', v_new.bill_to_name));
  END IF;
  IF v_new.bill_to_location IS DISTINCT FROM v_old.bill_to_location THEN
    v_changes := v_changes || jsonb_build_object('bill_to_location', jsonb_build_object('from', v_old.bill_to_location, 'to', v_new.bill_to_location));
  END IF;
  IF v_new.package_title IS DISTINCT FROM v_old.package_title THEN
    v_changes := v_changes || jsonb_build_object('package_title', jsonb_build_object('from', v_old.package_title, 'to', v_new.package_title));
  END IF;
  IF v_new.terms IS DISTINCT FROM v_old.terms THEN
    v_changes := v_changes || jsonb_build_object('terms', jsonb_build_object('from', v_old.terms, 'to', v_new.terms));
  END IF;
  IF v_new.footer_note IS DISTINCT FROM v_old.footer_note THEN
    v_changes := v_changes || jsonb_build_object('footer_note', jsonb_build_object('from', v_old.footer_note, 'to', v_new.footer_note));
  END IF;

  INSERT INTO public.crm_client_activities (
    client_id,
    activity_type,
    actor_user_id,
    description,
    payload
  )
  VALUES (
    v_old.client_id,
    'invoice_updated',
    p_actor_user_id,
    format('Invoice %s updated (%s field(s) changed).', v_old.invoice_number, (SELECT count(*) FROM jsonb_object_keys(v_changes))),
    jsonb_build_object('invoice_id', v_old.id, 'changes', v_changes)
  );

  RETURN p_invoice_id;
END;
$$;

-- ---------------------------------------------------------
-- 4. Invoice step upsert: field-level audit trail
--    (status/payment changes are already logged by
--     crm_apply_invoice_step_payment, which this calls)
-- ---------------------------------------------------------

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
  v_old public.crm_client_invoice_steps%ROWTYPE;
  v_new public.crm_client_invoice_steps%ROWTYPE;
  v_step_id uuid;
  v_changes jsonb := '{}'::jsonb;
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

    INSERT INTO public.crm_client_activities (
      client_id,
      activity_type,
      actor_user_id,
      description,
      payload
    )
    VALUES (
      v_invoice.client_id,
      'invoice_step_added',
      p_actor_user_id,
      format('Invoice step added: %s (qty %s x PKR %s).', p_description, p_quantity, p_unit_price),
      jsonb_build_object(
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'step_id', v_step_id,
        'line_order', p_line_order,
        'description', p_description,
        'quantity', p_quantity,
        'unit_price', p_unit_price
      )
    );
  ELSE
    SELECT * INTO v_old
    FROM public.crm_client_invoice_steps
    WHERE id = p_step_id
      AND invoice_id = p_invoice_id
    FOR UPDATE;

    IF v_old.id IS NULL THEN
      RAISE EXCEPTION 'Invoice step % not found for invoice %', p_step_id, p_invoice_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.crm_client_invoice_steps
    SET line_order = p_line_order,
        description = p_description,
        quantity = p_quantity,
        unit_price = p_unit_price,
        detail_label = NULLIF(p_detail_label, ''),
        detail_status = NULLIF(p_detail_status, '')
    WHERE id = p_step_id
      AND invoice_id = p_invoice_id
    RETURNING * INTO v_new;

    v_step_id := v_new.id;

    IF v_new.line_order IS DISTINCT FROM v_old.line_order THEN
      v_changes := v_changes || jsonb_build_object('line_order', jsonb_build_object('from', v_old.line_order, 'to', v_new.line_order));
    END IF;
    IF v_new.description IS DISTINCT FROM v_old.description THEN
      v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('from', v_old.description, 'to', v_new.description));
    END IF;
    IF v_new.quantity IS DISTINCT FROM v_old.quantity THEN
      v_changes := v_changes || jsonb_build_object('quantity', jsonb_build_object('from', v_old.quantity, 'to', v_new.quantity));
    END IF;
    IF v_new.unit_price IS DISTINCT FROM v_old.unit_price THEN
      v_changes := v_changes || jsonb_build_object('unit_price', jsonb_build_object('from', v_old.unit_price, 'to', v_new.unit_price));
    END IF;
    IF v_new.detail_label IS DISTINCT FROM v_old.detail_label THEN
      v_changes := v_changes || jsonb_build_object('detail_label', jsonb_build_object('from', v_old.detail_label, 'to', v_new.detail_label));
    END IF;
    IF v_new.detail_status IS DISTINCT FROM v_old.detail_status THEN
      v_changes := v_changes || jsonb_build_object('detail_status', jsonb_build_object('from', v_old.detail_status, 'to', v_new.detail_status));
    END IF;

    IF v_changes <> '{}'::jsonb THEN
      INSERT INTO public.crm_client_activities (
        client_id,
        activity_type,
        actor_user_id,
        description,
        payload
      )
      VALUES (
        v_invoice.client_id,
        'invoice_step_edited',
        p_actor_user_id,
        format('Invoice step edited: %s.', v_new.description),
        jsonb_build_object(
          'invoice_id', v_invoice.id,
          'invoice_number', v_invoice.invoice_number,
          'step_id', v_step_id,
          'changes', v_changes
        )
      );
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
