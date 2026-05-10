-- =========================================================
-- 0002 — add due_time to tasks + recurring_tasks
--
-- Apply in Supabase SQL Editor BEFORE running the new code.
-- Safe & additive: new column is nullable. Existing rows keep due_time = NULL,
-- which the UI buckets as "EOD" (end-of-day, no specific time slot).
-- =========================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_time time;

ALTER TABLE recurring_tasks
  ADD COLUMN IF NOT EXISTS due_time time;
