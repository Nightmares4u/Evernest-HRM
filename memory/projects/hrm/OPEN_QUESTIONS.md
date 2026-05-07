# EN HRM — Open Questions

> **Blocker** = blocks Day-1 implementation. **Soon** = blocks MVP polish or week-2 ship. **Later** = post-launch / iteration.

---

## Blocker — answer before Day 1

1. **Spot-check `seed/users.csv`.** Specifically: initial passwords (pattern `EN-2026-{firstname}` — edit if you want different), Sir Raza email handle (currently `raza@evernestconsultants.com`), hire dates (`2025-01-01` placeholder for everyone except Aun = `2026-04-01`), marketing remote_default_days (`{1,2,3,4,5,6}` Mon–Sat).
2. **Supabase project + Vercel project** — confirm both exist (free tier). Get URL + keys into `.env.local`.

## Soon — answer before week-2 ship (defaults locked unless you override)

3. **Branch managers (Komal, Ushna) salary visibility.** Default: hidden.
4. **Branch manager attendance-correction power.** Default: yes for own branch.
5. **Leave carry-forward cap.** Default: unlimited.
6. **Public holiday default scope.** Default: company-wide.
7. **Marketing approval — strictly Yashal only, or any super-admin?** Right now any super-admin (so Sir Raza too) can approve. If you want it locked to Yashal specifically, add a setting `marketing_approver_id`.
8. **Redline threshold.** Default: 3 overdue undone tasks. Tune via `settings` row `payroll.redline_threshold`.
9. **Initial recurring tasks for Aayan/Sufyan.** Yashal needs to define these on Day 9–10. Suggested starting set:
   - Mon: "Clean up lead sheets" (90 min)
   - Mon, Tue: "Contact existing partners" (120 min)
   - Mon, Tue: "Reply to leads" (60 min)
   - Refine post-conversation with Sufyan + Aayan.
10. **Marketing recurring tasks?** None set up by default — marketing tasks are 1-1 created by Yashal. If certain marketing items are weekly recurring (e.g., weekly social-media posts), add via `recurring_tasks` later.
11. **Half-day edge case** — left before shift end but worked ≥ 4 h. Default: full day with note.
12. **Lunch / prayer breaks** — tracked? Default: ignored in MVP.
13. **Overtime** — tracked? Default: ignored in MVP.
14. **Payroll run trigger** — manual ("Generate" button) or auto on month-end? Default: manual.
15. **Payment methods to track on payslip.** Default: free-text. Common: bank transfer, cash, cheque. Add a select if you want.

## Later — post-launch

16. Email-based password reset (Supabase native).
17. WhatsApp / SMS notifications.
18. Excel / PDF exports.
19. Auto-load Pakistan public holidays.
20. File retention / archive policy.
21. Contractors / freelancers as a separate entity.
22. Unpaid leave separate from paid.
23. Mid-month shift change proration.
24. Performance management module.
25. CRM integration (`tasks.origin = 'crm'` interface).
26. Mobile / PWA.
27. Public SaaS / multi-tenant generalization.
28. Custom domain.
29. Forced password change on first login.
30. Aayan attendance fully active (he is now — close this once verified).
31. Marketing department split (Content / Design / Social) for finer reporting.
32. Salary edits by branch managers.
33. Variable late grace per shift (currently fixed 10 min).

---

## Decided / closed

- **Sole decision-maker: Yashal.**
- **Sir Raza**: super-admin powers, Auth-only, no employee row.
- **Yashal**: employee row + `attendance_exempt=true`. Salary tracked for budget. Sole approver of marketing task proofs (de facto).
- **Aayan**: now in attendance enforcement. Remote Mon + Tue. Recurring tasks on remote days.
- **Sufyan**: shift 13:00–19:00. Remote Mon + Tue. Recurring tasks on remote days.
- **Marketing team** (Shehryar, Ravil, Murtaza, Aun): `attendance_exempt=true`. Fully remote, no shifts. Verified by task completion. Tasks `requires_approval=true`. Yashal approves; on approval, status auto-`done`. **3 overdue undone tasks → redline alert.** No auto-deductions; Yashal handles redlines manually.
- **Stack**: Next.js + Supabase free tier. No custom domain. Repo at `github.com/Nightmares4u/Evernest-HRM`.
- **Login**: `name@evernestconsultants.com` + admin-set initial passwords.
- **Departments** (6): B2C Sales, B2B, Operations, Marketing, B2C Closing, Management. Marketing sub-areas (content, design, social) live in `role_description`.
- **Branches** (3): KHI, LHE, RMT.
- **Roster** (13 users): 1 system admin (Sir Raza) + 12 employees. Total payroll PKR 517,000/month.
- **Department assignments**:
  - Yashal → Management
  - Komal → B2C Closing
  - Rabia, Deena, Ushna, Mehwish → B2C Sales
  - Aayan → B2B
  - Sufyan → Operations
  - Shehryar, Ravil, Murtaza, Aun → Marketing
- **Payroll**: dual `/30` (earn) + `/26` (deduct). Plus per-payslip `adjustments` jsonb for bonuses/custom deductions, `disbursed_amount`/`payment_method`/`payment_reference`/`paid_at` for tracking actual payment.
- **Schema**: `tasks.assigned_to` and `assigned_by` reference `app_users.id`. `tasks.requires_approval` controls whether super-admin approval is required. `task_updates.user_id` references `app_users.id`. Recurring tasks via `recurring_tasks` table + daily cron.
- **Cron schedule** (Vercel UTC): nightly close `59 18 * * *`, monthly leave accrual `1 19 28-31 * *`, daily recurring task generator `30 18 * * *`.
- **IP enforcement**: soft + optional browser geolocation fallback.
- **Forgot checkout**: `pending_review` + half-day flag, admin corrects.
- **Mobile**: not in MVP (desk-only web).
- **Working week**: Mon–Sat, Sunday permanently locked.
- **Time zone**: server-side `Asia/Karachi`.
- **Rollout**: phased — week 1 core, week 2 remote/tasks/recurring/payroll/manager UI.
- **HRM separate from Jarvis.** No coupling.
- **Branch managers (Komal, Ushna)** report to Yashal — `manager_id` populated to Yashal's `employees.id`.
