-- =========================================================
-- 0012 — CRM WhatsApp number fallback counselor routing
--
-- Temporary fallback ownership is configured per WhatsApp number for
-- leave, breaks, or unexpected absence. The default owner remains
-- assigned_employee_id; fallback only affects new source-owner
-- assignment while active and within the optional time window.
-- =========================================================

ALTER TABLE public.crm_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS fallback_employee_id uuid
    REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fallback_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS fallback_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS fallback_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS crm_whatsapp_numbers_fallback_employee_idx
  ON public.crm_whatsapp_numbers(fallback_employee_id)
  WHERE fallback_employee_id IS NOT NULL;
