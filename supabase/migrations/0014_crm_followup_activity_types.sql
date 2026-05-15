-- =========================================================
-- 0014 — CRM follow-up activity timeline events
--
-- Follow-up scheduling and completion should be first-class CRM
-- timeline events. The crm_leads.next_followup_at column already
-- exists and will be used by later UI/actions.
-- =========================================================

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older
-- Postgres versions. If applied via a migration runner that wraps each file
-- in BEGIN/COMMIT and errors here, run these ALTER TYPE statements separately.
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'followup_scheduled';
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'followup_completed';
