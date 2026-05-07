# EN HRM — MVP Scope

> **Locked: phased rollout.** Phase 1 (week 1) ships a usable core. Phase 2 (week 2) ships remote work + tasks + recurring tasks + payroll runs + branch-manager UI.

---

## Phase 1 — Week 1 (live for daily use)

**Definition of done**: 9+ non-exempt employees check in via the system every working day with admin intervention <5%; Yashal can pull a payroll-ready CSV at month end.

### 1.1 Auth + accounts
- Supabase Auth, email + password, **admin-created only**.
- 13 users seeded from `seed/users.csv` on Day 1: 1 system admin (Sir Raza, Auth-only) + 12 employees (Yashal also `attendance_exempt`).
- Login: `name@evernestconsultants.com`.
- Forced password change: out of MVP.

### 1.2 Branches, departments, shifts, employees
- Seeded by `0001_init.sql`: 3 branches (KHI/LHE/RMT), 6 departments, 4 shifts.
- Admin "Create Employee" form for new hires post-launch.

### 1.3 Attendance core
- Server-side check-in/out (`Asia/Karachi`).
- Late detection (>10 min grace), half-day flag (<4h worked), absent auto-mark, forgot-checkout flag.
- Sunday lock. Public holiday entry. Admin day-off.
- IP capture (soft whitelist), optional geolocation.
- Marketing team & Sir Raza never appear here (`attendance_exempt`).

### 1.4 Leave
- Monthly accrual cron (1 leave/month).
- Carry-forward unlimited.
- Request → approve/reject → creates `attendance_records` rows for the leave range.

### 1.5 Admin "Today" control panel
- `/admin/today`. Auto-refresh every 60s.
- Per-row override actions, each writes an `audit_logs` row.

### 1.6 Employee dashboard
- Check-in/out, today's status, monthly stats, past 30 days.

### 1.7 Payroll CSV export
- `/admin/payroll?month=YYYY-MM` → CSV with prorated earnings + deduction days + net.
- Marketing folks: full salary, no deduction days.

### 1.8 Audit log (raw)
- Populated. UI deferred to Phase 2.

---

## Phase 2 — Week 2

### 2.1 Storage + remote check-in (Sufyan, Aayan — Model A)
- Supabase Storage bucket `task-proofs`. Signed URLs.
- Remote check-in path: `mode = 'remote'`, captures IP + optional geolocation.
- For Sufyan/Aayan, recurring tasks substitute for separate proof attachments.

### 2.2 Tasks core
- `tasks` schema (already in migration).
- Admin/manager assign UI: `/admin/tasks/new`.
- Employee dashboard: "Today's tasks" / "Upcoming" / "Overdue".
- Task updates with attachments. Status flow.
- Sir Raza ↔ Yashal task assignment works (both Auth-level).

### 2.3 Recurring tasks
- Admin CRUD: `/admin/tasks/recurring`.
- Cron at 23:30 PKT generates tomorrow's `tasks` rows from active templates whose `recurrence_days` match.
- Yashal seeds Aayan/Sufyan recurring tasks (clean lead sheets, contact partners, reply to leads, etc.).
- `requires_approval = false` for recurring office-day tasks (employees self-mark done).

### 2.4 Marketing model + redline
- Marketing tasks: assigned by Yashal, `requires_approval = true`. Employee submits update + proof. Yashal-only approval marks `done` and sets `approved_by`/`approved_at`.
- Redline view (`employee_overdue_tasks`): admin UI surfaces any employee with `overdue_count >= 3` as a flagged row.
- No auto-deduction — Yashal handles redlines manually via payslip adjustments.

### 2.5 Branch manager dashboard
- Komal (Karachi), Ushna (Lahore) — filtered Today panel scoped to own branch.
- Salary fields hidden by default.
- Action set: Correct Check-in/out, Approve Leave (within branch), Override Status. Cannot edit employees or salaries.

### 2.6 Payroll runs + payslips + disbursement tracking
- Yashal triggers "Generate Payroll" for a month → creates `payroll_runs` row + `payslips` rows for all 12 employees.
- Computed values: `prorated_earnings`, `deduction_amount`, `calculated_net`. Snapshot of inputs preserved.
- Edit per-employee `adjustments` (jsonb): `[{type: 'bonus' | 'custom_deduction' | 'allowance', amount, reason}]`.
- Mark run `finalized` → freezes calculation.
- Per-payslip disbursement entry: `disbursed_amount`, `payment_method`, `payment_reference`, `paid_at` → status `paid`.
- Printable HTML payslip / invoice per employee.

### 2.7 Audit log UI
- `/admin/audit` — filterable table.

### 2.8 Reports refinement
- `/admin/reports/monthly` — UI summary, branch rollups, per-employee trend.

---

## Deferred (post-Phase 2)

- Excel / PDF exports.
- Auto Pakistan public holiday loading.
- WhatsApp / SMS notifications.
- Email password reset (Supabase native; enable when needed).
- Mobile / PWA.
- CRM task push integration.
- Performance management module.
- Multi-tenant SaaS mode.
- Forced password change on first login.
- Salary-edit power for branch managers.
- Mid-month shift-change proration.
- Contractor / freelancer entity separate from employees.
- Unpaid leave separate from paid leave.
- Lunch / prayer break tracking.
- Overtime tracking.
- Custom domain.
- Employee self-task creation.
- Marketing dept split into Content / Design / Social sub-departments.
