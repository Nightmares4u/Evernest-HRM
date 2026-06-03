-- =========================================================
-- 0018 — CRM Stage 2 Phase 2C: per-university applications
--
-- Adds one application row per client/university target. Client status
-- rollups are handled in server actions.
-- =========================================================

DO $$
BEGIN
  CREATE TYPE public.crm_client_application_status AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'offer',
    'rejected',
    'waitlisted',
    'accepted',
    'declined',
    'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_client_application_intake_term AS ENUM (
    'fall',
    'spring',
    'summer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.crm_client_applications (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                  uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  university_name            text NOT NULL,
  program_name               text,
  intake_year                int CHECK (intake_year BETWEEN 2020 AND 2035),
  intake_term                public.crm_client_application_intake_term,
  status                     public.crm_client_application_status NOT NULL DEFAULT 'draft',
  submitted_at               timestamptz,
  decision_at                timestamptz,
  offer_letter_document_id   uuid REFERENCES public.crm_client_documents(id),
  offer_amount_currency      text NOT NULL DEFAULT 'PKR',
  tuition_total              numeric(12,2) CHECK (tuition_total IS NULL OR tuition_total >= 0),
  scholarship_amount         numeric(12,2) CHECK (scholarship_amount IS NULL OR scholarship_amount >= 0),
  notes                      text,
  created_by_user_id         uuid REFERENCES public.app_users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_client_applications_client_idx
  ON public.crm_client_applications(client_id, status, updated_at DESC);

CREATE UNIQUE INDEX crm_client_applications_one_accepted_per_client
  ON public.crm_client_applications(client_id)
  WHERE status = 'accepted';

CREATE TRIGGER crm_client_applications_touch_updated_at
BEFORE UPDATE ON public.crm_client_applications
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

ALTER TABLE public.crm_client_applications ENABLE ROW LEVEL SECURITY;
