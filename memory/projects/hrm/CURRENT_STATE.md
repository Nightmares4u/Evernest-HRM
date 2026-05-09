# EN HRM — Current State

> Snapshot of where the project actually stands. Update this on every meaningful change.

**Last updated**: Phase A — geolocation-only attendance verification (200m office radius).

## Branch & commits

- Working branch: **`dev`**.
- `main` holds: Day-0 scaffold + planning docs (commit `d7e055a`).
- `dev` ahead of `main`. Latest commits (newest first):
  - `d3da196` — fix: repair task completion and attendance review visibility
  - `fbba24e` — feat: email notifications for task assignment and check-in/out (Resend) (Phase 14)
  - `e795131` — feat: done-tasks history (employee + admin, list + heatmap) (Phase 13b)
  - `d30e05d` — fix: surface geolocation denials and flag check-ins without location proof (Phase 13a)
  - `e1bb73c` — feat: task schedule grid + dashboard task assignment + due_time (Phase 12)
  - `cd5396c` — perf: cut per-request Supabase round-trips on page loads
  - `68db854` — feat: power-user overview on /admin (Phase 11)
  - `61851c1` — feat: office IP whitelist + browser geolocation on check-in (Phase 10)
  - `a84c7bd` — feat: recurring tasks — CRUD + manual today-generator (Phase 9)
  - `3552ee7` — feat: tasks foundation — employee + admin views, assign/approve flow (Phase 8)
  - `ee60fc2` — feat: leave request, balance, admin approve/reject + audit log
  - `cc34f52` — feat: real check-in / check-out flow
  - `0db1dca` — feat: wire HRM pages to real Supabase reads
  - earlier scaffold commits (Phases 1–7) preserved.
- Repo: https://github.com/Nightmares4u/Evernest-HRM (private). Live Supabase project provisioned, `0001_init.sql` applied, 13 users seeded.

## Build / typecheck

- `npm run build`: green. 12 routes (1 static, 11 dynamic).
- `npx tsc --noEmit`: green.

## What's live (real Supabase wiring)

### Routes

| Route | Audience | What it does |
|---|---|---|
| `/login` | public | Real Supabase email+password sign-in via server action. Falls back to "Continue (Mock)" if env missing. |
| `/dashboard` | any signed-in | Personal landing. `MyAttendanceCard` shows today's status + geolocation-capturing Check-in / Check-out buttons. Stat cards aggregate today's attendance. Super-admins see pending attendance reviews. |
| `/attendance` | any signed-in | Today panel. Per-row table of every tracked employee's status, mode, times, worked, late minutes, geofence verification chips, review reason, and super-admin override form. |
| `/employees` | any signed-in | Directory table with branch / dept / role / shift / salary / remote days / exemptions. |
| `/leave` | employees | Submit leave request, see balance + history. |
| `/admin/leave` | super-admin | Approve / reject leave queue. Approval inserts on_leave attendance rows + decrements balance + audit-logs. |
| `/tasks` | any signed-in | My tasks grouped today / awaiting approval / overdue / upcoming / recently done. Approval-required tasks have a "Submit for approval" form; others have "Mark done". |
| `/admin/tasks` | super-admin | Assign-task form (any app_user as assignee, due_date, priority, requires_approval). Filters: open / pending approval / overdue / all. Per-row Approve / Reject for marketing-style tasks. |
| `/admin/tasks/recurring` | super-admin | Recurring template CRUD: create (weekly day picker + priority + requires_approval + due_time), pause/resume, delete. "Generate today's tasks" button — idempotent. |
| `/tasks/history` | any signed-in | Personal done-task history with This week / Last week / This month / Last month / All time filters + 3 stat cards. Chronological list. |
| `/admin/tasks/history` | super-admin | Company done-task history. Same range filters + Last 8 weeks. List / Grid view tabs. Grid is a heatmap: rows=assignees, cols=last 8 weeks, cells colour-scaled by count. Top-3 performers shown as stat cards. |
| `/admin` | super-admin | **Power-user overview.** Action cards: pending leave, pending task approvals, today's check-in coverage (X/Y), active recurring count. Redlined section (only shown if ≥1 employee has 3+ overdue undone tasks). Headcount/payroll stats. Branch + department + shift + remote-roster tables. Quick-link grid to all admin sections + dashed cards for still-planned controls. |

### Server actions (all audit-logged where they mutate state)

- `app/login/actions.ts`: `signIn`, `signOut`.
- `app/(dashboard)/attendance/actions.ts`: `checkIn(formData)` — accepts browser-captured lat/lng/accuracy/status, calculates server-side distance from assigned branch office coordinates, stores first-class check-in coordinates/distance/verification status/review reason, and flags `requires_review` if outside the 200m office radius or location is denied/unavailable/timeout. `checkOut(formData)` captures browser location once at checkout, stores first-class checkout coordinates/distance, closes the day with worked minutes + half-day flag, and preserves any existing review flag. `overrideAttendanceRecord` lets active super-admins manually correct an existing row and writes `audit_logs`.
- `app/(dashboard)/leave/actions.ts`: `submitLeaveRequest`, `approveLeaveRequest`, `rejectLeaveRequest`.
- `app/(dashboard)/tasks/actions.ts`: `markTaskDone`, `submitForApproval`, `createTask`, `approveTask`, `rejectTask`.
- `app/(dashboard)/admin/tasks/recurring/actions.ts`: `createRecurringTask`, `toggleRecurringActive`, `deleteRecurringTask`, `generateTasksForToday`.

### Domain + helpers
- `lib/types/hrm.ts` — typed mirror of the applied schema, including Phase A branch office geofence fields and attendance verification columns.
- `lib/db/queries.ts` — server-side reads: employees, attendance (mine + today panel), leave (balance, my requests, admin queue), taxonomy (branches, departments, shifts), `getAdminPendingCounts()` (action-card numbers).
- `lib/db/tasks.ts` — task reads: `listMyTasks` (grouped), `listTasksForAdmin` (filterable), `listAssignableUsers`, `listRecurringTasks`, `listRedlinedEmployees`, `listTasksInRange` (schedule grid), `listDoneTasks` (history pages).
- `lib/email/send.ts` + `lib/email/templates.ts` — Resend wrapper (`isEmailConfigured()` gate, `sendEmailSafely()` wrapper that never breaks server actions) and inline-styled HTML templates for `taskAssignedEmail`, `checkInEmail`, `checkOutEmail`.
- `lib/auth/current-user.ts` — `getCurrentUser()` returns auth user + app_users row + employees row.
- `lib/attendance/format.ts` — Asia/Karachi-aware time / date / weekday helpers + status chip mapping.
- `lib/attendance/policy.ts` — pure rule helpers: `computeOnCheckIn`, `computeOnCheckOut`, `isoWeekdayPKT`, `buildPktTimestamp`.
- `lib/leave/policy.ts` — working-day counting helpers for leave proration.
- `lib/mock/hrm.ts` — used by every read function as a fallback when Supabase env is missing.

### Components
- `components/StatusChip.tsx` — `<StatusChip>` (attendance status) and `<Chip label tone>` (generic).
- `components/MyAttendanceCard.tsx` — server component. Renders state for the current user's today record; embeds `<CheckInButton>` and `<CheckOutButton>`.
- `components/CheckInButton.tsx` — client component. Captures browser geolocation once per action (8s timeout, declined / unavailable yields a status), then invokes the relevant server action with `FormData{ lat, lng, accuracy, geolocation_status }`.

### Schema
- `supabase/migrations/0001_init.sql` — applied. All tables, RLS, seed (3 branches, 6 departments, 4 shifts, default settings), `employee_overdue_tasks` view.
- `supabase/migrations/0002_task_due_time.sql` — applied. Adds task / recurring-task due-time support.
- `supabase/migrations/0003_geolocation_attendance_verification.sql` — applied. Adds branch office latitude/longitude/radius and attendance check-in/out coordinate, distance, verification status, and review reason columns. Seeds Karachi + Lahore office coordinates at 200m radius.

### Seed
- `scripts/seed-users.ts` — applied. 13 users now in `auth.users` + `app_users` (+ 12 in `employees`). Two-pass FK resolution for `manager_email`.
- `memory/projects/hrm/seed/users.csv` — local only, gitignored, contains plaintext temp passwords. Pattern: `EN-2026-{firstname}`.

## Still pending (post-MVP backlog)

- **Email config in `.env.local`**: set `RESEND_API_KEY`, optionally `EMAIL_FROM` (with a verified domain) and `NEXT_PUBLIC_APP_URL`. Without these, email sends are no-op'd and logged.
- **Cron handlers** (`app/api/cron/*`) protected by `CRON_SECRET`:
  - `nightly_attendance_close` — auto-mark absent + forgot-checkout (23:59 PKT).
  - `monthly_leave_accrual` — +1 leave to non-exempt employees on 1st.
  - `daily_recurring_generate` — replace the manual "Generate today's tasks" button (23:30 PKT).
- **Holidays admin UI** (`/admin/holidays`).
- **Audit log viewer** (`/admin/audit`).
- **Payroll runs + payslips** UI (`/admin/payroll/*`). Schema is in place (`payroll_runs`, `payslips`).
- **Super-admin restriction at handler level**. Currently any signed-in user can hit `/admin/*` URLs; RLS on the underlying tables prevents writes by non-super-admins, but a clean redirect to `/dashboard?error=…` for non-admins would be polite. Add to middleware or admin layout.
- **Task attachments** (Supabase Storage `task-proofs` bucket; metadata table is ready).

## What MUST NEVER be committed

- `memory/projects/hrm/seed/users.csv` — plaintext passwords. **In `.gitignore`.**
- `.env.local` — Supabase keys + cron secret. **In `.gitignore`.**
- `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts` — build artifacts. **In `.gitignore`.**
