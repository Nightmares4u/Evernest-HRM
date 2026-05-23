# Repo Audit Criteria

## Purpose

Before forking or adapting any existing CRM repository, audit it against EN Consultants' actual CRM needs.

Do not fork blindly.

## Required Fit

A candidate repo should be evaluated for:

- Next.js compatibility
- Supabase/Postgres compatibility
- Vercel deployment compatibility
- License permissibility
- Auth model
- Database model
- Multi-branch support
- Multi-agent support
- Role and permission support
- Lead pipeline flexibility
- Case/client management support
- Document management support
- Invoice/payment adaptability
- Reporting structure
- Code quality
- Maintenance health
- UI quality
- Ease of integrating with EN HRM

## WhatsApp-First Fit

The repo should not assume every lead comes from a form.

Check whether it can support:

- WhatsApp number attribution
- Manual lead creation from conversations
- Multiple source channels
- Campaign mapping
- Raw inbound payload storage
- Duplicate phone handling
- Conversation timeline
- Future webhook ingestion

## HRM Integration Fit

Check whether the repo can reuse or integrate with:

- Existing users
- Employees
- Branches
- Roles
- Tasks
- Attendance/productivity reporting
- Payroll/commission exports later

Reject or heavily downgrade repos that require maintaining duplicate employee and branch systems.

## Data Model Fit

Check whether the repo can cleanly represent:

- Leads
- Clients
- Cases
- Assignments
- Activities
- Follow-ups
- Campaigns
- WhatsApp numbers
- Documents
- Invoices
- Payments
- Products/countries/universities
- Audit flags

## Security and Permissions Fit

Check:

- Supabase RLS compatibility
- Server-side authorization patterns
- Branch-scoped access
- Own-lead access for agents
- Finance data restriction
- Client portal isolation later

## Maintenance Health

Review:

- Last commit date
- Open issues
- Dependency age
- Test coverage
- TypeScript quality
- Database migration quality
- Number of contributors
- License
- Setup complexity

## Rewrite Cost

Estimate:

- Low rewrite: can adapt models and UI quickly.
- Medium rewrite: usable shell, but data model needs major changes.
- High rewrite: UI only, backend/data incompatible.
- Reject: wrong stack, poor license, poor architecture, hardcoded assumptions.

## Audit Output Template

For each candidate repo, document:

- Repo URL
- License
- Stack
- Auth system
- Database
- CRM modules included
- WhatsApp adaptability
- HRM integration fit
- Security/RLS fit
- Code quality
- UI quality
- Rewrite estimate
- Recommendation

