# Project Charter

## Project Name

EN Consultants CRM

## Product Identity

An internal WhatsApp-first CRM for EN Consultants (Pvt) Ltd., operating publicly as EverNest Consultants.

## Mission

Create a single source of truth for lead capture, sales follow-up, client conversion, case progress, documents, invoices, payments, campaign performance, and branch or agent accountability.

## Primary Users

- Super admin
- Branch managers
- Assistant managers
- Sales agents and counselors
- B2B staff
- Operations and documentation staff
- Marketing staff
- Finance or accounts staff
- Future client portal users

## Business Outcomes

The CRM should help EN Consultants:

- Stop losing leads inside WhatsApp inboxes.
- Preserve campaign and WhatsApp number attribution.
- Assign leads clearly to branches and agents.
- Improve follow-up discipline.
- Track qualified leads and closures.
- Convert paid clients into active cases.
- Track documents, invoices, payments, and application progress.
- Compare branch and agent performance.
- Understand campaign ROI.
- Connect sales output to HRM productivity and future commissions.

## Non-Goals For Initial Planning

- No live chatbot behavior.
- No AI auto-counseling.
- No full WhatsApp automation first.
- No public customer portal in MVP unless explicitly approved later.
- No advanced commission engine in MVP.
- No complex document automation in MVP.
- No architecture switch to MongoDB without strong justification.

## Guiding Principles

- WhatsApp is the front desk.
- CRM is the control tower.
- HRM remains the employee and task foundation.
- Backend data is the source of truth.
- Campaign attribution must not be lost.
- Every important change should be auditable.
- MVP should support real operations before advanced automation.

## Default Stack Direction

Use the same platform family as EN HRM where practical:

- Next.js
- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Vercel
- Resend
- GitHub
- Meta/WhatsApp integrations later

## Success Definition

The MVP is successful when EN Consultants can:

- Capture or enter WhatsApp-first leads.
- Assign leads to agents and branches.
- Track lead status, follow-ups, and notes.
- Convert leads into clients/cases.
- Maintain internal document checklists and uploads.
- Generate basic invoices and record payments.
- Track campaign source.
- View branch and agent KPIs.
- Reuse HRM users/branches/tasks conceptually.

