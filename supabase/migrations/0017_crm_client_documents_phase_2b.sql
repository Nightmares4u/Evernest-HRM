-- =========================================================
-- 0017 — CRM Stage 2 Phase 2B: client document registry
--
-- Adds document upload/review metadata. Storage files live in the
-- private Supabase Storage bucket inserted below.
-- =========================================================

DO $$
BEGIN
  CREATE TYPE public.crm_client_doc_state AS ENUM (
    'uploaded',
    'under_review',
    'approved',
    'rejected_resubmit',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.crm_client_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  doc_code              text NOT NULL,
  doc_state             public.crm_client_doc_state NOT NULL DEFAULT 'uploaded',
  storage_path          text NOT NULL,
  file_name             text NOT NULL,
  file_size             int NOT NULL CHECK (file_size > 0),
  mime_type             text NOT NULL,
  uploaded_by_user_id   uuid REFERENCES public.app_users(id),
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id   uuid REFERENCES public.app_users(id),
  reviewed_at           timestamptz,
  decision_note         text,
  superseded_by_id      uuid REFERENCES public.crm_client_documents(id),
  expires_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_client_documents_client_idx
  ON public.crm_client_documents(client_id, doc_code, uploaded_at DESC);

CREATE INDEX crm_client_documents_state_idx
  ON public.crm_client_documents(doc_state)
  WHERE doc_state IN ('uploaded', 'under_review');

CREATE TRIGGER crm_client_documents_touch_updated_at
BEFORE UPDATE ON public.crm_client_documents
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-client-docs', 'crm-client-docs', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crm_client_documents ENABLE ROW LEVEL SECURITY;
