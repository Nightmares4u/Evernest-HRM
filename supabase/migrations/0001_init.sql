-- =========================================================
-- EN HRM — initial schema
-- Apply in Supabase SQL Editor, or via `supabase migration up`.
-- Includes: enums, core tables, attendance, leave, tasks (+ recurring),
-- payroll runs + payslips, audit, settings, indexes, RLS, seed data.
-- =========================================================

-- ---------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------
CREATE TYPE employment_status AS ENUM ('active', 'inactive', 'terminated');

CREATE TYPE attendance_status AS ENUM (
  'present', 'late', 'half_day', 'absent',
  'on_leave', 'day_off', 'public_holiday',
  'remote_present', 'remote_late', 'remote_half_day',
  'remote_pending_review', 'remote_rejected',
  'pending_review', 'approved_manually'
);

CREATE TYPE attendance_mode AS ENUM ('office', 'remote', 'manual');
CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE task_status AS ENUM ('to_do', 'in_progress', 'done', 'blocked');
CREATE TYPE task_priority AS ENUM ('low', 'normal', 'urgent');
CREATE TYPE holiday_type AS ENUM (
  'public', 'office_closure', 'special_day_off', 'branch_specific', 'individual'
);
CREATE TYPE user_role AS ENUM (
  'super_admin', 'admin_hr', 'branch_manager', 'manager', 'employee'
);
CREATE TYPE recurrence_type AS ENUM ('weekly', 'monthly', 'daily');
CREATE TYPE payroll_run_status AS ENUM ('draft', 'finalized', 'paid');
CREATE TYPE payslip_status AS ENUM ('draft', 'approved', 'paid');

-- ---------------------------------------------------------
-- CORE TABLES
-- ---------------------------------------------------------
CREATE TABLE app_users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  email         text NOT NULL UNIQUE,
  role          user_role NOT NULL DEFAULT 'employee',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shifts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL UNIQUE,
  start_time                  time NOT NULL,
  end_time                    time NOT NULL,
  late_grace_minutes          int NOT NULL DEFAULT 10,
  half_day_threshold_minutes  int NOT NULL DEFAULT 240,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  code              text NOT NULL UNIQUE,
  default_shift_id  uuid REFERENCES shifts(id),
  ip_whitelist      text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  full_name             text NOT NULL,
  phone                 text,
  branch_id             uuid REFERENCES branches(id),
  department_id         uuid REFERENCES departments(id),
  manager_id            uuid REFERENCES employees(id),
  shift_id              uuid REFERENCES shifts(id),
  monthly_salary        numeric(12,2) NOT NULL,
  role_description      text,
  employment_status     employment_status NOT NULL DEFAULT 'active',
  attendance_exempt     boolean NOT NULL DEFAULT false,
  payroll_exempt        boolean NOT NULL DEFAULT false,
  remote_allowed        boolean NOT NULL DEFAULT false,
  remote_default_days   int[] NOT NULL DEFAULT '{}',
  hire_date             date NOT NULL,
  termination_date      date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employees_branch_idx ON employees(branch_id);
CREATE INDEX employees_user_idx ON employees(user_id);

-- ---------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------
CREATE TABLE holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL,
  name          text NOT NULL,
  type          holiday_type NOT NULL,
  branch_id     uuid REFERENCES branches(id),
  employee_id   uuid REFERENCES employees(id),
  is_paid       boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES app_users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX holidays_date_idx ON holidays(date);

CREATE TABLE attendance_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date              date NOT NULL,
  shift_id          uuid REFERENCES shifts(id),
  expected_start    timestamptz NOT NULL,
  expected_end      timestamptz NOT NULL,
  check_in_at       timestamptz,
  check_out_at      timestamptz,
  worked_minutes    int,
  status            attendance_status NOT NULL DEFAULT 'absent',
  late_minutes      int NOT NULL DEFAULT 0,
  is_late           boolean NOT NULL DEFAULT false,
  is_half_day       boolean NOT NULL DEFAULT false,
  is_absent         boolean NOT NULL DEFAULT true,
  mode              attendance_mode NOT NULL DEFAULT 'office',
  ip_address        inet,
  user_agent        text,
  geolocation       jsonb,
  branch_id         uuid REFERENCES branches(id),
  requires_review   boolean NOT NULL DEFAULT false,
  approved_by       uuid REFERENCES app_users(id),
  approval_note     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
CREATE INDEX attendance_date_branch_idx ON attendance_records(date, branch_id);
CREATE INDEX attendance_employee_date_idx ON attendance_records(employee_id, date DESC);

-- ---------------------------------------------------------
-- LEAVE
-- ---------------------------------------------------------
CREATE TABLE leave_balances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year              int NOT NULL,
  month             int NOT NULL CHECK (month BETWEEN 1 AND 12),
  accrued           numeric(4,1) NOT NULL DEFAULT 1.0,
  used              numeric(4,1) NOT NULL DEFAULT 0.0,
  carry_forward_in  numeric(4,1) NOT NULL DEFAULT 0.0,
  balance           numeric(4,1) GENERATED ALWAYS AS (accrued + carry_forward_in - used) STORED,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, month)
);

CREATE TABLE leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  days_count    numeric(4,1) NOT NULL,
  reason        text,
  status        leave_status NOT NULL DEFAULT 'pending',
  reviewed_by   uuid REFERENCES app_users(id),
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leave_requests_status_idx ON leave_requests(status, created_at DESC);

-- ---------------------------------------------------------
-- TASKS + RECURRING TASKS
-- ---------------------------------------------------------
CREATE TABLE recurring_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text,
  assigned_to         uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  assigned_by         uuid NOT NULL REFERENCES app_users(id),
  branch_id           uuid REFERENCES branches(id),
  department_id       uuid REFERENCES departments(id),
  recurrence_type     recurrence_type NOT NULL,
  recurrence_days     int[] NOT NULL,
  priority            task_priority NOT NULL DEFAULT 'normal',
  requires_approval   boolean NOT NULL DEFAULT false,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text,
  assigned_to         uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  assigned_by         uuid NOT NULL REFERENCES app_users(id),
  branch_id           uuid REFERENCES branches(id),
  department_id       uuid REFERENCES departments(id),
  due_date            date NOT NULL,
  priority            task_priority NOT NULL DEFAULT 'normal',
  status              task_status NOT NULL DEFAULT 'to_do',
  origin              text NOT NULL DEFAULT 'hrm',
  recurring_task_id   uuid REFERENCES recurring_tasks(id),
  requires_approval   boolean NOT NULL DEFAULT false,
  approved_by         uuid REFERENCES app_users(id),
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
CREATE INDEX tasks_assigned_due_idx ON tasks(assigned_to, due_date);
CREATE INDEX tasks_status_due_idx ON tasks(status, due_date);
CREATE INDEX tasks_recurring_idx ON tasks(recurring_task_id);

CREATE TABLE task_updates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                 uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES app_users(id),
  attendance_record_id    uuid REFERENCES attendance_records(id),
  note                    text,
  status_update           task_status,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_updates_task_idx ON task_updates(task_id, created_at DESC);

CREATE TABLE task_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_update_id    uuid NOT NULL REFERENCES task_updates(id) ON DELETE CASCADE,
  uploaded_by       uuid REFERENCES app_users(id),
  file_name         text NOT NULL,
  file_type         text NOT NULL,
  file_size         int NOT NULL,
  storage_path      text NOT NULL,
  checksum          text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- View: per-employee count of overdue undone tasks. is_redlined = count >= 3.
CREATE VIEW employee_overdue_tasks AS
SELECT
  e.id            AS employee_id,
  e.user_id       AS user_id,
  e.full_name     AS full_name,
  e.branch_id     AS branch_id,
  COALESCE(SUM(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'done' THEN 1 ELSE 0 END), 0)::int AS overdue_count,
  COALESCE(SUM(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'done' THEN 1 ELSE 0 END), 0) >= 3 AS is_redlined
FROM employees e
LEFT JOIN tasks t ON t.assigned_to = e.user_id
WHERE e.employment_status = 'active'
GROUP BY e.id, e.user_id, e.full_name, e.branch_id;

-- ---------------------------------------------------------
-- PAYROLL
-- ---------------------------------------------------------
CREATE TABLE payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year            int NOT NULL,
  month           int NOT NULL CHECK (month BETWEEN 1 AND 12),
  status          payroll_run_status NOT NULL DEFAULT 'draft',
  notes           text,
  created_by      uuid REFERENCES app_users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  finalized_at    timestamptz,
  finalized_by    uuid REFERENCES app_users(id),
  UNIQUE (year, month)
);

CREATE TABLE payslips (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id              uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- snapshot of inputs
  monthly_salary              numeric(12,2) NOT NULL,
  calendar_days_employed      int NOT NULL,
  absent_days                 numeric(4,1) NOT NULL DEFAULT 0,
  late_count                  int NOT NULL DEFAULT 0,
  half_day_count              int NOT NULL DEFAULT 0,
  leaves_used                 numeric(4,1) NOT NULL DEFAULT 0,
  deduction_days              numeric(4,1) NOT NULL DEFAULT 0,
  -- computed (formulae per HRM_MASTER_CONTEXT §7)
  prorated_earnings           numeric(12,2) NOT NULL DEFAULT 0,
  deduction_amount            numeric(12,2) NOT NULL DEFAULT 0,
  calculated_net              numeric(12,2) NOT NULL DEFAULT 0,
  -- adjustments (jsonb array of {type, amount, reason})
  adjustments                 jsonb NOT NULL DEFAULT '[]',
  final_amount                numeric(12,2) NOT NULL DEFAULT 0,
  -- disbursement
  disbursed_amount            numeric(12,2),
  payment_method              text,
  payment_reference           text,
  paid_at                     timestamptz,
  status                      payslip_status NOT NULL DEFAULT 'draft',
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id)
);
CREATE INDEX payslips_employee_idx ON payslips(employee_id);

-- ---------------------------------------------------------
-- AUDIT + SETTINGS
-- ---------------------------------------------------------
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES app_users(id),
  target_type   text NOT NULL,
  target_id     uuid NOT NULL,
  action        text NOT NULL,
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_target_idx ON audit_logs(target_type, target_id);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id, created_at DESC);

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- SEED DATA: shifts, branches, departments, settings
-- ---------------------------------------------------------
INSERT INTO shifts (name, start_time, end_time, late_grace_minutes, half_day_threshold_minutes) VALUES
  ('Karachi-Standard', '11:00', '18:00', 10, 240),
  ('Lahore-Standard',  '10:30', '18:30', 10, 240),
  ('Komal-Extended',   '11:00', '19:00', 10, 240),
  ('Sufyan',           '13:00', '19:00', 10, 240);

INSERT INTO branches (name, code, default_shift_id) VALUES
  ('Karachi', 'KHI', (SELECT id FROM shifts WHERE name = 'Karachi-Standard')),
  ('Lahore',  'LHE', (SELECT id FROM shifts WHERE name = 'Lahore-Standard')),
  ('Remote',  'RMT', (SELECT id FROM shifts WHERE name = 'Karachi-Standard'));

INSERT INTO departments (name) VALUES
  ('B2C Sales'),
  ('B2B'),
  ('Operations'),
  ('Marketing'),
  ('B2C Closing'),
  ('Management');

INSERT INTO settings (key, value) VALUES
  ('payroll',     '{"earning_denominator": 30, "deduction_denominator": 26, "redline_threshold": 3}'::jsonb),
  ('attendance',  '{"late_grace_minutes": 10, "half_day_threshold_minutes": 240}'::jsonb),
  ('weekly_off',  '{"days": [7]}'::jsonb);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
ALTER TABLE app_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_updates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays            ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings            ENABLE ROW LEVEL SECURITY;

-- helper function: is current user a super_admin?
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
$$;

-- super_admin can do anything (applied to every table)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'app_users','employees','attendance_records','leave_balances','leave_requests',
    'tasks','task_updates','task_attachments','recurring_tasks',
    'payroll_runs','payslips','audit_logs','holidays','branches','departments','shifts','settings'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY super_admin_all ON %I FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin())',
      t
    );
  END LOOP;
END $$;

-- employee self-policies
CREATE POLICY app_users_self_select          ON app_users          FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY employees_self_select          ON employees          FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY attendance_self_select         ON attendance_records FOR SELECT TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));
CREATE POLICY attendance_self_insert         ON attendance_records FOR INSERT TO authenticated WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) AND date = (now() AT TIME ZONE 'Asia/Karachi')::date);
CREATE POLICY attendance_self_update         ON attendance_records FOR UPDATE TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()) AND date = (now() AT TIME ZONE 'Asia/Karachi')::date);
CREATE POLICY leave_balance_self_select      ON leave_balances     FOR SELECT TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));
CREATE POLICY leave_request_self_select      ON leave_requests     FOR SELECT TO authenticated USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));
CREATE POLICY leave_request_self_insert      ON leave_requests     FOR INSERT TO authenticated WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));
CREATE POLICY tasks_self_select              ON tasks              FOR SELECT TO authenticated USING (assigned_to = auth.uid());
CREATE POLICY task_updates_self_insert       ON task_updates       FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND task_id IN (SELECT id FROM tasks WHERE assigned_to = auth.uid()));
CREATE POLICY task_updates_self_select       ON task_updates       FOR SELECT TO authenticated USING (user_id = auth.uid() OR task_id IN (SELECT id FROM tasks WHERE assigned_to = auth.uid()));
CREATE POLICY task_attachments_select_linked ON task_attachments   FOR SELECT TO authenticated USING (task_update_id IN (SELECT id FROM task_updates WHERE user_id = auth.uid()));

-- everyone authenticated can read taxonomy tables
CREATE POLICY shifts_read_all       ON shifts       FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_read_all  ON departments  FOR SELECT TO authenticated USING (true);
CREATE POLICY branches_read_all     ON branches     FOR SELECT TO authenticated USING (true);
CREATE POLICY holidays_read_all     ON holidays     FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_read_all     ON settings     FOR SELECT TO authenticated USING (true);
