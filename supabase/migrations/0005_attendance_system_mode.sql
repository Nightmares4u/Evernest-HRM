-- =========================================================
-- 0005 — cron/system attendance mode
--
-- Adds a distinct attendance mode for automated maintenance rows created by
-- /api/cron/close-attendance-day. Existing data is untouched.
-- =========================================================

ALTER TYPE attendance_mode ADD VALUE IF NOT EXISTS 'system';
