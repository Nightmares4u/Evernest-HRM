-- Task workflow expansion: assigned (existing), self, request.
-- Additive only. Existing rows default to workflow_type='assigned'.

ALTER TABLE tasks
  ADD COLUMN workflow_type   text NOT NULL DEFAULT 'assigned'
    CHECK (workflow_type IN ('assigned','self','request')),
  ADD COLUMN accepted_at     timestamptz,
  ADD COLUMN declined_at     timestamptz,
  ADD COLUMN declined_reason text;

CREATE INDEX tasks_workflow_inbox_idx
  ON tasks(assigned_to, workflow_type, accepted_at, declined_at);

-- Rebuild employee_overdue_tasks view to exclude unaccepted/declined
-- requests from the receiver's overdue count.
DROP VIEW IF EXISTS public.employee_overdue_tasks;
CREATE VIEW public.employee_overdue_tasks
WITH (security_invoker = true) AS
SELECT
  e.id            AS employee_id,
  e.user_id       AS user_id,
  e.full_name     AS full_name,
  e.branch_id     AS branch_id,
  COALESCE(SUM(CASE
    WHEN t.due_date < CURRENT_DATE
      AND t.status <> 'done'
      AND NOT (t.workflow_type = 'request' AND t.accepted_at IS NULL)
      AND t.declined_at IS NULL
    THEN 1 ELSE 0 END), 0)::int AS overdue_count,
  COALESCE(SUM(CASE
    WHEN t.due_date < CURRENT_DATE
      AND t.status <> 'done'
      AND NOT (t.workflow_type = 'request' AND t.accepted_at IS NULL)
      AND t.declined_at IS NULL
    THEN 1 ELSE 0 END), 0) >= 3 AS is_redlined
FROM public.employees e
LEFT JOIN public.tasks t ON t.assigned_to = e.user_id
WHERE e.employment_status = 'active'
GROUP BY e.id, e.user_id, e.full_name, e.branch_id;
