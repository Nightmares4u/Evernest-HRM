-- 0004 — holiday admin fields for payroll-ready working-day baseline
--
-- Existing schema already has:
--   holidays.is_paid   -> UI "paid_holiday"
--   holidays.branch_id -> optional branch scope
--
-- This migration adds:
--   holidays.company_wide -> explicit company-wide holiday flag
--   holidays.notes        -> super-admin notes

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS company_wide boolean NOT NULL DEFAULT true;

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE holidays
SET company_wide = (branch_id IS NULL AND employee_id IS NULL)
WHERE company_wide IS DISTINCT FROM (branch_id IS NULL AND employee_id IS NULL);

CREATE INDEX IF NOT EXISTS holidays_paid_scope_date_idx
  ON holidays(date, company_wide, branch_id)
  WHERE is_paid = true;
