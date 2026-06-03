-- =========================================================
-- 0019 — CRM Stage 2 Phase 2D: country milestones + visa gate
--
-- Adds per-client country milestone checklist rows. Milestone definitions
-- live in TypeScript so embassy process changes do not require migrations.
-- =========================================================

DO $$
BEGIN
  CREATE TYPE public.crm_client_milestone_status AS ENUM (
    'not_started',
    'in_progress',
    'done',
    'not_applicable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.crm_client_country_milestones (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  milestone_code           text NOT NULL,
  status                   public.crm_client_milestone_status NOT NULL DEFAULT 'not_started',
  due_at                   timestamptz,
  completed_at             timestamptz,
  completed_by_user_id     uuid REFERENCES public.app_users(id),
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, milestone_code)
);

CREATE INDEX crm_client_country_milestones_client_idx
  ON public.crm_client_country_milestones(client_id, status);

CREATE TRIGGER crm_client_country_milestones_touch_updated_at
BEFORE UPDATE ON public.crm_client_country_milestones
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

ALTER TABLE public.crm_client_country_milestones ENABLE ROW LEVEL SECURITY;
