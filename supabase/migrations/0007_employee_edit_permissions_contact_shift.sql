-- 0007 — employee edit fields, notification email, custom shift overrides,
-- and role hierarchy additions.
--
-- Apply this migration before deploying app code that reads these columns.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'assistant_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_member';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS custom_shift_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_shift_start time,
  ADD COLUMN IF NOT EXISTS custom_shift_end time;

ALTER TABLE employees
  ADD CONSTRAINT employees_custom_shift_times_check
  CHECK (
    custom_shift_enabled = false
    OR (custom_shift_start IS NOT NULL AND custom_shift_end IS NOT NULL)
  )
  NOT VALID;

ALTER TABLE employees
  VALIDATE CONSTRAINT employees_custom_shift_times_check;

CREATE INDEX IF NOT EXISTS employees_contact_email_idx
  ON employees(contact_email)
  WHERE contact_email IS NOT NULL;
