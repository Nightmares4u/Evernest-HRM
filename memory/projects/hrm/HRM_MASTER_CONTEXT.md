# EN HRM — Master Context

> Single source of truth for the EN Consultants HRM build. If something here changes, update this file first; everything else (charter, MVP scope, data model, implementation plan, code) follows.

---

## 1. Owner & decision authority

- **Owner / sole decision-maker**: Syed Yashal Raza (Regional Manager — North America).
- **CEO**: Sir Raza. Auth user only — no `employees` row. Holds super-admin powers (assigns tasks, schedules, etc.). Exempt from attendance/payroll because he isn't in the `employees` table.
- Yashal is in the `employees` table for **payroll/budget visibility**, but `attendance_exempt = TRUE` so he doesn't follow shifts.
- No other approver.

## 2. Company

- Legal: **EN Consultants (Pvt) Ltd.** | Public brand: **EverNest Consultants**.
- HQ: Karachi. Growth center: Lahore. Marketing team: fully remote.
- Business: study abroad, immigration, work visa consultancy.
- B2C (direct clients) + B2B (partner/agent network).
- Strong revenue: Italy study, South Korea study, B2B processing. Stopped: UK. Dead: Sweden.

## 3. Branches

| Branch    | Code  | Shift (PKT)    | Notes                                       |
|-----------|-------|----------------|---------------------------------------------|
| Karachi   | KHI   | 11:00 – 18:00  | Main revenue center                         |
| Lahore    | LHE   | 10:30 – 18:30  | Punjab growth center                        |
| Remote    | RMT   | n/a            | Marketing team — fully remote, no shifts    |

## 4. Departments (6)

1. **B2C Sales** — counselling-side acquisition (Rabia, Deena, Ushna, Mehwish).
2. **B2B** — partner/agent network processing (Aayan).
3. **Operations** — case processing, document handling (Sufyan).
4. **Marketing** — content, design, social media management (Shehryar, Ravil, Murtaza, Aun). Sub-areas live in `role_description`.
5. **B2C Closing** — counselling + closing (Komal).
6. **Management** — senior leadership (Yashal).

## 5. Users (13 total)

**System admins (Auth + `app_users` only, no `employees` row, role = `super_admin`):**

| Name        | Email                              | Notes                                       |
|-------------|------------------------------------|---------------------------------------------|
| Sir Raza    | `raza@evernestconsultants.com`     | CEO. Assigns tasks/schedules. Not in payroll. |

**Employees (Auth + `app_users` + `employees`):**

| #  | Name      | Branch | Department    | Role                       | Shift            | Salary (PKR) | Notes                                              |
|----|-----------|--------|---------------|----------------------------|------------------|--------------|----------------------------------------------------|
| 1  | Yashal    | KHI    | Management    | Regional Manager — N.A.    | Karachi-Std (exempt) | 40,000   | `attendance_exempt`. Sole approver of marketing tasks. |
| 2  | Komal     | KHI    | B2C Closing   | Branch Manager / Closer    | Komal-Extended   | 130,000      | Karachi branch manager. Logout 19:00.              |
| 3  | Rabia     | KHI    | B2C Sales     | Counsellor                 | Karachi-Standard | 50,000       |                                                    |
| 4  | Aayan     | KHI    | B2B           | B2B Specialist             | Sufyan (13–19)   | 45,000       | Remote Mon + Tue. Recurring tasks on remote days.  |
| 5  | Sufyan    | KHI    | Operations    | Operations                 | Sufyan (13–19)   | 40,000       | Remote Mon + Tue. Recurring tasks on remote days.  |
| 6  | Deena     | KHI    | B2C Sales     | Counsellor                 | Karachi-Standard | 25,000       | Under review                                       |
| 7  | Ushna     | LHE    | B2C Sales     | Lahore Sales / BDO         | Lahore-Standard  | 65,000       | Lahore branch manager                              |
| 8  | Mehwish   | LHE    | B2C Sales     | Counsellor                 | Lahore-Standard  | 65,000       |                                                    |
| 9  | Shehryar  | RMT    | Marketing     | Ads & Campaign Manager     | (exempt)         | 20,000       | Fully remote. `attendance_exempt`. Task-based.     |
| 10 | Ravil     | RMT    | Marketing     | Content Specialist         | (exempt)         | 12,000       | Fully remote. `attendance_exempt`. Task-based.     |
| 11 | Murtaza   | RMT    | Marketing     | Designer                   | (exempt)         | 12,000       | Fully remote. `attendance_exempt`. Under review.   |
| 12 | Aun       | RMT    | Marketing     | Video Designer             | (exempt)         | 13,000       | Fully remote. `attendance_exempt`. Joined ~Apr 26. |

Total monthly direct payroll: **PKR 517,000** (Yashal exempt from attendance but counted in budget).

## 6. Working week

- Mon–Sat (6 days). Sunday **permanently locked off** — never counted. No weekly admin setup.
- All time enforcement uses **server-side `Asia/Karachi` time**. Client clocks never trusted.

## 7. Payroll structure (locked)

**Dual denominator — `/30` for earning, `/26` for deduction.**

| Function                                                              | Denominator        | Example (50k PKR salary) |
|-----------------------------------------------------------------------|--------------------|---------------------------|
| Earning / proration (mid-month hire, mid-month exit, partial-month)   | **`/30`** (calendar days) | 1,667 / day              |
| Deduction (lates, absences, half-days)                                | **`/26`** (working days)  | 1,923 / day              |

**Formulas**:
```
prorated_earnings = monthly_salary × (calendar_days_employed_in_month / 30)
deduction_days    = absent_days + floor(late_count / 3) + max(0, half_day_count − 2) × 0.5
deduction_pkr     = deduction_days × monthly_salary / 26
calculated_net    = max(0, prorated_earnings − deduction_pkr)
final_amount      = calculated_net + sum(adjustments[].amount)   -- bonuses / one-off deductions
```

**Late, half-day, absence rules:**

| Rule                | Value                                                                 |
|---------------------|-----------------------------------------------------------------------|
| Late grace          | 10 min after shift start                                              |
| Half-day threshold  | < 4 h between check-in and check-out                                  |
| Absent              | No check-in for the day                                               |
| Forgot checkout     | `pending_review` + half-day flag; admin corrects                      |
| Late deduction      | `floor(late_count / 3)` days/month                                    |
| Half-day deduction  | `max(0, half_day_count − 2) × 0.5` days/month                         |
| Absent deduction    | 1 day each (unless approved/overridden)                               |

**Marketing-team treatment**: `attendance_exempt = TRUE` ⇒ no `attendance_records` generated, no auto-deductions. Their payslip = full `monthly_salary`. Yashal applies manual `adjustments` if a redline situation calls for it.

## 8. Leave

- 1 paid leave/month, 12/year. Carry-forward unlimited (cap revisitable).
- Manual public holiday entry. Admin day-offs (per-employee/branch/company-wide). Day-off doesn't count as absent/leave/late/half-day.

## 9. Roles

| Role           | Powers                                                                                    |
|----------------|-------------------------------------------------------------------------------------------|
| Super Admin    | Everything — see all branches, salaries, override, audit, export. (Yashal, Sir Raza.)     |
| Admin / HR     | Manage attendance, leave, employees. Salary-edit power TBD.                               |
| Branch Manager | See own branch attendance + tasks. Approve within branch. (Komal — Karachi, Ushna — Lahore.) |
| Manager        | Review assigned team + tasks/proofs.                                                      |
| Employee       | Own dashboard: check-in/out, leave request, tasks, proofs.                                |

## 10. Exemptions (locked)

| User           | `attendance_exempt` | `payroll_exempt` | `remote_allowed` | Notes                                                      |
|----------------|---------------------|-------------------|-------------------|------------------------------------------------------------|
| Sir Raza       | n/a                 | n/a               | n/a               | Auth-only, no `employees` row.                             |
| Yashal         | TRUE                | FALSE             | TRUE              | Senior management. Salary tracked for budget visibility.   |
| Komal          | FALSE               | FALSE             | FALSE             | Extended logout to 19:00.                                  |
| Aayan          | FALSE               | FALSE             | TRUE              | Remote Mon + Tue. Now in attendance enforcement.           |
| Sufyan         | FALSE               | FALSE             | TRUE              | Remote Mon + Tue.                                          |
| Marketing (4)  | TRUE                | FALSE             | TRUE              | Fully remote, no shifts. Verified by task completion.       |
| Everyone else  | FALSE               | FALSE             | FALSE             | Standard branch attendance.                                |

## 11. Remote work — two models

### Model A — Office + remote days (Sufyan, Aayan)

- Has a shift. Attendance enforcement on **all** working days, including remote days.
- On remote days: timely check-in/out (`Asia/Karachi` server time) + completion of **recurring tasks** for that day.
- On office days: normal in-office check-in.
- Recurring tasks ARE the proof — no separate file/proof attachment required (attachments still allowed).

### Model B — Fully remote / objective-based (Marketing team)

- `attendance_exempt = TRUE`. No shift. No daily check-in.
- Verified by **task completion** during the billing period (month). Each marketing role has 1-1 task lists from Yashal.
- Tasks have `requires_approval = TRUE` ⇒ employee submits proof (note + optional attachment); **only Yashal (super-admin)** approves; on approval the task auto-marks `done`.
- **Constant payroll**: full `monthly_salary` paid each month regardless. Manual adjustments via payslip if redline action is needed.

## 12. Tasks

- Working-day-bound: every task has a `due_date`.
- `assigned_to` and `assigned_by` reference `app_users.id` ⇒ Sir Raza, Yashal, employees can all assign + be assigned (including each other).
- `requires_approval`:
  - `TRUE` → only super-admin approval marks `done`. Used for marketing tasks.
  - `FALSE` → assignee can self-mark `done`. Used for recurring office-day tasks (Sufyan/Aayan).
- "Today's tasks" view per user filtered by `due_date` and `assigned_to`.
- Future: CRM tasks pipe in via shared table + `origin = 'crm'` field.

### Recurring tasks

- `recurring_tasks` table is a template: title, description, assignee, schedule (`recurrence_type` + `recurrence_days[]`), priority, `requires_approval`, `active`.
- Daily cron at 23:30 PKT generates `tasks` rows for tomorrow from active templates whose `recurrence_days` include tomorrow's ISO weekday.
- Generated tasks have `recurring_task_id` set so we can trace them back.
- **Initial recurring task seed (Yashal-curated)**: e.g., for Aayan/Sufyan on Mon/Tue — "Clean up lead sheets", "Contact existing partners", "Reply to leads". Yashal creates these via admin UI on Day 9–10.

### Redline rule

- Per-employee count of overdue undone tasks: `count(tasks WHERE assigned_to = user_id AND due_date < today AND status != 'done')`.
- ≥ 3 → employee is **redlined**. Surfaced in admin dashboard with alert.
- View: `employee_overdue_tasks` (in DB).
- Redline doesn't auto-deduct — Yashal handles manually (conversation, then payslip adjustment if warranted).

## 13. Payroll runs + payslips + invoicing

- **`payroll_runs`**: one per month (`UNIQUE (year, month)`). Status: `draft` → `finalized` → `paid`.
- **`payslips`**: one row per employee per run. Captures snapshot inputs + computed amounts + adjustments + disbursement details.
- Workflow:
  1. Yashal triggers "Generate Payroll" for month X → creates `payroll_runs` row + 12 `payslips` rows with calculated values.
  2. Yashal reviews. Adds `adjustments` (jsonb array of `{type, amount, reason}` — bonuses, custom one-off deductions) per employee.
  3. Marks run `finalized` → calculations frozen.
  4. Records actual disbursement per employee: `disbursed_amount`, `payment_method`, `payment_reference`, `paid_at`. Status moves to `paid`.
  5. Generates a printable payslip / invoice per employee (HTML view in MVP; PDF later).

## 14. Office IP / location

- **Soft IP whitelist** per branch. Mismatch → `requires_review = TRUE`, never block.
- **Optional browser geolocation** prompt as fallback. Not mandatory.
- Mobile check-in: not in MVP (desk-only web).

## 15. Tech stack (locked)

| Layer              | Choice                                                          |
|--------------------|-----------------------------------------------------------------|
| Frontend           | Next.js 15 (App Router) on **Vercel free tier**                 |
| DB / Auth / Storage | **Supabase free tier** (Postgres + Auth + Storage)             |
| Time               | Server-side `Asia/Karachi`                                      |
| Domain             | Vercel default `*.vercel.app` (no custom domain in MVP)         |
| Login identifier   | `name@evernestconsultants.com`                                  |
| Account creation   | Admin-only (admin API). Yashal provides emails + initial passwords (`seed/users.csv`). |

GitHub repo: **https://github.com/Nightmares4u/Evernest-HRM** (private).

## 16. Storage

- DB stores **metadata only** (filename, type, size, path, uploader, timestamps).
- Supabase Storage holds files (private bucket `task-proofs`, signed URLs).
- Limits: photos/screenshots ≤ 5 MB, PDFs/docs ≤ 10 MB. No video.

## 17. Audit

Every manual change writes an `audit_logs` row (`actor_id`, `target_type`, `target_id`, `action`, `old_value`, `new_value`, `reason`, `created_at`). Append-only.

## 18. Out of scope (MVP)

- CRM / lead / sales pipeline.
- Mobile app / PWA.
- Biometric, screenshot surveillance, screen recording, keystroke logging.
- WhatsApp / SMS notifications.
- Auto Pakistan public holiday loading.
- GPS tracking.
- Multi-tenant SaaS mode.
- Performance management module.
- Excel / PDF exports (CSV only initially; printable HTML payslip in Phase 2).
- Forced password change on first login.
- Custom domain.

## 19. Future merge

- **CRM**: same `tasks` table + `origin` field.
- **Jarvis** (Yashal's separate orchestration project): explicitly out of HRM scope. May later read HRM as a passive consumer.
- Possible SaaS generalization later — not a v1 concern.
