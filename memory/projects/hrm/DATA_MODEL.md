# EN HRM — Data Model

> Postgres (Supabase). All IDs are UUIDs (Supabase convention) unless noted. All timestamps are `timestamptz` stored in UTC; the application converts at the boundary using `Asia/Karachi`. Enum types listed first; tables follow.

---

## Enums

```sql
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
  'public', 'office_closure', 'special_day_off',
  'branch_specific', 'individual'
);

CREATE TYPE user_role AS ENUM (
  'super_admin', 'admin_hr', 'branch_manager', 'manager', 'employee'
);
```

---

## Tables

### `app_users`

Everyone who can log in. Includes employees + system-only users (Sir Raza, Yashal).

| Column         | Type           | Notes                                          |
|----------------|----------------|------------------------------------------------|
| `id`           | uuid PK        | Equals `auth.users.id`                         |
| `display_name` | text NOT NULL  |                                                |
| `email`        | text NOT NULL UNIQUE | Format `name@evernestconsultants.com`    |
| `role`         | user_role NOT NULL DEFAULT 'employee' |                       |
| `is_active`    | boolean DEFAULT true |                                          |
| `created_at`   | timestamptz DEFAULT now() |                                     |

> **2 system admins** (Sir Raza, Yashal) have `app_users` rows only — no `employees` row. Both have `role='super_admin'`.

### `branches`

| Column             | Type                | Notes                                     |
|--------------------|---------------------|-------------------------------------------|
| `id`               | uuid PK             |                                           |
| `name`             | text NOT NULL       |                                           |
| `code`             | text UNIQUE         | `'KHI'`, `'LHE'`, `'RMT'`                 |
| `default_shift_id` | uuid FK → shifts.id |                                           |
| `ip_whitelist`     | text[] DEFAULT '{}' | Stored as text, validated as IP/CIDR app-side |
| `created_at`       | timestamptz DEFAULT now() |                                     |

Seed: Karachi (KHI), Lahore (LHE), Remote (RMT).

### `departments`

| Column        | Type          | Notes |
|---------------|---------------|-------|
| `id`          | uuid PK       |       |
| `name`        | text NOT NULL |       |
| `created_at`  | timestamptz DEFAULT now() | |

Seed: B2C Sales, B2B, Operations, Marketing, B2C Closing.

### `shifts`

| Column                       | Type             | Notes                              |
|------------------------------|------------------|------------------------------------|
| `id`                         | uuid PK          |                                    |
| `name`                       | text NOT NULL    | `'Karachi-Standard'` etc.          |
| `start_time`                 | time NOT NULL    | `'11:00:00'`                       |
| `end_time`                   | time NOT NULL    | `'18:00:00'`                       |
| `late_grace_minutes`         | int DEFAULT 10   |                                    |
| `half_day_threshold_minutes` | int DEFAULT 240  | 4 h                                |
| `created_at`                 | timestamptz DEFAULT now() |                          |

Seed: Karachi-Standard (11–18), Lahore-Standard (10:30–18:30), Komal-Extended (11–19), Sufyan (13–19).

### `employees`

Payroll-tracked staff. **11 rows in MVP** (Sir Raza and Yashal are not in this table).

| Column                  | Type                                | Notes                                       |
|-------------------------|-------------------------------------|---------------------------------------------|
| `id`                    | uuid PK                             |                                             |
| `user_id`               | uuid UNIQUE FK → app_users.id       |                                             |
| `full_name`             | text NOT NULL                       |                                             |
| `phone`                 | text                                |                                             |
| `branch_id`             | uuid FK → branches.id               |                                             |
| `department_id`         | uuid FK → departments.id            |                                             |
| `manager_id`            | uuid FK → employees.id              | NULL for branch managers (their actual manager Yashal isn't in `employees`) |
| `shift_id`              | uuid FK → shifts.id                 |                                             |
| `monthly_salary`        | numeric(12,2) NOT NULL              |                                             |
| `role_description`      | text                                | Free-text role title (e.g., "Counsellor", "Video Designer") |
| `employment_status`     | employment_status DEFAULT 'active'  |                                             |
| `attendance_exempt`     | boolean DEFAULT false               | Aayan (for now)                             |
| `payroll_exempt`        | boolean DEFAULT false               | Reserved (currently no employees use this — Yashal/Sir Raza are auth-only) |
| `remote_allowed`        | boolean DEFAULT false               | Sufyan + Marketing team                     |
| `remote_default_days`   | int[] DEFAULT '{}'                  | ISO weekday: 1=Mon..7=Sun. Sufyan = `{1,2}`, Marketing = `{1,2,3,4,5,6}` |
| `hire_date`             | date NOT NULL                       |                                             |
| `termination_date`      | date                                |                                             |
| `created_at`            | timestamptz DEFAULT now()           |                                             |
| `updated_at`            | timestamptz DEFAULT now()           |                                             |

### `holidays`

| Column         | Type                              | Notes                                        |
|----------------|-----------------------------------|----------------------------------------------|
| `id`           | uuid PK                           |                                              |
| `date`         | date NOT NULL                     |                                              |
| `name`         | text NOT NULL                     |                                              |
| `type`         | holiday_type NOT NULL             |                                              |
| `branch_id`    | uuid FK → branches.id             | NULL = company-wide                          |
| `employee_id`  | uuid FK → employees.id            | NULL except `type='individual'`              |
| `is_paid`      | boolean DEFAULT true              | Reserved for future unpaid closures          |
| `created_by`   | uuid FK → app_users.id            |                                              |
| `created_at`   | timestamptz DEFAULT now()         |                                              |

Composite uniqueness enforced app-side: `(date, branch_id, employee_id)` triple cannot duplicate.

### `attendance_records`

One row per employee per working day. No row for Sundays.

| Column            | Type                                 | Notes                                      |
|-------------------|--------------------------------------|--------------------------------------------|
| `id`              | uuid PK                              |                                            |
| `employee_id`     | uuid FK → employees.id               |                                            |
| `date`            | date NOT NULL                        |                                            |
| `shift_id`        | uuid FK → shifts.id                  | Snapshot of shift at record creation       |
| `expected_start`  | timestamptz NOT NULL                 |                                            |
| `expected_end`    | timestamptz NOT NULL                 |                                            |
| `check_in_at`     | timestamptz                          |                                            |
| `check_out_at`    | timestamptz                          |                                            |
| `worked_minutes`  | int                                  | Computed at check-out                      |
| `status`          | attendance_status NOT NULL DEFAULT 'absent' |                                     |
| `late_minutes`    | int DEFAULT 0                        |                                            |
| `is_late`         | boolean DEFAULT false                |                                            |
| `is_half_day`     | boolean DEFAULT false                |                                            |
| `is_absent`       | boolean DEFAULT true                 | Flips to false on check-in                 |
| `mode`            | attendance_mode DEFAULT 'office'     |                                            |
| `ip_address`      | inet                                 |                                            |
| `user_agent`      | text                                 |                                            |
| `geolocation`     | jsonb                                | `{lat, lng, accuracy}` if granted          |
| `branch_id`       | uuid FK → branches.id                |                                            |
| `requires_review` | boolean DEFAULT false                |                                            |
| `approved_by`     | uuid FK → app_users.id               |                                            |
| `approval_note`   | text                                 |                                            |
| `created_at`      | timestamptz DEFAULT now()            |                                            |
| `updated_at`      | timestamptz DEFAULT now()            |                                            |

UNIQUE `(employee_id, date)`.

### `leave_balances`

One row per employee per month.

| Column              | Type                            | Notes                                |
|---------------------|---------------------------------|--------------------------------------|
| `id`                | uuid PK                         |                                      |
| `employee_id`       | uuid FK → employees.id          |                                      |
| `year`              | int NOT NULL                    |                                      |
| `month`             | int NOT NULL                    | 1..12                                |
| `accrued`           | numeric(4,1) DEFAULT 1.0        |                                      |
| `used`              | numeric(4,1) DEFAULT 0.0        |                                      |
| `carry_forward_in`  | numeric(4,1) DEFAULT 0.0        |                                      |
| `balance`           | numeric(4,1) GENERATED ALWAYS AS (accrued + carry_forward_in - used) STORED | |
| `updated_at`        | timestamptz DEFAULT now()       |                                      |

UNIQUE `(employee_id, year, month)`.

### `leave_requests`

| Column         | Type                              | Notes                              |
|----------------|-----------------------------------|------------------------------------|
| `id`           | uuid PK                           |                                    |
| `employee_id`  | uuid FK → employees.id            |                                    |
| `start_date`   | date NOT NULL                     |                                    |
| `end_date`     | date NOT NULL                     |                                    |
| `days_count`   | numeric(4,1) NOT NULL             | Excludes Sundays/holidays          |
| `reason`       | text                              |                                    |
| `status`       | leave_status DEFAULT 'pending'    |                                    |
| `reviewed_by`  | uuid FK → app_users.id            |                                    |
| `reviewed_at`  | timestamptz                       |                                    |
| `review_note`  | text                              |                                    |
| `created_at`   | timestamptz DEFAULT now()         |                                    |

### `tasks` *(week 2)*

| Column          | Type                              | Notes                                                                |
|-----------------|-----------------------------------|----------------------------------------------------------------------|
| `id`            | uuid PK                           |                                                                      |
| `title`         | text NOT NULL                     |                                                                      |
| `description`   | text                              |                                                                      |
| `assigned_to`   | uuid FK → **app_users.id** NOT NULL | Any logged-in user (employee, branch manager, or super-admin).      |
| `assigned_by`   | uuid FK → app_users.id NOT NULL   | Sir Raza, Yashal, admins, branch managers. Anyone with assign perms. |
| `branch_id`     | uuid FK → branches.id             |                                                                      |
| `department_id` | uuid FK → departments.id          |                                                                      |
| `due_date`      | date NOT NULL                     | Working day                                                          |
| `priority`      | task_priority DEFAULT 'normal'    |                                                                      |
| `status`        | task_status DEFAULT 'to_do'       |                                                                      |
| `origin`        | text DEFAULT 'hrm'                | Future: `'crm'`                                                      |
| `created_at`    | timestamptz DEFAULT now()         |                                                                      |
| `completed_at`  | timestamptz                       |                                                                      |

> **Both `assigned_to` and `assigned_by` reference `app_users.id`.** This lets Sir Raza ↔ Yashal assign tasks to each other (neither has an `employees` row), and lets either of them assign to any employee (whose `app_users.id` is the same as their `employees.user_id`).

### `task_updates` *(week 2)*

| Column                  | Type                                | Notes                                       |
|-------------------------|-------------------------------------|---------------------------------------------|
| `id`                    | uuid PK                             |                                             |
| `task_id`               | uuid FK → tasks.id                  |                                             |
| `user_id`               | uuid FK → **app_users.id**          | Whoever posted the update (could be a super-admin updating their own assigned task). |
| `attendance_record_id`  | uuid FK → attendance_records.id     | Nullable; links remote-day proofs (only employees check in, so this is null for super-admin updates). |
| `note`                  | text                                |                                             |
| `status_update`         | task_status                         |                                             |
| `created_at`            | timestamptz DEFAULT now()           |                                             |

### `task_attachments` *(week 2)*

| Column            | Type                              | Notes                              |
|-------------------|-----------------------------------|------------------------------------|
| `id`              | uuid PK                           |                                    |
| `task_update_id`  | uuid FK → task_updates.id         |                                    |
| `uploaded_by`     | uuid FK → app_users.id            |                                    |
| `file_name`       | text NOT NULL                     |                                    |
| `file_type`       | text NOT NULL                     |                                    |
| `file_size`       | int NOT NULL                      |                                    |
| `storage_path`    | text NOT NULL                     | Supabase Storage object path       |
| `checksum`        | text                              | Optional                           |
| `created_at`      | timestamptz DEFAULT now()         |                                    |

### `audit_logs`

Immutable. Append-only.

| Column         | Type                              | Notes                                                    |
|----------------|-----------------------------------|----------------------------------------------------------|
| `id`           | uuid PK                           |                                                          |
| `actor_id`     | uuid FK → app_users.id            |                                                          |
| `target_type`  | text NOT NULL                     | `'attendance_record'`, `'leave_request'`, `'employee'`, `'task'`, … |
| `target_id`    | uuid NOT NULL                     |                                                          |
| `action`       | text NOT NULL                     | `'override_attendance'`, `'approve_leave'`, …            |
| `old_value`    | jsonb                             |                                                          |
| `new_value`    | jsonb                             |                                                          |
| `reason`       | text                              |                                                          |
| `created_at`   | timestamptz DEFAULT now()         |                                                          |

INDEX `(target_type, target_id)`, `(actor_id, created_at)`.

### `settings`

Singleton k/v for global tunables.

| Column        | Type                              | Notes |
|---------------|-----------------------------------|-------|
| `key`         | text PK                           |       |
| `value`       | jsonb NOT NULL                    |       |
| `updated_at`  | timestamptz DEFAULT now()         |       |

---

## RLS (high-level)

- `app_users.role = 'super_admin'`: full access on all tables.
- `app_users.role = 'employee'`: SELECT on own `employees` row, own `attendance_records`, own `leave_balances`, own `leave_requests`, own `tasks` (`assigned_to = self.id`). INSERT on `attendance_records` (own only, today only). INSERT on `leave_requests` (own only). INSERT on `task_updates` (`user_id = self.id`).
- `app_users.role = 'branch_manager'`: SELECT on own branch's employees / attendance / leave / tasks. UPDATE on own branch `attendance_records` (overrides). **No salary visibility** by default — implemented via column-level policy or a salary-stripped view.
- All write operations from the admin UI use **server actions with the service role** (bypassing RLS) and explicitly write `audit_logs`. Direct client writes restricted to: own check-in/out, own leave requests, own task updates.

---

## Indexes (beyond PK + UNIQUE)

- `attendance_records (date, branch_id)` — Today panel.
- `attendance_records (employee_id, date DESC)` — employee dashboard "past 30 days".
- `leave_balances (employee_id, year DESC, month DESC)`.
- `leave_requests (status, created_at DESC)` — admin queue.
- `tasks (assigned_to, due_date)` — "today's tasks" view.
- `tasks (status, due_date)` — overdue queries.
- `audit_logs (target_type, target_id)`.
- `audit_logs (actor_id, created_at DESC)`.

---

## Cron jobs

| Job                          | Schedule           | Action                                                                                                                        |
|------------------------------|--------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `nightly_attendance_close`   | 23:59 PKT daily    | Mark no-check-in active employees as `absent`. Mark open check-ins as `pending_review` + `is_half_day=true` (forgot checkout). Skip Sundays / holidays / day-offs / `attendance_exempt` employees. |
| `monthly_leave_accrual`      | 00:01 PKT, 1st     | Insert new `leave_balances` row per active non-exempt employee with `accrued=1.0` and `carry_forward_in = previous month's balance`. |

Implemented as **Vercel Cron + Next.js API route** protected by a shared-secret header. Vercel runs cron in UTC, so:
- Nightly attendance close: `59 18 * * *` UTC (= 23:59 PKT).
- Monthly leave accrual: `1 19 28-31 * *` UTC with an in-handler "is this the last day of the month" guard (Vercel cron doesn't support "last day of month" syntax directly).

---

## Storage

- Bucket: `task-proofs` (private). Access via signed URLs only.
- Path convention: `task-proofs/{employee_id}/{YYYY}/{MM}/{task_update_id}/{filename}`.
- Limits enforced app-side: photos/screenshots ≤ 5 MB, PDFs/docs ≤ 10 MB. No video.
