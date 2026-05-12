# CRM and HRM Integration

## Integration Principle

CRM should integrate with EN HRM conceptually and eventually technically. HRM is the employee, role, attendance, task, and payroll foundation. CRM should not duplicate employee or branch systems unless there is no alternative.

## Shared Concepts

CRM should reuse or reference:

- Employees
- App users
- Roles
- Branches
- Departments
- Task system
- Attendance
- Payroll and commission outputs

## Employee and Agent Mapping

CRM agents should be employees from HRM.

CRM should store CRM-specific sales settings separately:

- Product specialization
- Branch assignment
- Lead capacity
- Active CRM status
- Assignment eligibility
- Commission profile later

Possible table:

- `crm_agent_profiles`

This references:

- `employee_id`
- `branch_id`

## Branch Mapping

Branches should be shared with HRM.

CRM branch use cases:

- Lead ownership
- Campaign ownership
- Assignment queues
- Branch KPIs
- Revenue reporting
- Case operations ownership

## Task Integration

CRM should create HRM tasks or shared platform tasks for:

- Follow-up due
- Document pending
- Invoice pending
- Client appointment
- Application submission deadline
- Payment reminder

MVP can keep follow-ups inside CRM, but the design should allow CRM tasks to sync into HRM task dashboards later.

## Attendance and Productivity

Later analytics should compare:

- Attendance presence
- Assigned leads
- Calls/follow-ups
- Completed tasks
- Qualified leads
- Payments
- Revenue

This helps distinguish availability from productivity.

## Commission and Payroll

Payments and closed cases should eventually feed commission calculations.

Commission should not be overbuilt in CRM MVP.

Required later inputs:

- Agent owner
- Closing employee
- Branch
- Product
- Payment amount
- Gross profit estimate
- Commission rule
- Payroll period
- Approval status

HRM payroll should remain the final payroll layer.

## Permissions Alignment

CRM roles should map from HRM/app roles where possible:

- `super_admin`: all CRM access
- `branch_manager`: own branch leads, cases, reports, agents
- `assistant_manager`: scoped branch/team access
- `team_member` or `agent`: own leads, follow-ups, tasks
- `b2b_staff`: partner and B2B case access
- `ops_staff`: documents, applications, case processing
- `marketing`: campaign and reporting access
- `finance`: invoices and payments
- `client`: future client portal access to own data only

## Integration Boundaries

CRM owns:

- Leads
- Cases
- Campaigns
- WhatsApp lead metadata
- Client documents
- Invoices and payments
- Sales and case activities
- CRM reports

HRM owns:

- Employee records
- Attendance
- Leave
- Holidays
- Payroll
- Employee onboarding
- Core task dashboard if already implemented

Shared platform owns:

- Auth
- App users
- Branches
- Roles and permissions

