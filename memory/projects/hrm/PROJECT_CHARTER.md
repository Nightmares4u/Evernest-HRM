# EN HRM — Project Charter

## Project

**EN Consultants HRM** — internal HR operations system covering attendance, leave, remote-work accountability, lightweight task tracking, and payroll-ready summaries for **13 users** (11 active employees + Yashal + Sir Raza, both as Auth-only super-admins) across Karachi, Lahore, and a remote marketing group.

## Owner

**Syed Yashal Raza** — sole decision authority for scope, timeline, design, and sign-off. No additional approval chain.

## Why now

Company is **not failing — it is under-structured**. No reliable attendance, no enforced quotas, weak accountability, CEO over-dependency. HRM is the first control system the company will run on. Every later layer (CRM, payroll automation, performance management) rides on top of this.

## Goals

1. **Server-enforced attendance** for Karachi + Lahore + allowed remote staff. Late, half-day, absent calculated from server-side `Asia/Karachi` time.
2. **Admin-controlled employee creation.** No self-signup. Yashal provides company emails + initial passwords (see `seed/users.csv`).
3. **Leave request + balance** with monthly accrual + carry-forward.
4. **Remote work accountability** for Sufyan and the Marketing team: check-in + proof + EOD summary required for `Remote Present`.
5. **Internal task module** with **working-day-bound deadlines** visible per employee. Sir Raza and Yashal can assign tasks to anyone (including each other).
6. **Admin override** on every record + immutable audit log.
7. **Monthly payroll-ready CSV summary** (lates, half-days, absences, leave, deduction days, prorated earnings, net pay using dual `/30` + `/26` denominator structure).
8. **Live for internal use within 1 week** of build start (Phase 1, see `MVP_SCOPE.md`).
9. **Phase 2 live within 2 weeks** of build start (remote work + tasks + branch-manager UI + audit-log UI + refined reports).

## Non-goals

- CRM / lead tracking / sales pipeline.
- Full project management (sprints, dependencies, advanced time tracking).
- Biometric, surveillance, GPS, or invasive monitoring.
- Mobile app / PWA.
- Multi-tenant SaaS.
- Public product launch / generalization.
- Custom domain (Vercel default for MVP).

## Success criteria

- All non-exempt active employees (≥9 of the 10 attendance-tracked, since Aayan is exempt) check in via the system daily for **2 consecutive weeks** with admin intervention on **<5%** of records.
- Monthly summary CSV reconciles with manual count for the same period (zero variance after corrections).
- Sufyan's remote days reliably tagged `Remote Present` or `Pending Review` with proof attached every working day.
- Marketing team submits remote check-in + proof + EOD summary daily.
- Yashal can override any record; the change is audit-logged with actor, old/new value, and reason.
- Sir Raza can assign tasks to employees, to Yashal, and vice versa, through his account.

## Constraints

- **Budget**: free-tier hosting only (Vercel + Supabase). Paid upgrade path planned for post-stabilization once payroll-critical.
- **Timeline**: Phase 1 live within 1 week; Phase 2 live within 2 weeks of implementation start.
- **Time zone**: `Asia/Karachi` enforced server-side. Client clocks never trusted.
- **Auth**: admin-creates-account flow. Passwords never visible to admins after creation (Supabase hashes).
- **Data ownership**: HRM is system of record for attendance + internal tasks. CRM (future) integrates via the same `tasks` table + `origin` field.

## Decisions (locked)

| Area                      | Decision                                                                                          |
|---------------------------|---------------------------------------------------------------------------------------------------|
| Stack                     | Next.js (Vercel) + Supabase (Postgres + Auth + Storage)                                           |
| Domain                    | Vercel default `*.vercel.app` — no custom domain in MVP                                            |
| Email format              | `name@evernestconsultants.com`                                                                     |
| Yashal account            | **Auth user only**, `super_admin` role, no `employees` row                                         |
| Sir Raza account          | **Auth user only**, `super_admin` role, no `employees` row                                         |
| Departments               | B2C Sales, B2B, Operations, Marketing, B2C Closing                                                 |
| Branches                  | Karachi (KHI), Lahore (LHE), Remote (RMT)                                                          |
| Working week              | Mon–Sat. Sunday permanently locked.                                                                |
| Late grace                | 10 min                                                                                             |
| Half-day threshold        | < 4 h worked                                                                                       |
| Late deduction            | `floor(late / 3)` days                                                                             |
| Half-day deduction        | `max(0, half_day_count − 2) × 0.5` days                                                            |
| Payroll denominator       | **Dual: `/30` calendar for earning, `/26` working for deduction**                                  |
| IP enforcement            | Soft (mismatch → `pending_review`). Optional browser geolocation fallback.                         |
| Forgot checkout           | `pending_review` + half-day flag. Admin corrects.                                                  |
| Tasks                     | Lightweight, working-day-bound. `assigned_to` + `assigned_by` reference `app_users.id` (super-admins assignable). |
| Task assignment scope     | Admin / manager / Sir Raza / Yashal can assign. Employee self-create out of MVP.                   |
| Account creation          | Admin-only. Forced password change on first login: not in MVP.                                     |
| Mobile check-in           | Not in MVP. Desk-only web.                                                                         |
| Jarvis coupling           | None. HRM is a standalone build.                                                                   |
| MVP rollout               | Option B (phased): Week 1 core, Week 2 remote/tasks/manager.                                       |

## Open items requiring confirmation

See `OPEN_QUESTIONS.md`. Top items:

1. **Initial passwords review** in `seed/users.csv` (pattern `EN-2026-{firstname}` — edit if you want different).
2. **Hire dates** (`2025-01-01` placeholder for everyone except Aun = `2026-04-01`). Doesn't block Day 1; correct in admin UI later if needed.
3. **Marketing remote days** confirmation (`{1,2,3,4,5,6}` Mon–Sat — override if some come into office).
4. Branch managers (Komal, Ushna): salary visibility yes/no, in-branch attendance correction power yes/no (defaults set in `OPEN_QUESTIONS.md`).
5. Marketing remote rules: same as Sufyan (proof + summary each working day) or lighter? Default: same.

## Sign-off

> **Yashal — _______________________ — date __________**
>
> Once signed, scope is frozen. Changes require a logged amendment in this file (date + line).
