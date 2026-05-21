-- =========================================================
-- 0009 — CRM Stage 1 foundation
--
-- Phase 1 only: schema, indexes, RLS baseline, parser settings.
-- No UI, webhook route, parser, assignment engine, or outbound WhatsApp.
-- =========================================================

-- ---------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.crm_raw_status AS ENUM (
    'raw_new',
    'awaiting_details',
    'details_received',
    'needs_review',
    'qualified',
    'spam_duplicate'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_lead_status AS ENUM (
    'new',
    'assigned',
    'contacted',
    'qualified',
    'follow_up',
    'lost',
    'converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_assignment_status AS ENUM (
    'assigned',
    'reassigned',
    'unassigned'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_assignment_method AS ENUM (
    'auto_rule',
    'manual',
    'manager_override',
    'review_queue'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_activity_type AS ENUM (
    'raw_message_received',
    'auto_greeting_sent',
    'details_received',
    'parser_succeeded',
    'parser_low_confidence',
    'sent_to_review',
    'lead_shell_created',
    'assigned',
    'reassigned',
    'unassigned',
    'status_changed',
    'note_added',
    'human_follow_up_started'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_rule_action AS ENUM (
    'assign_to_agent',
    'assign_to_branch',
    'flag_for_manager'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------
-- UPDATED_AT HELPER
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------
-- CRM CONFIG + SOURCE MAPPING
-- ---------------------------------------------------------
CREATE TABLE public.crm_whatsapp_numbers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id     text,
  display_number      text NOT NULL,
  label               text NOT NULL,
  product_category    text NOT NULL,
  default_branch_id   uuid REFERENCES public.branches(id),
  default_department_id uuid REFERENCES public.departments(id),
  greeting_template   text,
  is_api_connected    boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_whatsapp_numbers_phone_number_id_unique UNIQUE (phone_number_id),
  CONSTRAINT crm_whatsapp_numbers_display_number_unique UNIQUE (display_number),
  CONSTRAINT crm_whatsapp_numbers_product_category_check
    CHECK (length(trim(product_category)) > 0)
);

CREATE INDEX crm_whatsapp_numbers_active_category_idx
  ON public.crm_whatsapp_numbers(is_active, product_category);

CREATE TRIGGER crm_whatsapp_numbers_touch_updated_at
BEFORE UPDATE ON public.crm_whatsapp_numbers
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE public.crm_campaign_sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id  uuid REFERENCES public.crm_whatsapp_numbers(id) ON DELETE SET NULL,
  source_key          text NOT NULL,
  label               text NOT NULL,
  product_category    text NOT NULL,
  default_branch_id   uuid REFERENCES public.branches(id),
  default_department_id uuid REFERENCES public.departments(id),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_campaign_sources_source_key_unique UNIQUE (source_key),
  CONSTRAINT crm_campaign_sources_product_category_check
    CHECK (length(trim(product_category)) > 0)
);

CREATE INDEX crm_campaign_sources_active_category_idx
  ON public.crm_campaign_sources(is_active, product_category);

CREATE INDEX crm_campaign_sources_whatsapp_number_idx
  ON public.crm_campaign_sources(whatsapp_number_id);

CREATE TRIGGER crm_campaign_sources_touch_updated_at
BEFORE UPDATE ON public.crm_campaign_sources
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ---------------------------------------------------------
-- RAW INBOX
-- ---------------------------------------------------------
CREATE TABLE public.crm_raw_inbox (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id        uuid REFERENCES public.crm_whatsapp_numbers(id) ON DELETE SET NULL,
  campaign_source_id        uuid REFERENCES public.crm_campaign_sources(id) ON DELETE SET NULL,
  sender_phone              text NOT NULL,
  sender_name               text,
  first_wa_message_id       text,
  status                    public.crm_raw_status NOT NULL DEFAULT 'raw_new',
  parser_confidence         numeric(3,2),
  extracted_country         text,
  extracted_city            text,
  extracted_qualification   text,
  extracted_marks_cgpa      text,
  extracted_study_gap       text,
  extracted_budget_range    text,
  extracted_english_test    text,
  missing_fields            text[] NOT NULL DEFAULT '{}',
  duplicate_of_inbox_id     uuid REFERENCES public.crm_raw_inbox(id),
  first_message_text        text,
  last_message_text         text,
  last_message_at           timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_raw_inbox_parser_confidence_check
    CHECK (parser_confidence IS NULL OR (parser_confidence >= 0 AND parser_confidence <= 1))
);

CREATE INDEX crm_raw_inbox_sender_number_idx
  ON public.crm_raw_inbox(sender_phone, whatsapp_number_id);

CREATE UNIQUE INDEX crm_raw_inbox_first_wa_message_id_unique_idx
  ON public.crm_raw_inbox(first_wa_message_id)
  WHERE first_wa_message_id IS NOT NULL;

CREATE INDEX crm_raw_inbox_phone_status_date_idx
  ON public.crm_raw_inbox(sender_phone, status, created_at DESC);

CREATE INDEX crm_raw_inbox_status_created_idx
  ON public.crm_raw_inbox(status, created_at DESC);

CREATE INDEX crm_raw_inbox_whatsapp_created_idx
  ON public.crm_raw_inbox(whatsapp_number_id, created_at DESC);

CREATE INDEX crm_raw_inbox_duplicate_idx
  ON public.crm_raw_inbox(duplicate_of_inbox_id)
  WHERE duplicate_of_inbox_id IS NOT NULL;

CREATE TRIGGER crm_raw_inbox_touch_updated_at
BEFORE UPDATE ON public.crm_raw_inbox
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ---------------------------------------------------------
-- LEADS
-- ---------------------------------------------------------
CREATE TABLE public.crm_leads (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_inbox_id                uuid REFERENCES public.crm_raw_inbox(id) ON DELETE SET NULL,
  assigned_agent_id           uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  branch_id                   uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status                      public.crm_lead_status NOT NULL DEFAULT 'new',
  customer_phone              text NOT NULL,
  customer_name               text,
  product_category            text,
  interested_country          text,
  city                        text,
  last_qualification          text,
  marks_cgpa                  text,
  study_gap                   text,
  budget_range                text,
  english_test_status         text,
  quality_score               numeric(3,2),
  source_whatsapp_number_id   uuid REFERENCES public.crm_whatsapp_numbers(id) ON DELETE SET NULL,
  campaign_source_id          uuid REFERENCES public.crm_campaign_sources(id) ON DELETE SET NULL,
  next_followup_at            timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_leads_quality_score_check
    CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1))
);

ALTER TABLE public.crm_raw_inbox
  ADD COLUMN lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL;

CREATE INDEX crm_raw_inbox_lead_idx
  ON public.crm_raw_inbox(lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX crm_leads_raw_inbox_idx
  ON public.crm_leads(raw_inbox_id)
  WHERE raw_inbox_id IS NOT NULL;

CREATE INDEX crm_leads_assigned_status_idx
  ON public.crm_leads(assigned_agent_id, status);

CREATE INDEX crm_leads_next_followup_idx
  ON public.crm_leads(next_followup_at);

CREATE INDEX crm_leads_branch_status_idx
  ON public.crm_leads(branch_id, status);

CREATE INDEX crm_leads_branch_product_status_idx
  ON public.crm_leads(branch_id, product_category, status);

CREATE INDEX crm_leads_phone_idx
  ON public.crm_leads(customer_phone);

CREATE INDEX crm_leads_source_number_idx
  ON public.crm_leads(source_whatsapp_number_id);

CREATE INDEX crm_leads_created_idx
  ON public.crm_leads(created_at DESC);

CREATE TRIGGER crm_leads_touch_updated_at
BEFORE UPDATE ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ---------------------------------------------------------
-- MESSAGE HISTORY
-- ---------------------------------------------------------
CREATE TABLE public.crm_lead_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_inbox_id           uuid REFERENCES public.crm_raw_inbox(id) ON DELETE CASCADE,
  lead_id                uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  direction              public.crm_message_direction NOT NULL,
  wa_message_id          text,
  from_phone             text,
  to_phone               text,
  message_type           text NOT NULL DEFAULT 'text',
  content                text,
  raw_payload            jsonb,
  sent_by_employee_id    uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  received_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_lead_messages_thread_check
    CHECK (raw_inbox_id IS NOT NULL OR lead_id IS NOT NULL)
);

CREATE UNIQUE INDEX crm_lead_messages_wa_message_id_unique_idx
  ON public.crm_lead_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX crm_lead_messages_raw_inbox_created_idx
  ON public.crm_lead_messages(raw_inbox_id, created_at);

CREATE INDEX crm_lead_messages_lead_created_idx
  ON public.crm_lead_messages(lead_id, created_at);

CREATE INDEX crm_lead_messages_phone_created_idx
  ON public.crm_lead_messages(from_phone, created_at DESC);

-- ---------------------------------------------------------
-- ASSIGNMENT RULES + HISTORY
-- ---------------------------------------------------------
CREATE TABLE public.crm_assignment_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  priority                int NOT NULL DEFAULT 100,
  whatsapp_number_id      uuid REFERENCES public.crm_whatsapp_numbers(id) ON DELETE SET NULL,
  match_city              text,
  match_country           text,
  match_product_category  text,
  action                  public.crm_rule_action NOT NULL,
  target_branch_id        uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  target_employee_id      uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reason_template         text,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_assignment_rules_target_check
    CHECK (
      (action = 'assign_to_agent' AND target_employee_id IS NOT NULL)
      OR (action = 'assign_to_branch' AND target_branch_id IS NOT NULL)
      OR (action = 'flag_for_manager')
    )
);

CREATE INDEX crm_assignment_rules_active_priority_idx
  ON public.crm_assignment_rules(is_active, priority, created_at);

CREATE INDEX crm_assignment_rules_number_city_country_idx
  ON public.crm_assignment_rules(whatsapp_number_id, match_city, match_country);

CREATE TRIGGER crm_assignment_rules_touch_updated_at
BEFORE UPDATE ON public.crm_assignment_rules
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE public.crm_lead_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  status              public.crm_assignment_status NOT NULL,
  from_employee_id    uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  to_employee_id      uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  from_branch_id      uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id        uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  assigned_by         uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  method              public.crm_assignment_method NOT NULL,
  matched_rule_id     uuid REFERENCES public.crm_assignment_rules(id) ON DELETE SET NULL,
  reason              text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_lead_assignments_lead_created_idx
  ON public.crm_lead_assignments(lead_id, created_at DESC);

CREATE INDEX crm_lead_assignments_to_employee_created_idx
  ON public.crm_lead_assignments(to_employee_id, created_at DESC);

CREATE INDEX crm_lead_assignments_to_branch_created_idx
  ON public.crm_lead_assignments(to_branch_id, created_at DESC);

-- ---------------------------------------------------------
-- ACTIVITY TIMELINE
-- ---------------------------------------------------------
CREATE TABLE public.crm_lead_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  raw_inbox_id    uuid REFERENCES public.crm_raw_inbox(id) ON DELETE CASCADE,
  activity_type   public.crm_activity_type NOT NULL,
  actor_user_id   uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  description     text,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_lead_activities_subject_check
    CHECK (lead_id IS NOT NULL OR raw_inbox_id IS NOT NULL)
);

CREATE INDEX crm_lead_activities_lead_created_idx
  ON public.crm_lead_activities(lead_id, created_at DESC);

CREATE INDEX crm_lead_activities_raw_inbox_created_idx
  ON public.crm_lead_activities(raw_inbox_id, created_at DESC);

CREATE INDEX crm_lead_activities_actor_created_idx
  ON public.crm_lead_activities(actor_user_id, created_at DESC);

-- ---------------------------------------------------------
-- SETTINGS
-- ---------------------------------------------------------
INSERT INTO public.settings (key, value)
VALUES ('crm_parser', '{"auto_promote": 0.80, "needs_review": 0.50}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
ALTER TABLE public.crm_whatsapp_numbers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaign_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_raw_inbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_assignment_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_activities   ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_whatsapp_numbers_super_admin_all ON public.crm_whatsapp_numbers
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY crm_campaign_sources_super_admin_all ON public.crm_campaign_sources
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY crm_raw_inbox_super_admin_all ON public.crm_raw_inbox
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY crm_leads_super_admin_all ON public.crm_leads
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY crm_lead_messages_super_admin_all ON public.crm_lead_messages
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY crm_assignment_rules_super_admin_all ON public.crm_assignment_rules
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY crm_lead_assignments_super_admin_all ON public.crm_lead_assignments
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY crm_lead_activities_super_admin_all ON public.crm_lead_activities
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Agent self-select. Branch-manager visibility stays app-level in Stage 1.
CREATE POLICY crm_leads_agent_select ON public.crm_leads
  FOR SELECT TO authenticated
  USING (
    assigned_agent_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY crm_raw_inbox_assigned_agent_select ON public.crm_raw_inbox
  FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.crm_leads
      WHERE assigned_agent_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY crm_lead_messages_assigned_agent_select ON public.crm_lead_messages
  FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.crm_leads
      WHERE assigned_agent_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
    OR raw_inbox_id IN (
      SELECT ri.id
      FROM public.crm_raw_inbox ri
      JOIN public.crm_leads l ON l.id = ri.lead_id
      WHERE l.assigned_agent_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY crm_lead_assignments_assigned_agent_select ON public.crm_lead_assignments
  FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.crm_leads
      WHERE assigned_agent_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY crm_lead_activities_assigned_agent_select ON public.crm_lead_activities
  FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.crm_leads
      WHERE assigned_agent_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
    OR raw_inbox_id IN (
      SELECT ri.id
      FROM public.crm_raw_inbox ri
      JOIN public.crm_leads l ON l.id = ri.lead_id
      WHERE l.assigned_agent_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );
