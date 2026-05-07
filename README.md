# EN HRM

Internal HR system for **EN Consultants (Pvt) Ltd.** (public brand: EverNest Consultants).

Single-tenant. Not a SaaS. Not generalized.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS
- **Supabase** (Postgres + Auth + Storage)
- **Vercel** (free tier hosting)

## Status

Active development. Phase 1 = core attendance + leave + payroll CSV (week 1). Phase 2 = remote work + tasks + recurring tasks + payroll runs + branch manager UI (week 2).

Full planning base in [`memory/projects/hrm/`](./memory/projects/hrm/):

- [`HRM_MASTER_CONTEXT.md`](./memory/projects/hrm/HRM_MASTER_CONTEXT.md) — single source of truth
- [`PROJECT_CHARTER.md`](./memory/projects/hrm/PROJECT_CHARTER.md) — owner, goals, decisions
- [`MVP_SCOPE.md`](./memory/projects/hrm/MVP_SCOPE.md) — Phase 1 / Phase 2 features
- [`DATA_MODEL.md`](./memory/projects/hrm/DATA_MODEL.md) — full Postgres schema
- [`IMPLEMENTATION_PLAN.md`](./memory/projects/hrm/IMPLEMENTATION_PLAN.md) — Day-by-day plan
- [`OPEN_QUESTIONS.md`](./memory/projects/hrm/OPEN_QUESTIONS.md) — pending decisions

## Setup

### Prerequisites

- Node 20+
- A Supabase project (free tier)
- Vercel account (or run locally)

### First-time setup

```bash
# 1. Install deps
npm install

# 2. Copy env template, fill in Supabase keys + CRON_SECRET
cp .env.local.example .env.local

# 3. Run schema (in Supabase SQL Editor, paste & run)
#    File: supabase/migrations/0001_init.sql
#    This creates all tables, RLS policies, and seeds branches/departments/shifts/settings.

# 4. Seed users (creates Auth users + app_users + employees rows from users.csv)
npm run seed

# 5. Run dev server
npm run dev
# Open http://localhost:3000
```

### users.csv

Edit `memory/projects/hrm/seed/users.csv` before running `npm run seed`. The file is in `.gitignore` because it contains plaintext initial passwords. A sanitized template lives at `users.csv.example`.

13 users currently:
- 1 system admin (Sir Raza) — Auth user only.
- 12 employees — Auth user + `app_users` row + `employees` row.

## Architecture quick notes

- **Time**: server-side `Asia/Karachi`. Client clocks ignored.
- **Auth**: admin-creates-account flow. No self-signup.
- **Two account models**:
  - System admins (Sir Raza): `app_users` row only, role `super_admin`. Can assign tasks to anyone.
  - Employees: `app_users` row + `employees` row. Have shifts (or are exempt), attendance, payroll.
- **Two remote work models**:
  - **Office + remote days** (Sufyan, Aayan): shift enforcement on all working days, including remote days. Remote days have recurring tasks.
  - **Fully remote / objective-based** (Marketing): `attendance_exempt=true`, no shifts. Verified by task completion. Only Yashal approves task proofs.
- **Payroll**: dual denominator. `/30` calendar for earning, `/26` working for deduction. Marketing folks paid full salary (no daily deductions).
- **Tasks**: working-day-bound. Recurring tasks generate daily instances via cron. `requires_approval=true` for marketing tasks (Yashal-approval required to mark done); false for office-day recurring tasks (employee self-marks).
- **Redline**: any active employee with ≥3 overdue undone tasks is flagged in admin UI.
- **Audit**: every manual override writes an `audit_logs` row.

## Repo layout

```
app/                # Next.js App Router pages
components/         # shared UI
lib/
  supabase/         # server + client + admin helpers
memory/projects/hrm # planning docs (single source of truth)
scripts/            # one-shot scripts (seed-users, etc.)
supabase/
  migrations/       # SQL migrations (0001_init.sql)
```

## Cron jobs (Vercel Cron — UTC schedule, Asia/Karachi local)

| Job                            | UTC schedule        | Local PKT       | Action                                                |
|--------------------------------|---------------------|-----------------|-------------------------------------------------------|
| Nightly attendance close       | `59 18 * * *`       | 23:59           | Mark absent / forgot-checkout                         |
| Monthly leave accrual          | `1 19 28-31 * *`    | ~00:01 of 1st   | Add 1 leave day to non-exempt employees + carry-fwd   |
| Daily recurring task generation | `30 18 * * *`      | 23:30           | Generate `tasks` rows from active recurring templates for tomorrow |

All cron handlers protected by `CRON_SECRET` request header.

## Owner / sole maintainer

Syed Yashal Raza (Regional Manager — North America).
