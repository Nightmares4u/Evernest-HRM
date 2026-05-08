# EN HRM — Current State

> Snapshot of where the project actually stands. Update this on every meaningful change.

**Last updated**: Phase 11 — power-user overview, recurring tasks, IP whitelist + geolocation.

## Branch & commits

- Working branch: **`dev`**.
- `main` holds: Day-0 scaffold + planning docs (commit `d7e055a`).
- `dev` ahead of `main`. Latest commits (newest first):
  - `61851c1` — feat: office IP whitelist + browser geolocation on check-in (Phase 10)
  - `a84c7bd` — feat: recurring tasks — CRUD + manual today-generator (Phase 9)
  - `3552ee7` — feat: tasks foundation — employee + admin views, assign/approve flow (Phase 8)
  - `ee60fc2` — feat: leave request, balance, admin approve/reject + audit log
  - `cc34f52` — feat: real check-in / check-out flow
  - `0db1dca` — feat: wire HRM pages to real Supabase reads
  - `2a67964` — chore: reset env example placeholders
  - `3918d0e` — feat: add admin foundation overview (Phase 5)
  - `6e2d620` — feat: add attendance UI foundation (Phase 4)
  - `6f19103` — fix: stabilize auth middleware and prepare real sign-in flow (Phase 3)
  - `06c973e` — feat: HRM domain types + employee directory mock data (Phase 2)
  - `76e7b1e` — feat: prepare Supabase seed workflow (Phase 1)
  - `6168b8e` — feat: initial HRM dashboard shell (Day 1)
- Repo: https://github.com/Nightmares4u/Evernest-HRM (private). Live Supabase project provisioned, `0001_init.sql` applied, 13 users seeded.

## Build / typecheck

- `npm run build`: green. 12 routes (1 static, 11 dynamic).
- `npx tsc --noEmit`: green.

## What's live (real Supabase wiring)

### Routes

| Route | Audience | What it does |
|---|---|---|
| `/login` | public | Real Supabase email+password sign-in via server action. Falls back to "Continue (Mock)" if env missing. |
| `/dashboard` | any signed-in | Personal landing. `MyAttendanceCard` shows today's status + Check-in / Check-out buttons. Stat cards aggregate today's attendance. |
| `/attendance` | any signed-in | Today panel. Per-row table of every tracked employee's status, mode, times, worked, late minutes, needs-review chip. |
| `/employees` | any signed-in | Directory table with branch / dept / role / shift / salary / remote days / exemptions. |
| `/leave` | employees | Submit leave request, see balance + history. |
| `/admin/leave` | super-admin | Approve / reject leave queue. Approval inserts on_leave attendance rows + decrements balance + audit-logs. |
| `/tasks` | any signed-in | My tasks grouped today / awaiting approval / overdue / upcoming / recently done. Approval-required tasks have a "Submit for approval" form; others have "Mark done". |
| `/admin/tasks` | super-admin | Assign-task form (any app_user as assignee, due_date, priority, requires_approval). Filters: open / pending approval / overdue / all. Per-row Approve / Reject for marketing-style tasks. |
| `/admin/tasks/recurring` | super-admin | Recurring template CRUD: create (weekly day picker + priority + requires_approval), pause/resume, delete. "Generate today's tasks" button — idempotent. |
| `/admin` | super-admin | **Power-user overview.** Action cards: pending leave, pending task approvals, today's check-in coverage (X/Y), active recurring count. Redlined section (only shown if ≥1 employee has 3+ overdue undone tasks). Headcount/payroll stats. Branch + department + shift + remote-roster tables. Quick-link grid to all admin sections + dashed cards for still-planned controls. |

### Server actions (all audit-logged where they mutate state)

- `app/login/actions.ts`: `signIn`, `signOut`.
- `app/(dashboard)/attendance/actions.ts`: `checkIn(formData)` — accepts browser-captured lat/lng/accuracy; matches request IP against `branches.ip_whitelist` (office mode only) and flags `requires_review` on mismatch. `checkOut()` — closes the day with worked minutes + half-day flag.
- `app/(dashboard)/leave/actions.ts`: `submitLeaveRequest`, `approveLeaveRequest`, `rejectLeaveRequest`.
- `app/(dashboard)/tasks/actions.ts`: `markTaskDone`, `submitForApproval`, `createTask`, `approveTask`, `rejectTask`.
- `app/(dashboard)/admin/tasks/recurring/actions.ts`: `createRecurringTask`, `toggleRecurringActive`, `deleteRecurringTask`, `generateTasksForToday`.

### Domain + helpers
- `lib/types/hrm.ts` — typed mirror of every entity in `0001_init.sql`.
- `lib/db/queries.ts` — server-side reads: employees, attendance (mine + today panel), leave (balance, my requests, admin queue), taxonomy (branches, departments, shifts), `getAdminPendingCounts()` (action-card numbers).
- `lib/db/tasks.ts` — task reads: `listMyTasks` (grouped), `listTasksForAdmin` (filterable), `listAssignableUsers`, `listRecurringTasks`, `listRedlinedEmployees`.
- `lib/auth/current-user.ts` — `getCurrentUser()` returns auth user + app_users row + employees row.
- `lib/attendance/format.ts` — Asia/Karachi-aware time / date / weekday helpers + status chip mapping.
- `lib/attendance/policy.ts` — pure rule helpers: `computeOnCheckIn`, `computeOnCheckOut`, `ipMatchesWhitelist`, `isoWeekdayPKT`, `buildPktTimestamp`.
- `lib/leave/policy.ts` — working-day counting helpers for leave proration.
- `lib/mock/hrm.ts` — used by every read function as a fallback when Supabase env is missing.

### Components
- `components/StatusChip.tsx` — `<StatusChip>` (attendance status) and `<Chip label tone>` (generic).
- `components/MyAttendanceCard.tsx` — server component. Renders state for the current user's today record; embeds `<CheckInButton>` for the not-yet-checked-in path.
- `components/CheckInButton.tsx` — client component. Captures browser geolocation (8s timeout, declined / unavailable yields null), then invokes `checkIn` server action with `FormData{ lat, lng, accuracy }`.

### Schema
- `supabase/migrations/0001_init.sql` — applied. All tables, RLS, seed (3 branches, 6 departments, 4 shifts, default settings), `employee_overdue_tasks` view.

### Seed
- `scripts/seed-users.ts` — applied. 13 users now in `auth.users` + `app_users` (+ 12 in `employees`). Two-pass FK resolution for `manager_email`.
- `memory/projects/hrm/seed/users.csv` — local only, gitignored, contains plaintext temp passwords. Pattern: `EN-2026-{firstname}`.

## Still pending (post-MVP backlog)

- **Cron handlers** (`app/api/cron/*`) protected by `CRON_SECRET`:
  - `nightly_attendance_close` — auto-mark absent + forgot-checkout (23:59 PKT).
  - `monthly_leave_accrual` — +1 leave to non-exempt employees on 1st.
  - `daily_recurring_generate` — replace the manual "Generate today's tasks" button (23:30 PKT).
- **Override actions** on `/attendance` (Correct check-in/out, Mark day off, Override status, Add note). Each writes audit_logs.
- **Holidays admin UI** (`/admin/holidays`).
- **Branch IP whitelist editor** (server-side check is live; UI editor pending).
- **Audit log viewer** (`/admin/audit`).
- **Payroll runs + payslips** UI (`/admin/payroll/*`). Schema is in place (`payroll_runs`, `payslips`).
- **Super-admin restriction at handler level**. Currently any signed-in user can hit `/admin/*` URLs; RLS on the underlying tables prevents writes by non-super-admins, but a clean redirect to `/dashboard?error=…` for non-admins would be polite. Add to middleware or admin layout.
- **Task attachments** (Supabase Storage `task-proofs` bucket; metadata table is ready).

## What MUST NEVER be committed

- `memory/projects/hrm/seed/users.csv` — plaintext passwords. **In `.gitignore`.**
- `.env.local` — Supabase keys + cron secret. **In `.gitignore`.**
- `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts` — build artifacts. **In `.gitignore`.**
