-- =========================================================
-- 0006 — pre-deployment security hardening
--
-- Addresses Supabase advisor warnings that are safe to fix in code:
--   1. SECURITY DEFINER view  (employee_overdue_tasks)
--   2. Function search_path mutable (is_super_admin)
--   3. Public/anon EXECUTE on is_super_admin()
--
-- Deferred (intentional, documented in audit report):
--   - "Leaked Password Protection" — Supabase Auth dashboard setting.
--   - "RLS InitPlan" / "Multiple Permissive Policies" — risky to refactor
--     across every policy at this stage; revisit post-MVP.
-- =========================================================

-- 1) Recreate employee_overdue_tasks with security_invoker so it respects
--    the caller's RLS instead of the view-owner's privileges.
DROP VIEW IF EXISTS public.employee_overdue_tasks;

CREATE VIEW public.employee_overdue_tasks
WITH (security_invoker = true) AS
SELECT
  e.id            AS employee_id,
  e.user_id       AS user_id,
  e.full_name     AS full_name,
  e.branch_id     AS branch_id,
  COALESCE(SUM(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'done' THEN 1 ELSE 0 END), 0)::int AS overdue_count,
  COALESCE(SUM(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'done' THEN 1 ELSE 0 END), 0) >= 3 AS is_redlined
FROM public.employees e
LEFT JOIN public.tasks t ON t.assigned_to = e.user_id
WHERE e.employment_status = 'active'
GROUP BY e.id, e.user_id, e.full_name, e.branch_id;

-- 2) Pin search_path on is_super_admin so it can't be hijacked by a
--    caller-controlled search_path. The function only references
--    public.app_users and auth.uid().
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
$$;

-- 3) Lock down EXECUTE: anon never needs it; the function is only
--    referenced from RLS policies on authenticated tables.
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
