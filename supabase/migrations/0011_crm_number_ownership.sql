-- =========================================================
-- 0011 — CRM number ownership (source-owner assignment)
--
-- Each counselor owns one or more WhatsApp numbers; Meta campaigns
-- inherit ownership through their parent WhatsApp number. Source-owner
-- becomes the primary assignment path; the rule engine remains as
-- fallback only.
--
-- DB-only changes:
--   - assigned_employee_id on crm_whatsapp_numbers
--   - auto_source_owner appended to crm_assignment_method enum
--
-- No campaign-level assigned_employee_id is introduced — campaigns
-- always resolve via their whatsapp_number_id parent.
-- =========================================================

ALTER TABLE public.crm_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS assigned_employee_id uuid
    REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_whatsapp_numbers_assigned_employee_idx
  ON public.crm_whatsapp_numbers(assigned_employee_id)
  WHERE assigned_employee_id IS NOT NULL;

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block. If
-- applied via a migration runner that wraps each file in BEGIN/COMMIT,
-- run this statement separately.
ALTER TYPE public.crm_assignment_method ADD VALUE IF NOT EXISTS 'auto_source_owner';
