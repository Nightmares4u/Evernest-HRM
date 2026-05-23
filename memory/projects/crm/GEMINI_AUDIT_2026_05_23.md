# EN CRM — Gemini Audit (2026-05-23)
> Read-only audit. Do not action without architectural review.
> Auditor: Gemini. Branch: crm-dev. Commit: b5756868374d0c34fdb06b8ef95f6ec41acca83a.

## Executive summary
- Validated that fixes for Phase 2A permission bugs (A-3, A-4) and missing `apostille` codes (B-3) were successfully implemented by Codex.
- Identified systemic, high-severity transaction bugs across Phase 2A, 2B, 2C, and 2D. Sequential database mutations without transaction wrappers risk persistent orphan rows on partial failures. Note: Transaction bugs for 2A and 2B were fixed in a previous pass via compensation logic.
- Document review queue permissions correctly enforce that Branch Managers cannot verify documents unless they are the assigned counselor, perfectly matching Stage 2 plan §10.
- **Phase 2D findings:** Country milestones are correctly implemented, visa-stage gating is flawlessly enforced (client cannot move to `visa_submitted` if milestones are missing), and the super admin rollback is implemented securely. Permission logic `canEditClientMilestone` perfectly honors the `OPS_DEPARTMENT_NAME` plan requirement.
- Found omissions in the audit trail: claiming a document for review mutates its state but logs no activity (fixed previously).
- Storage signed URLs are securely scoped to 15-minute TTLs. No N+1 queries were detected in the new admin views.

## A. Correctness bugs

*(Note: Bugs A-1 to A-7 were mitigated with compensation logic in a previous pass. Listed below for historical context).*

### A-1 — Missing transaction / Orphan Client Row on Conversion
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/actions.ts:153

### A-2 — Missing transaction / Orphan Payment Row
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/actions.ts:192

### A-3 — Missing transaction / Corrupted Document State on Upload
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:221

### A-4 — Missing transaction / Orphan Document State on Decision
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:326

### A-5 — Missing Payment ID in Activity Payload
- **Severity:** low
- **File:** app/(dashboard)/crm/clients/actions.ts:203

### A-6 — Missing Audit Log on Document Claim
- **Severity:** medium
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:285

### A-7 — Incomplete Supersede on Multiple Active Docs
- **Severity:** medium
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:205

### A-8 — Missing transaction / Corrupted Milestone State
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/visa/actions.ts:145
- **What's wrong:** `setMilestoneStatus` sequentially updates `crm_client_country_milestones` and then inserts into `crm_client_activities`. 
- **Impact:** If the activity insert fails, the milestone state is permanently updated but no audit log is created.

### A-9 — Missing transaction / Orphan Client Status on Visa Flow
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/visa/actions.ts:290
- **What's wrong:** `updateClientStatusWithActivity` (called by `transitionClientToVisaPrep`, `transitionClientToVisaSubmitted`, and `rollbackClientStatus`) sequentially updates `crm_clients` status and then inserts into `crm_client_activities`.
- **Impact:** If the activity insert fails, the client's status is permanently mutated (e.g., to `visa_submitted`), but the server action throws an error and no activity log is generated.

### A-10 — Missing transaction / Orphan Milestone Seeds
- **Severity:** medium
- **File:** lib/db/crm.ts:1877
- **What's wrong:** `ensureClientMilestonesSeeded` sequentially upserts rows into `crm_client_country_milestones` and then inserts an activity log.
- **Impact:** If the activity insert fails, the milestones are seeded without an audit trail. Subsequent page loads will ignore duplicates, leaving the action permanently unlogged.

## B. Plan vs reality drift

### B-1 — Conversion Gate Schema Location
- **Severity:** low
- **File:** supabase/migrations/0015_crm_clients_phase_2a.sql:50
- **What's wrong:** Plan §3 states "A crm_clients row gets created when both of these are true on the parent lead: agreement_signed_at IS NOT NULL and advance_paid_at IS NOT NULL". In reality, these columns were added directly to `crm_clients`, not `crm_leads`.
- **Impact:** The gate is currently enforced via UI form validation rather than a core state check on the lead row itself.

### B-2 — Undocumented Lead → Client UUID Strategy
- **Severity:** low
- **File:** memory/projects/crm/CURRENT_STATE.md
- **What's wrong:** Plan §12 #5 requested documenting the UUID strategy (same-UUID vs FK-link) in `CURRENT_STATE.md` once decided. The schema uses an FK-link (`lead_id uuid NOT NULL UNIQUE`), but this decision was never documented.
- **Impact:** Minor documentation gap.

## C. Architectural consistency
- No architectural drift found. The application correctly delegates permission checks and avoids cross-domain boundary violations.

## D. Security posture

### D-1 — Storage Path Sanitization Rigor
- **Severity:** low
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:39
- **What's wrong:** `sanitizeFileName` strips `/`, `:`, and `\`, but relying on regex sanitization of user input for storage paths can be brittle. *(Fixed previously via UUID usage)*.
- **Impact:** Resolved.

## E. Document consistency

### E-1 — Missing Client Code Format Decision
- **Severity:** low
- **File:** memory/projects/crm/CURRENT_STATE.md
- **What's wrong:** Plan §13 asked to pick a client code format (`EN-{year}-{seq}` vs `EN-{branch}-{seq}`). Migration 0015 implements `EN-{year}-{seq}`, but this decision is undocumented.
- **Impact:** Minor knowledge gap in the documentation trail.

## Findings summary table
| ID | Category | Severity | File | One-line summary |
|---|---|---|---|---|
| A-1 | Correctness bugs | high | .../clients/actions.ts:153 | Missing transaction causes orphan client row on partial failure. |
| A-2 | Correctness bugs | high | .../clients/actions.ts:192 | Missing transaction causes orphan payment row on partial failure. |
| A-3 | Correctness bugs | high | .../documents/actions.ts:221 | Missing transaction causes corrupted doc state on upload failure. |
| A-4 | Correctness bugs | high | .../documents/actions.ts:326 | Missing transaction causes orphan doc state on decision failure. |
| A-8 | Correctness bugs | high | .../visa/actions.ts:145 | Missing transaction on milestone status update. |
| A-9 | Correctness bugs | high | .../visa/actions.ts:290 | Missing transaction on visa status transition. |
| A-10 | Correctness bugs | medium | lib/db/crm.ts:1877 | Missing transaction on milestone seeding. |
| B-1 | Plan vs reality | low | .../migrations/0015_...sql:50 | Conversion dates added to client table instead of lead table as planned. |
| B-2 | Plan vs reality | low | .../CURRENT_STATE.md | FK-link UUID strategy was chosen but not documented. |
| D-1 | Security posture | low | .../documents/actions.ts:39 | File name sanitization for storage paths is potentially brittle. |
| E-1 | Doc consistency | low | .../CURRENT_STATE.md | Client code format decision implemented but undocumented. |

## What looks clean (positive findings)
- **Phase 2D Implementation Details:** The country milestones are perfectly aligned with the specification. The registry covers all 11 required countries. The `requiredMilestoneBlockers` logic properly guards the `visa_submitted` transition, requiring all `done` or `not_applicable` status.
- **Phase 2D Permissions:** `canEditClientMilestone` enforces that only the assigned counselor, Ops, or super admin can modify a milestone, adhering perfectly to Plan §10.
- **Document Review Permissions:** `listDocsAwaitingReview` correctly implements Stage 2 plan §10. Branch Managers are restricted to reviewing docs only for clients assigned to them directly, while Operations and super admins can view the whole queue.
- **RLS Configuration:** Storage signed URL TTLs are correctly scoped to 15 minutes (900 seconds), which is highly secure.
- **Server Actions Auth:** All server actions correctly enforce authentication via `requireActiveUser` before executing mutations, and securely invoke `createAdminClient()`.

## Out-of-scope items you noticed
- **Transaction Wrappers:** Consider adding a generic Supabase RPC function or a lightweight transaction wrapper for complex, multi-table server actions to permanently mitigate the systemic transaction bugs identified above across all Stage 2 phases.