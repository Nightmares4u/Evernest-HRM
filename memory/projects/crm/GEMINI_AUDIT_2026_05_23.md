# EN CRM — Gemini Audit (2026-05-23)
> Read-only audit. Do not action without architectural review.
> Auditor: Gemini. Branch: crm-dev. Commit: b5756868374d0c34fdb06b8ef95f6ec41acca83a.

## Executive summary
- Validated that fixes for Phase 2A permission bugs (A-3, A-4) and missing `apostille` codes (B-3) were successfully implemented by Codex.
- Identified systemic, high-severity transaction bugs across both Phase 2A (conversion/payments) and Phase 2B (document upload/review). Sequential database mutations without transaction wrappers risk persistent orphan rows on partial failures.
- Document review queue permissions correctly enforce that Branch Managers cannot verify documents unless they are the assigned counselor, perfectly matching Stage 2 plan §10.
- Found an omission in the audit trail: claiming a document for review mutates its state but logs no activity.
- Storage signed URLs are securely scoped to 15-minute TTLs. No N+1 queries were detected in the new admin views.

## A. Correctness bugs

### A-1 — Missing transaction / Orphan Client Row on Conversion
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/actions.ts:153
- **What's wrong:** `convertLeadToClient` inserts into `crm_clients`, `crm_client_payments`, and `crm_client_activities` via three separate `await admin.from(...)` calls. They are not wrapped in a Postgres transaction.
- **Impact:** If the payment or activity insert fails, the function throws and redirects. The parent lead receives an orphan `crm_clients` row without an initial payment record or activity log. Future attempts fail the "Client already exists" check.
- **Repro / evidence:**
  ```typescript
  const { data: clientData, error: clientError } = await admin.from("crm_clients").insert({...}).select("*").single();
  // ...
  const { error: paymentError } = await admin.from("crm_client_payments").insert({...});
  if (paymentError) redirectLead(lead.id, "error", ...); // orphaned client row
  ```

### A-2 — Missing transaction / Orphan Payment Row
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/actions.ts:192
- **What's wrong:** Similar to A-1, `recordClientPayment` inserts a payment record and then separately inserts an activity log.
- **Impact:** If the activity log insert fails, the payment is recorded but no audit trail/timeline event is created, resulting in a silent mutation.

### A-3 — Missing transaction / Corrupted Document State on Upload
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:221
- **What's wrong:** `uploadClientDocument` sequentially creates the new document, updates the old document with `superseded_by_id`, and then inserts an activity log. 
- **Impact:** If the supersede update fails, BOTH the old and new documents are left with `doc_state = 'uploaded'` and `superseded_by_id = null`. If the activity insert fails, the new doc is uploaded and the old is superseded, but the audit log is lost.
- **Repro / evidence:**
  ```typescript
  const { data: newDoc, error: insertError } = await admin.from("crm_client_documents").insert({...}).single();
  // ...
  const { error: supersedeError } = await admin.from("crm_client_documents").update({...}).eq("id", oldDocumentId);
  // ...
  const { error: activityError } = await admin.from("crm_client_activities").insert({...});
  ```

### A-4 — Missing transaction / Orphan Document State on Decision
- **Severity:** high
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:326
- **What's wrong:** `decideClientDocument` updates the `doc_state` to `approved` or `rejected_resubmit`, then separately inserts an activity log.
- **Impact:** If the activity insert fails, the document state is permanently mutated but no audit log is created.

### A-5 — Missing Payment ID in Activity Payload
- **Severity:** low
- **File:** app/(dashboard)/crm/clients/actions.ts:203
- **What's wrong:** `recordClientPayment` logs a `payment_recorded` activity, but it does not `.select('id').single()` on the payment insert, so it cannot include the actual `payment_id` in the activity payload.
- **Impact:** Breaks data traceability. The activity feed shows a payment occurred but cannot programmatically link to the exact payment row.

### A-6 — Missing Audit Log on Document Claim
- **Severity:** medium
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:285
- **What's wrong:** `claimDocumentForReview` updates `doc_state` to `under_review` but does not insert a `crm_client_activities` record.
- **Impact:** An important state transition occurs silently, breaking the audit logging trail for document reviews.

### A-7 — Incomplete Supersede on Multiple Active Docs
- **Severity:** medium
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:205
- **What's wrong:** `uploadClientDocument` uses `.limit(1)` to fetch the existing active document to supersede. 
- **Impact:** If a race condition (like A-3) causes multiple active docs for the same `doc_code` to exist concurrently, uploading a new one will only supersede ONE of them, leaving the others perpetually active. 

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
- No architectural drift found. The application correctly delegates permission checks and avoids cross-domain boundary violations. (The previous C-1 sequential await issue was flagged as a false positive, as the second query inherently depends on the results of the first).

## D. Security posture

### D-1 — Storage Path Sanitization Rigor
- **Severity:** low
- **File:** app/(dashboard)/crm/clients/documents/actions.ts:39
- **What's wrong:** `sanitizeFileName` strips `/`, `:`, and `\`, but relying on regex sanitization of user input for storage paths can be brittle.
- **Impact:** While constrained by the path template `clients/${clientId}/${docCodeRaw}/${Date.now()}_${fileName}`, substituting the original filename with a pure `crypto.randomUUID()` for the object key (and storing the original filename in Postgres only) is a significantly safer enterprise pattern.

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
| A-5 | Correctness bugs | low | .../clients/actions.ts:203 | Missing `payment_id` in `payment_recorded` activity payload. |
| A-6 | Correctness bugs | medium | .../documents/actions.ts:285 | Missing activity log on document claim. |
| A-7 | Correctness bugs | medium | .../documents/actions.ts:205 | `limit(1)` during supersede could leave duplicate docs perpetually active. |
| B-1 | Plan vs reality | low | .../migrations/0015_...sql:50 | Conversion dates added to client table instead of lead table as planned. |
| B-2 | Plan vs reality | low | .../CURRENT_STATE.md | FK-link UUID strategy was chosen but not documented. |
| D-1 | Security posture | low | .../documents/actions.ts:39 | File name sanitization for storage paths is potentially brittle. |
| E-1 | Doc consistency | low | .../CURRENT_STATE.md | Client code format decision implemented but undocumented. |

## What looks clean (positive findings)
- **Document Review Permissions:** `listDocsAwaitingReview` correctly implements Stage 2 plan §10. Branch Managers are restricted to reviewing docs only for clients assigned to them directly, while Operations and super admins can view the whole queue.
- **Visibility Permissions:** Previous overly-restrictive visibility bugs (A-3, A-4 from the Phase 2A audit) were successfully patched via the `canViewCrmClient` helper.
- **RLS Configuration:** Storage signed URL TTLs are correctly scoped to 15 minutes (900 seconds), which is highly secure.
- **Batch Data Fetching:** Data access in the new document review queue relies on batched `IN` queries rather than N+1 looping.
- **Server Actions Auth:** All server actions correctly enforce authentication via `requireActiveUser` before executing mutations, and securely invoke `createAdminClient()`.

## Out-of-scope items you noticed
- **Future Re-test Handling:** The plan specifies that English test re-tests can be managed using the `superseded_by` pointer. As Phase 2B expands, ensuring the UI clearly and natively collapses superseded documents (currently hidden behind a toggle) will remain crucial for UX.
- **Transaction Wrappers:** Consider adding a generic Supabase RPC function or a lightweight transaction wrapper for complex, multi-table server actions to permanently mitigate the systemic transaction bugs identified above.