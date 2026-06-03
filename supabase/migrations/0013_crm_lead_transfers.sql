-- =========================================================
-- 0013 — CRM lead transfer / handoff workflow foundation
--
-- Pending counselor-to-counselor transfer requests are workflow state,
-- not assignment history. Actual ownership changes should still be
-- recorded in crm_lead_assignments only when a transfer is accepted or
-- overridden by an admin in a later app workflow.
--
-- This migration is schema-only. No server actions or UI are added.
-- =========================================================

DO $$
BEGIN
  CREATE TYPE public.crm_transfer_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'cancelled',
    'admin_override'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_lead_transfers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,

  from_employee_id      uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  from_branch_id        uuid REFERENCES public.branches(id) ON DELETE SET NULL,

  to_employee_id        uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  to_branch_id          uuid REFERENCES public.branches(id) ON DELETE SET NULL,

  requested_by_user_id  uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  decided_by_user_id    uuid REFERENCES public.app_users(id) ON DELETE SET NULL,

  reason                text NOT NULL,
  decision_note         text,

  status                public.crm_transfer_status NOT NULL DEFAULT 'pending',
  requested_at          timestamptz NOT NULL DEFAULT now(),
  decided_at            timestamptz,

  CONSTRAINT crm_lead_transfers_different_employee_check
    CHECK (from_employee_id IS NULL OR from_employee_id <> to_employee_id),
  CONSTRAINT crm_lead_transfers_decided_at_status_check
    CHECK (decided_at IS NULL OR status <> 'pending')
);

COMMENT ON TABLE public.crm_lead_transfers IS
  'Workflow state for pending and decided CRM lead transfer/handoff requests. Actual assignment history remains in crm_lead_assignments.';
COMMENT ON COLUMN public.crm_lead_transfers.from_employee_id IS
  'Snapshot of the current/source counselor when the transfer was requested.';
COMMENT ON COLUMN public.crm_lead_transfers.to_employee_id IS
  'Requested target counselor for the transfer/handoff.';
COMMENT ON COLUMN public.crm_lead_transfers.status IS
  'Transfer workflow status. Pending rows do not change lead assignment by themselves.';

CREATE INDEX IF NOT EXISTS crm_lead_transfers_to_employee_status_requested_idx
  ON public.crm_lead_transfers(to_employee_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_transfers_from_employee_status_requested_idx
  ON public.crm_lead_transfers(from_employee_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_transfers_lead_requested_idx
  ON public.crm_lead_transfers(lead_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS crm_lead_transfers_status_requested_idx
  ON public.crm_lead_transfers(status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_transfers_one_pending_per_lead_idx
  ON public.crm_lead_transfers(lead_id)
  WHERE status = 'pending';

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older
-- Postgres versions. If applied via a migration runner that wraps each file
-- in BEGIN/COMMIT and errors here, run these ALTER TYPE statements separately.
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'transfer_requested';
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'transfer_accepted';
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'transfer_rejected';
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'transfer_cancelled';
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'transfer_admin_override';

ALTER TYPE public.crm_assignment_method ADD VALUE IF NOT EXISTS 'transfer_accept';
ALTER TYPE public.crm_assignment_method ADD VALUE IF NOT EXISTS 'transfer_admin_override';

ALTER TABLE public.crm_lead_transfers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_lead_transfers'
      AND policyname = 'crm_lead_transfers_super_admin_all'
  ) THEN
    CREATE POLICY crm_lead_transfers_super_admin_all ON public.crm_lead_transfers
      FOR ALL TO authenticated
      USING (public.is_super_admin())
      WITH CHECK (public.is_super_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_lead_transfers'
      AND policyname = 'crm_lead_transfers_source_or_target_select'
  ) THEN
    CREATE POLICY crm_lead_transfers_source_or_target_select ON public.crm_lead_transfers
      FOR SELECT TO authenticated
      USING (
        from_employee_id IN (
          SELECT id FROM public.employees WHERE user_id = auth.uid()
        )
        OR to_employee_id IN (
          SELECT id FROM public.employees WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
