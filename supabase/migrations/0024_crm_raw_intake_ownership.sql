-- =========================================================
-- 0024 — CRM raw intake ownership + enrichment states
--
-- Phase A of the WhatsApp intake/routing fix. Ownership is now decided
-- at RECEIPT (webhook / manual intake), not at promotion. A bad or
-- partial inquiry must still be OWNED by the receiving number's
-- counselor; quality only decides whether the row "needs enrichment".
--
-- Changes:
--   - assigned_employee_id / branch_id / assignment_method /
--     assignment_reason on crm_raw_inbox (owner at receipt)
--   - extracted_product_category / enrichment_notes for the counselor
--     enrichment form
--   - two new crm_raw_status values: needs_enrichment, ready_for_promotion
--   - RLS: assigned counselor can see their own raw rows
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
-- older runners and the new value cannot be used in the same transaction.
-- This file only ADDS the values and ADDS columns/policies; it never
-- inserts a row using the new values, so it is safe to apply as-is. If
-- your runner wraps each file in BEGIN/COMMIT, run the two ALTER TYPE
-- statements separately first.
-- =========================================================

ALTER TYPE public.crm_raw_status ADD VALUE IF NOT EXISTS 'needs_enrichment';
ALTER TYPE public.crm_raw_status ADD VALUE IF NOT EXISTS 'ready_for_promotion';

ALTER TABLE public.crm_raw_inbox
  ADD COLUMN IF NOT EXISTS assigned_employee_id uuid
    REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id uuid
    REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_method text,
  ADD COLUMN IF NOT EXISTS assignment_reason text,
  ADD COLUMN IF NOT EXISTS extracted_product_category text,
  ADD COLUMN IF NOT EXISTS enrichment_notes text;

CREATE INDEX IF NOT EXISTS crm_raw_inbox_assigned_employee_idx
  ON public.crm_raw_inbox(assigned_employee_id)
  WHERE assigned_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_raw_inbox_branch_status_idx
  ON public.crm_raw_inbox(branch_id, status, created_at DESC);

-- Assigned counselor can select their own raw rows even before promotion.
-- (App-level reads use the service role and re-filter in code; this policy
-- is defense-in-depth and matches the Stage 1 agent self-select pattern.)
DROP POLICY IF EXISTS crm_raw_inbox_assigned_employee_select ON public.crm_raw_inbox;
CREATE POLICY crm_raw_inbox_assigned_employee_select ON public.crm_raw_inbox
  FOR SELECT TO authenticated
  USING (
    assigned_employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );
