# Automation Plan

## Automation Principle

Automation should support staff discipline and management visibility. It should not replace counseling, spam leads, or create uncontrolled chatbot behavior.

## MVP Automations

### Follow-Up Reminders

Create reminders for:

- Today follow-ups
- Overdue follow-ups
- Hot lead follow-ups
- Invoice pending follow-ups
- Document pending follow-ups

### Audit Flags

Create flags for:

- Stale lead
- Unassigned lead
- No follow-up after intake
- Duplicate phone
- Payment pending too long
- Invoice sent but not followed up
- Active case with missing required documents

### Daily Snapshot

Generate a management-ready daily summary from CRM data.

Initial version can be manually viewed in dashboard. Later version can send email via Resend.

## Post-MVP Automations

### WhatsApp API

- Inbound message ingestion
- Message-to-lead conversion
- Template message support
- Session-window-aware replies
- Staff notification queue

### Meta Campaign Sync

- Campaign spend sync
- Campaign/ad set/ad import
- Cost per lead calculations
- Campaign ROI reports

### Assignment Automation

- Branch-based routing
- WhatsApp-number-based routing
- Product-based routing
- Workload-aware routing
- Priority routing

### AI-Assisted Triage

Only after data quality and guardrails are stable:

- Summarize conversations internally.
- Suggest product/category.
- Suggest quality score.
- Suggest next follow-up.
- Never auto-counsel or spam leads without approval.

### Document Automation

- Checklist generation by product/country.
- Missing document reminders.
- Document verification queues.

### Finance Automation

- Invoice PDF generation.
- Payment reminders.
- Commission-ready reports.

## Automation Guardrails

- No uncontrolled chatbot in MVP.
- No autonomous visa counseling.
- No outbound WhatsApp spam.
- Human review before sensitive messages.
- Raw inbound data must be preserved.
- Important automated changes must be logged.

