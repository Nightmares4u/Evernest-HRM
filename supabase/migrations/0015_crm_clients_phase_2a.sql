-- =========================================================
-- 0015 — CRM Stage 2 Phase 2A: conversion + client shell
--
-- Adds the lead-to-client conversion event and read-only client shell.
-- Documents, applications, visa milestones, refunds, and portal access
-- are intentionally deferred to later Stage 2 phases.
-- =========================================================

DO $$
BEGIN
  CREATE TYPE public.crm_client_type AS ENUM ('student', 'work_permit', 'b2b');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.crm_client_status AS ENUM (
    'onboarding',
    'doc_review',
    'uni_selection',
    'applying',
    'offer_in_hand',
    'offer_accepted',
    'visa_prep',
    'visa_submitted',
    'visa_decision',
    'pre_departure',
    'departed',
    'alumni',
    'withdrawn_refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.crm_client_code_seq START 1;

CREATE TABLE public.crm_clients (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               uuid NOT NULL UNIQUE REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  client_type           public.crm_client_type NOT NULL DEFAULT 'student',
  client_code           text NOT NULL UNIQUE DEFAULT (
                            'EN-' ||
                            to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY') ||
                            '-' ||
                            lpad(nextval('public.crm_client_code_seq')::text, 4, '0')
                          ),
  status                public.crm_client_status NOT NULL DEFAULT 'onboarding',
  target_country        text,
  target_level          text,
  agreement_signed_at   timestamptz NOT NULL,
  advance_paid_at       timestamptz NOT NULL,
  advance_amount        numeric(12,2),
  total_fee             numeric(12,2),
  currency              text NOT NULL DEFAULT 'PKR',
  assigned_agent_id     uuid REFERENCES public.employees(id),
  branch_id             uuid REFERENCES public.branches(id),
  created_by_user_id    uuid REFERENCES public.app_users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_clients_status_idx
  ON public.crm_clients(status);

CREATE INDEX crm_clients_assigned_agent_idx
  ON public.crm_clients(assigned_agent_id);

CREATE INDEX crm_clients_branch_idx
  ON public.crm_clients(branch_id);

CREATE TRIGGER crm_clients_touch_updated_at
BEFORE UPDATE ON public.crm_clients
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE public.crm_client_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  activity_type   text NOT NULL,
  actor_user_id   uuid REFERENCES public.app_users(id),
  description     text,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_client_activities_client_created_idx
  ON public.crm_client_activities(client_id, created_at DESC);

CREATE TABLE public.crm_client_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  amount                numeric(12,2) NOT NULL CHECK (amount > 0),
  currency              text NOT NULL DEFAULT 'PKR',
  paid_at               timestamptz NOT NULL,
  method                text,
  reference             text,
  notes                 text,
  recorded_by_user_id   uuid REFERENCES public.app_users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_client_payments_client_idx
  ON public.crm_client_payments(client_id, paid_at DESC);

ALTER TABLE public.crm_clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_client_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_client_payments    ENABLE ROW LEVEL SECURITY;
