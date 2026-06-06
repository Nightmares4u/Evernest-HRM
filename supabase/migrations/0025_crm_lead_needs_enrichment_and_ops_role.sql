-- =========================================================
-- 0025 — Lead needs_enrichment flag + ops role
--
-- Phase A / Phase B of the WhatsApp intake/routing fix.
--
-- 1. crm_leads.needs_enrichment: a lead can now be created (and owned)
--    even when it lacks the minimum qualifying fields. This flag marks
--    such leads so the workbench can surface them and so a lead is never
--    treated as "qualified" until enrichment completes. Missing fields
--    block QUALIFICATION, never ownership or lead existence.
--
-- 2. user_role 'ops': operations staff who process converted/client-stage
--    work across all branches. Behaviour is enforced in app helpers
--    (lib/crm/permissions-leads.ts, lib/crm/permissions-clients.ts), not a
--    capability table — minimal incremental role layer only.
--
-- NOTE: ALTER TYPE ... ADD VALUE follows the same out-of-transaction
-- caveat as migration 0007/0011/0024. The new value is not used in this
-- file.
-- =========================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ops';

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS needs_enrichment boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS crm_leads_needs_enrichment_idx
  ON public.crm_leads(needs_enrichment)
  WHERE needs_enrichment = true;
