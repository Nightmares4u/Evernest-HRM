-- =========================================================
-- 0010 — CRM Stage 1 Phase 4 assignment rule criteria
--
-- Adds the missing rule matching dimensions needed before the
-- Phase 4 assignment rules UI and engine are wired:
--   - branch match criterion
--   - campaign/source match criterion
--
-- No WhatsApp API, Gemini, parser changes, HRM task sync, or downstream
-- CRM modules are introduced here.
-- =========================================================

ALTER TABLE public.crm_assignment_rules
  ADD COLUMN match_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN campaign_source_id uuid REFERENCES public.crm_campaign_sources(id) ON DELETE SET NULL;

CREATE INDEX crm_assignment_rules_match_branch_idx
  ON public.crm_assignment_rules(match_branch_id)
  WHERE match_branch_id IS NOT NULL;

CREATE INDEX crm_assignment_rules_campaign_source_idx
  ON public.crm_assignment_rules(campaign_source_id)
  WHERE campaign_source_id IS NOT NULL;

CREATE INDEX crm_assignment_rules_active_priority_specificity_idx
  ON public.crm_assignment_rules(
    is_active,
    priority,
    whatsapp_number_id,
    campaign_source_id,
    match_branch_id,
    match_product_category,
    match_country,
    match_city
  );
