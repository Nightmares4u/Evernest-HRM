# EN CRM Reference Integration Audit

## 1. Previous Starter Repo Audit Located
- **Starter repo path:** `/Users/syedraza/Desktop/evernest-crm-starter`
- **Audit docs read:** 
  - `memory/projects/crm/CRM_ARCHITECTURE_DECISION.md`
  - `memory/projects/crm/REPO_AUDIT_CRITERIA.md`
- **Reference repos found under `crm-repo-audit`:** 
  - `atomic-crm`
  - `crm` (presumably Frappe/Krayin)
  - `laravel-crm`
  - `Study-Abroad-and-Education-Consultant-CRM`
- **Summary of old Gemini findings:**
  - Build the CRM as a native module inside EN HRM, not a standalone fork, to reuse employee/branch schemas and simplify deployment.
  - **Atomic CRM** was selected as the primary technical/UI reference (Next.js App Router, Supabase, Shadcn UI, Activity Log views, RLS).
  - **Study-Abroad CRM** was selected as the domain-field reference (CGPA, gaps, country interest).
  - **Krayin & Frappe** were selected as logic/workflow references for assignment engines and pipeline transitions.

## 2. Current EN HRM CRM Snapshot
- The CRM is successfully integrated as a module inside `EN HRM` (`crm-dev` branch).
- Uses a WhatsApp-first approach: raw intake goes to `/crm/inbox`, auto-parsed via rules, then manually promoted to a CRM lead.
- Assignment is primarily driven by WhatsApp number ownership (a number maps to a default counselor), with assignment rules as a fallback.
- Temporary fallback routing is available for numbers (e.g., when a counselor is on leave).
- Admins can manage numbers, campaigns, rules, and transfers.
- Basic lead list/detail views are present, and the activity timeline has foundational enum values for `followup_scheduled` and `followup_completed`.

## 3. Reference CRM Patterns Reviewed
The current CRM correctly implements the architectural decisions from the starter repo audit: integrating into HRM, using the Next.js/Supabase stack, and building a custom assignment engine rather than blindly copying an existing CRM. However, several UI and workflow patterns from the reference repos (particularly Atomic CRM's timeline and Frappe's pipeline) are still pending.

## 4. Already Integrated
- Native integration into EN HRM (sharing employee data).
- The "WhatsApp Front Desk" concept (raw inbox before lead creation).
- Dumb/Rule-based parser for structured qualification.
- Krayin/Frappe-inspired but custom-built assignment waterfall (now correctly localized to WhatsApp number ownership first).
- Admin management for routing rules and source attribution.
- Basic lead activity timeline schema.
- **Counselor Transfer/Handoff Workflow:** Fully implemented with migration (`0013_crm_lead_transfers.sql`), transfer request form/history on lead detail, counselor inbox (`/crm/transfers`), admin monitor (`/admin/crm/transfers`), and server actions for request/accept/reject/cancel/admin override.

## 5. Missing but Useful
- **Atomic CRM Reference:** Activity timeline polish (beautiful rendering of notes, status changes, and follow-ups).
- **Atomic CRM Reference:** Tight RLS (Row Level Security) and permission hardening so counselors only see their assigned leads.
- **Frappe/Krayin Reference:** Lead board/pipeline UI (Kanban-style or clear visual transitions for lead statuses).
- Counselor lead-working workflow (internal notes, easy status transitions).
- Follow-up scheduling UI and due/overdue follow-up boards for agents.
- Dashboard KPIs/reporting for managers.

## 6. Should Not Be Copied
- **Form-first funnels:** Repos that assume leads always come from web forms. The EN CRM must maintain its WhatsApp-first, raw-inbox intake.
- **Complex Chatbots:** Do not implement conversational AI or chatbot logic that attempts to "close" or fully advise the lead. Keep the dumb parser.
- **Separate Employee/Auth Models:** Do not duplicate HRM employees or branch concepts.
- **Generic Assignment Engines:** Do not revert to generic round-robin or rule-first assignment; EN's unique "WhatsApp number ownership" is the correct primary driver.

## 7. Recommended Build Order
1. Lead working actions on `/crm/leads/[id]` (internal notes, lead status transition UI, follow-up scheduling)
2. Due/overdue follow-up board
3. Activity timeline polish
4. Lead board/pipeline UI
5. KPI/reporting dashboard
6. RLS/permission hardening
7. WhatsApp webhook later
8. Gemini fallback parser later

## 8. Codex-Sized Task Backlog

### Task 1
- **Title:** Lead Working Actions & UI (Notes, Status, Follow-up)
- **Why it matters:** Counselors need explicit tools on the lead detail page to actually work a lead: adding context, moving them through stages, and scheduling the next contact.
- **User-facing behavior:** On the lead detail page, counselors will see components to change lead status, add an internal note, and schedule the next follow-up date/time. All actions log appropriately to the timeline.
- **Routes affected:** `/crm/leads/[id]`
- **Files likely affected:** Lead detail page, new action components (status selector, note input, date picker), server actions for updates.
- **Migration needed:** No.
- **Test cases:** Add note, change status, schedule follow-up; verify all show in timeline and `next_followup_at` updates.
- **Dependencies:** None.

### Task 2
- **Title:** Build Due/Overdue Follow-up Board
- **Why it matters:** Counselors need a daily dashboard to see who they must contact today to maintain pipeline velocity.
- **User-facing behavior:** A new page showing leads assigned to the user where `next_followup_at` is today or in the past. Allows quick marking as `followup_completed`.
- **Routes affected:** `/crm/leads/follow-ups` (or similar)
- **Files likely affected:** New follow-up board page, lead query utilities.
- **Migration needed:** No.
- **Test cases:** Verify past due and today's leads appear; verify future leads do not. Complete a follow-up and verify it disappears.
- **Dependencies:** Task 1.

### Task 3
- **Title:** Activity Timeline Polish
- **Why it matters:** The timeline is the chronological truth of a lead. It must be visually clear, cleanly styled, and easy to read (referencing Atomic CRM).
- **User-facing behavior:** The timeline on the lead detail page distinguishes system events (promotions, transfers), status changes, notes, and follow-ups with distinct icons and colors.
- **Routes affected:** `/crm/leads/[id]`
- **Files likely affected:** Timeline UI component.
- **Migration needed:** No.
- **Test cases:** View a lead with various activity types; verify visual styling is distinct and correct.
- **Dependencies:** Task 1.

### Task 4
- **Title:** Lead Board / Pipeline UI
- **Why it matters:** Managers and counselors need a high-level visual representation of where leads sit in the overall sales funnel.
- **User-facing behavior:** A Kanban-style board or structured list grouped by lead status.
- **Routes affected:** `/crm/leads/board`
- **Files likely affected:** New board page, drag-and-drop or grouped status UI.
- **Migration needed:** No.
- **Test cases:** View board; verify leads appear in correct status columns.
- **Dependencies:** Task 1.

### Task 5
- **Title:** Dashboard KPIs and Reporting
- **Why it matters:** Managers need visibility into branch and counselor performance, source ROI, and conversion rates.
- **User-facing behavior:** A dashboard showing counts of leads by status, counselor activity metrics, and campaign performance.
- **Routes affected:** `/admin/crm` or new `/crm/dashboard`
- **Files likely affected:** Dashboard page, analytics queries.
- **Migration needed:** No.
- **Test cases:** Verify metrics load correctly based on raw data.
- **Dependencies:** Task 1, 4.

### Task 6
- **Title:** RLS / Permission Hardening
- **Why it matters:** Standard counselors should not see leads assigned to other counselors or other branches unless they are managers.
- **User-facing behavior:** Non-admin users visiting `/crm/leads` only see their own assigned leads.
- **Routes affected:** All `/crm/*` routes.
- **Files likely affected:** Supabase migration (RLS policies), server-side data fetching utilities.
- **Migration needed:** Yes (new RLS policies).
- **Test cases:** Login as counselor A, verify counselor B's leads are hidden.
- **Dependencies:** All previous UI tasks.

## 9. Immediate Next 3 Tasks
1. **Lead notes + status update + follow-up scheduling UI/actions**
2. **Due/overdue follow-up board**
3. **Activity timeline polish**

## 10. Risks / Architecture Warnings
- **Feature Creep Before Core Loop is Stable:** Do not start on WhatsApp webhooks or Gemini parsing until the counselor's daily workflow is rock solid.
- **RLS Complexity:** Implementing RLS needs to be tight. If we lock it down too early, we might break admin visibility. Ensure super-admins and branch managers have bypass or scoped access.
- **Timeline Bloat:** Ensure the activity timeline fetches efficiently; as it grows, it will need pagination or limiting so the lead detail page remains fast.

## 11. Final Recommendation
The integration strategy was correct. The CRM module inside HRM has successfully implemented the unique "WhatsApp number ownership" routing pattern and the counselor handoff/transfer workflows. The immediate next step is to build out the **human counselor workflow** (notes, status updates, follow-ups, and daily boards) so that when real API leads are eventually ingested, the agents have the tools ready to actually work them. Pause any webhook or AI work and execute the first 3 tasks.
