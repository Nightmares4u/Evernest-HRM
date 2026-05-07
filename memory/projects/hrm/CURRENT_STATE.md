# EN HRM — Current State

> Snapshot of where the project actually stands. Update this on every meaningful change.

**Last updated**: Phase 4 — attendance UI foundation.

## Branch & commits

- Working branch: **`dev`**.
- `main` holds: Day-0 scaffold + planning docs (commit `d7e055a`).
- `dev` ahead of `main`:
  - `6168b8e` — feat: add initial HRM dashboard shell (Day 1, Gemini-authored, Claude-audited).
  - `76e7b1e` — feat: prepare Supabase seed workflow (Phase 1 — admin client + seed script).
  - `06c973e` — feat: HRM domain types + employee directory mock data (Phase 2).
  - `6f19103` — fix: stabilize auth middleware and prepare real sign-in flow (Phase 3).
  - (next) — Phase 4: attendance UI foundation (Today panel, status chips, dashboard wired to mock).
- Repo: https://github.com/Nightmares4u/Evernest-HRM (private).

## Build / typecheck

- `npm run build`: green.
- `npx tsc --noEmit`: green.

## What exists (real, in-tree)

### App code
- `app/page.tsx` — redirect to `/login`.
- `app/login/page.tsx` — dual-mode. With Supabase env: real form posting to `signIn` server action. Without env: "Continue (Mock)" Link to `/dashboard` + amber dev-mode banner. Renders error from `?error=` query param.
- `app/login/actions.ts` — server actions `signIn` and `signOut`. Env-safe (degrade to mock behavior if Supabase isn't configured). Uses `redirect()` for both success and error paths.
- `app/(dashboard)/layout.tsx` — sidebar + header. Header shows "mock mode" pill when env is missing. Logout is a form posting to `signOut`.
- `app/(dashboard)/dashboard/page.tsx` — derives stat counts from `makeMockTodayAttendance()`. Two side panels: headcount/payroll, attendance snapshot. Both link into deeper pages.
- `app/(dashboard)/employees/page.tsx` — directory table backed by mock data. Shows branch, department, role, shift, salary, remote days, exemption flags.
- `app/(dashboard)/attendance/page.tsx` — Today panel: 5 summary cards (present/late/half-day/absent/pending), full row table with mode chip, expected/check-in/check-out times, worked minutes, status + needs-review chips, disabled Override button (lands Phase 5). Sunday banner. Footer note about exempt staff.
- `app/(dashboard)/admin/page.tsx` — placeholder shell (Phase 5).

### Supabase glue
- `lib/supabase/client.ts` — browser client (anon key).
- `lib/supabase/server.ts` — server-only. Exports:
  - `createClient()` — request-cookie-bound anon client (RLS enforced).
  - `createAdminClient()` — service-role client (RLS bypassed). Throws if env vars are missing.
- `middleware.ts` — env-safe. Skips all auth checks when Supabase env is missing (dev/mock mode). With env: refreshes session, redirects unauthenticated users away from non-public paths to `/login`, redirects authenticated users away from `/login` to `/dashboard`. Public paths: `/login`, `/api/cron`.

### Domain types + mock data
- `lib/types/hrm.ts` — TypeScript types for every HRM entity (enums + tables + view + UI-helper composed types). Aligned with `0001_init.sql`.
- `lib/mock/hrm.ts` — mock branches, departments, shifts, employees, and a `makeMockTodayAttendance()` helper. Used by UI surfaces while Supabase is unconfigured.
- `lib/attendance/format.ts` — pure helpers: `attendanceChip(status)`, `formatTimePKT(iso)`, `formatWorkedMinutes(min)`, `weekdayPKT()`, `isSundayPKT()`, `todayPKT()`. All Asia/Karachi timezone aware.
- `components/StatusChip.tsx` — `<StatusChip status={…} />` and generic `<Chip label tone />`. Tones span all attendance state colors.

### Scripts
- `scripts/seed-users.ts` — one-shot user seeder.
  - Reads `memory/projects/hrm/seed/users.csv`.
  - Refuses to run if CSV or `.env.local` missing.
  - Validates required columns.
  - Two-pass FK resolution (creates everyone, then resolves `manager_email -> manager_id`).
  - Creates `auth.users` + `app_users` + (for employees) `employees`.
  - Idempotent — skips users whose email already exists.
  - Run with: `npm run seed:users`.

### Schema
- `supabase/migrations/0001_init.sql` — full schema (enums, tables, RLS, seed for branches/departments/shifts/settings, `employee_overdue_tasks` view). 418 lines. **Not yet applied to a real Supabase project.**

### Planning docs
- `memory/projects/hrm/HRM_MASTER_CONTEXT.md`
- `memory/projects/hrm/PROJECT_CHARTER.md`
- `memory/projects/hrm/MVP_SCOPE.md`
- `memory/projects/hrm/DATA_MODEL.md`
- `memory/projects/hrm/IMPLEMENTATION_PLAN.md`
- `memory/projects/hrm/OPEN_QUESTIONS.md`
- `memory/projects/hrm/CURRENT_STATE.md` (this file)
- `memory/projects/hrm/seed/users.csv.example` — sanitized template (committed).

## What is NOT real yet

- **Auth at runtime**: scaffolded. Real `signInWithPassword` flow in place but inert until `.env.local` exists. Dev navigation via "Continue (Mock)" still works.
- **Dashboard / Today data**: derived from `makeMockTodayAttendance()`, not DB. Status fixtures hand-tuned to demonstrate every chip variant.
- **Supabase project**: not provisioned. URL/keys not set.
- **`.env.local`**: does not exist locally.
- **Migration**: not yet applied.
- **Seed**: not yet run.
- **Cron jobs**: not yet implemented.
- **Live employee data**: directory uses `MOCK_EMPLOYEES`, not DB.

## What is safe to commit

Explicit paths:
- `app/**`
- `lib/**`
- `middleware.ts`
- `scripts/**` (the script itself contains no credentials)
- `supabase/migrations/*.sql`
- `memory/projects/hrm/*.md`
- `memory/projects/hrm/seed/users.csv.example`
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- `.gitignore`, `.env.local.example`, `README.md`

## What MUST NEVER be committed

- `memory/projects/hrm/seed/users.csv` — plaintext passwords. **In `.gitignore`.**
- `.env.local` — Supabase keys + cron secret. **In `.gitignore`.**
- `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts` — build artifacts. **In `.gitignore`.**

## Next phases (in order)

1. **Phase 1**: admin client + seed script + state refresh. ✅
2. **Phase 2**: HRM domain types + mock employee directory. ✅
3. **Phase 3**: Real login server action + middleware route protection (both env-safe). ✅
4. **Phase 4 (this commit)**: Today attendance panel UI + status chips + dashboard wired to mock. ✅
5. **Phase 5**: Admin foundations — branch/shift display, admin placeholders (no destructive actions).
6. **(Yashal — out of band)**: Provision Supabase project. Apply `0001_init.sql`. Populate `.env.local`. Run `npm run seed:users`.

## Decisions made autonomously this phase

- Renamed npm script `seed` -> `seed:users` (more explicit; future seeds can follow `seed:<thing>` pattern).
- `createAdminClient()` uses `@supabase/supabase-js` directly (not `@supabase/ssr`) since admin operations don't need cookie binding.
- Middleware unchanged from Gemini's commit in this phase. Auth gate moves in Phase 3 with explicit env-missing safety.
