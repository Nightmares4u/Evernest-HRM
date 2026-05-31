# CRM Master Context

## Company Context

EN Consultants (Pvt) Ltd. operates publicly as EverNest Consultants. The business is headquartered in Karachi, Pakistan and works across study abroad, immigration, work visas, and B2B processing for partner consultants.

Current active operating centers include Karachi and Lahore. Islamabad is not currently live. Remote or satellite presence includes locations such as Edmonton and Naples.

Syed Yashal Raza is Regional Manager - North America and is guiding the CRM planning and build.

## Existing Internal System

EN HRM is already built or planned around:

- Employees
- Roles and hierarchy
- Attendance
- Geolocation verification
- Task system
- Leave
- Holidays
- Payroll preview and export
- Employee onboarding
- Email notifications
- Cron jobs

The CRM should eventually integrate with HRM rather than duplicate it. Shared concepts include employees, branches, task assignment, KPIs, lead ownership, branch performance, agent performance, commissions, and payroll inputs.

## Business Reality

EN Consultants does not have a Western-style form-first funnel.

Pakistani leads usually prefer texting or calling directly. Meta ad campaigns currently land on WhatsApp, and different campaigns may run through different WhatsApp numbers. Form campaigns can reduce lead volume, so the CRM must respect WhatsApp-first behavior instead of forcing a form-first model.

## CRM Purpose

The CRM is the company control layer for sales, operations, audit, revenue, documents, and reporting.

WhatsApp remains the frontline conversation channel. CRM stores structure, ownership, activity, case progress, invoices, documents, KPIs, and management visibility.

## Core Problem

Current lead flow creates scattered data:

1. Meta campaign runs.
2. User clicks ad.
3. Lead lands on WhatsApp.
4. Campaigns may use different WhatsApp numbers.
5. Conversations and lead context are spread across WhatsApp inboxes and staff behavior.
6. Management lacks clean tracking for source, quality, assignment, follow-up, closure, revenue, documents, invoices, application progress, branch performance, and agent performance.

## CRM Vision

Build a WhatsApp-first CRM that captures, categorizes, assigns, tracks, converts, invoices, and reports on leads across branches, agents, products, and campaigns.

The system should become the operational backbone for:

- Lead capture
- Lead assignment
- Sales follow-up
- Client conversion
- Case management
- Document tracking
- Invoice and payment tracking
- Product and university knowledge
- Branch and agent accountability
- Campaign ROI visibility
- HRM-linked productivity and commission inputs

## Product Philosophy

- Do not start with chatbot logic.
- Do not start with WhatsApp automation.
- Do not start by forking a random CRM repo.
- Do not assume form-first funnel behavior.
- Do not overbuild before pipeline clarity.
- Use Postgres/Supabase as the default data foundation.
- Plan the CRM around real EN operations first.

## Planning Output

The initial CRM planning base lives under `memory/projects/crm/` and defines:

- Product charter
- WhatsApp and Meta pipeline
- Product requirements
- Conceptual data model
- MVP scope
- HRM integration plan
- Reporting and KPIs
- Automation plan
- Repo audit criteria
- Open questions
- Implementation plan
- Current planning state
- CRM project board

