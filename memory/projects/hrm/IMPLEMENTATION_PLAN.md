# EN HRM — Implementation Plan

> 14-day plan. Phase 1 ships live by end of Day 7; Phase 2 ships by end of Day 14.

---

## Day 0 — Prep status

| Item                                                             | Status                                                         |
|------------------------------------------------------------------|----------------------------------------------------------------|
| Payroll dual `/30` + `/26` structure                             | ✅ Accepted                                                     |
| `seed/users.csv` (13 users)                                      | ✅ Prepared at `memory/projects/hrm/seed/users.csv`             |
| Company-email format                                             | ✅ `name@evernestconsultants.com`                                |
| Department list (6)                                              | ✅ B2C Sales, B2B, Operations, Marketing, B2C Closing, Management |
| Branches (3) + shifts (4)                                        | ✅ Seeded in migration                                           |
| Sir Raza account shape                                           | ✅ Auth-only, `super_admin`, no `employees` row                 |
| Yashal account shape                                             | ✅ Employee row + `attendance_exempt=true`. Salary tracked for budget. |
| Aayan attendance enforcement                                     | ✅ Re-enabled. Remote Mon + Tue.                                 |
| Marketing model                                                  | ✅ `attendance_exempt=true`, task-based, Yashal-only approval    |
| Repo: github.com/Nightmares4u/Evernest-HRM                       | ✅ Created (empty)                                               |
| Migration SQL                                                    | ✅ `supabase/migrations/0001_init.sql`                           |
| Next.js + Tailwind scaffold                                      | ✅ `app/`, `lib/supabase/`, `middleware.ts`                      |
| Vercel + Supabase free-tier accounts                             | ⏳ Yashal — confirm projects exist                                |
| `npm install` + `.env.local` populated                           | ⏳ Yashal — Day 1 first action                                   |
| Spot-check `seed/users.csv`                                      | ⏳ Yashal — passwords / hire dates / Sir Raza email              |

---

## Phase 1 — Week 1

### Day 1 — Schema, auth, seed

- `npm install` (locally).
- Create Supabase project (free tier). Get URL + anon key + service role key. Populate `.env.local`.
- Run migration in Supabase SQL Editor: `supabase/migrations/0001_init.sql`.
- Implement `scripts/seed-users.ts` — reads `users.csv`, creates `auth.users` + `app_users` + (if employee) `employees` rows. Two-pass for `manager_email` resolution. Use Supabase admin API.
- Run seed.
- Implement `/login` page (email + password → Supabase Auth → redirect to `/`).
- Smoke test: log in as Yashal, Komal, Sufyan, Rabia.

### Day 2 — Attendance core (check-in / check-out)

- Server actions `checkIn()`, `checkOut()`. Server time only.
- Compute `late_minutes`, `is_late`, `is_half_day`, `worked_minutes`.
- Block on Sundays/holidays/day-offs.
- Capture IP + optional geolocation.
- Cron: `nightly_attendance_close` at `59 18 * * *` UTC (= 23:59 PKT). Marks absent + forgot-checkout. Skips `attendance_exempt` employees.

### Day 3 — Admin Today panel + override + audit

- `/admin/today` — server-rendered, refresh 60s.
- Per-row actions: Correct Check-in/out, Mark Day Off, Approve Leave Retroactively, Override Status, Add Note.
- Each action: DB change + `audit_logs` insert in same transaction.
- `/admin/holidays` page.

### Day 4 — Employee dashboard + leave

- `/dashboard` — today's shift, status, check-in/out, monthly stats card, past 30 days table.
- `/leave/new` — request form.
- `/admin/leave` — admin queue.
- Approval creates `attendance_records` rows with `status='on_leave'` and decrements `leave_balances.used`.
- Cron: `monthly_leave_accrual` (`1 19 28-31 * *` UTC + in-handler last-day check).

### Day 5 — Payroll CSV export

- `/admin/payroll?month=YYYY-MM`.
- Per-employee compute per `HRM_MASTER_CONTEXT.md` §7 (dual `/30` + `/26`).
- Marketing employees: full salary, deduction_days = 0.
- CSV download.

### Day 6 — Polish + edge cases + UAT

- Verify all exemptions/shifts work as expected.
- Yashal end-to-end UAT.

### Day 7 — Soft launch

- Fix UAT findings.
- Train staff. Distribute credentials.
- **Soft policy: don't enforce deductions for the first calendar week.** Annotate but don't subtract.
- Live.

---

## Phase 2 — Week 2

### Day 8 — Storage + remote check-in (Model A)

- Supabase Storage bucket `task-proofs`. Private. Signed URLs.
- Remote check-in path: `mode = 'remote'`. Required for Sufyan + Aayan on Mon/Tue.
- Sufyan/Aayan's `requires_review` only triggers if no recurring task is completed by EOD (cron rule).

### Day 9 — Tasks core + recurring tasks scaffold

- `/admin/tasks/new` — create one-off task.
- Employee dashboard: "Today's tasks" / "Upcoming" / "Overdue" filtered by `assigned_to = current_user_id`.
- Task detail page: post update + attachments.
- `/admin/tasks/recurring` — CRUD recurring task templates.
- Cron `daily_recurring_generate` at `30 18 * * *` UTC (= 23:30 PKT) generates tomorrow's `tasks` rows from active templates whose `recurrence_days` include tomorrow's ISO weekday.
- Yashal seeds Aayan/Sufyan recurring tasks.

### Day 10 — Marketing model + approval flow + redline

- Marketing tasks default `requires_approval = true`.
- Approval UI for super-admin: list of pending-approval tasks → review proof → approve (sets `approved_by`, `approved_at`, `status='done'`).
- Redline view in admin Today panel: any employee from `employee_overdue_tasks` with `is_redlined = true` shown with red flag.

### Day 11 — Branch manager dashboard

- `/manager/today` — filtered version of admin Today.
- Approve Leave + Override Status restricted to own branch.
- Salary fields hidden.

### Day 12 — Payroll runs + payslips + disbursement

- `/admin/payroll/runs` — list runs, "Generate for [Month]" button.
- "Generate" creates `payroll_runs` row + `payslips` rows.
- `/admin/payroll/runs/[id]` — review table. Per-row: edit `adjustments`, save.
- "Finalize Run" button → status `finalized`.
- Per-payslip disbursement form: `disbursed_amount`, `payment_method`, `payment_reference`, `paid_at` → status `paid`.
- Printable payslip view: `/admin/payroll/payslips/[id]/print`.

### Day 13 — Audit log UI + reports refinement

- `/admin/audit` — filterable table.
- `/admin/reports/monthly` — UI summary + branch rollups + per-employee trend.

### Day 14 — Buffer + Phase 2 launch

- UAT pass with Sufyan, Komal, Ushna, marketing team.
- Fix.
- Sir Raza onboarded for task assignment + Yashal ↔ Sir Raza flow tested.
- Phase 2 live. Switch payroll to enforce deductions (off the soft policy).

---

## Risk register

| Risk                                                              | Mitigation                                                                                                            |
|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Office IP changes (dynamic) → false `requires_review` storm        | Soft enforcement only. Today panel surfaces these for one-click admin approval.                                       |
| Vercel free-tier cron limits                                       | Free tier supports daily crons. If hit, move to Supabase scheduled functions.                                         |
| Supabase free-tier DB size (500 MB)                                | Attendance + audit growth tiny. File proofs in Storage (1 GB free). Plenty of headroom for 13 users 1+ year.          |
| `seed/users.csv` accidentally committed                            | Already in `.gitignore`. Only `users.csv.example` template is committed.                                               |
| Marketing daily proof requirement onerous                          | OPEN_QUESTIONS — if too heavy, switch marketing to less granular proof (per-week instead of per-task).                |
| Yashal/Sir Raza assignment to each other                           | `tasks.assigned_to` references `app_users.id`, not `employees.id`. Verified Day 9.                                    |
| Redline missed because cron doesn't fire                           | Redline is computed live via `employee_overdue_tasks` view, not cron-cached. Always current.                          |
| Recurring task generator runs late / not at all                    | Cron protected by `CRON_SECRET`. Add idempotency: skip if tomorrow's task already exists for a given recurring template. |
| Cron times wrong (Vercel runs UTC)                                 | Schedule explicit UTC: nightly `59 18`, recurring `30 18`, monthly accrual `1 19 28-31` + last-day handler check.     |

---

## Stretch / cut list (if behind schedule)

If Day 6 looks underwater, cut from Phase 1 in this order:
1. Past-30-days table → show last 7 only.
2. Public-holiday admin UI → seed via Supabase Studio.
3. Approve Leave Retroactively → handle via Override Status.
4. Monthly stats card "est. deduction days" → drop.

If Day 13 looks underwater, cut from Phase 2 in this order:
1. Audit log UI → keep raw table; defer UI to week 3.
2. Reports refinement → keep CSV-only.
3. Branch manager dashboard → give Komal/Ushna read-only admin role temporarily.
4. Printable HTML payslip → defer; CSV-only payroll for now.
