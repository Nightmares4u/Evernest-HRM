-- Employee self-profile and payroll forwarding details.
-- These fields are nullable so existing employees can complete them gradually.
alter table public.employees
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists contact_number text,
  add column if not exists cnic text,
  add column if not exists emergency_contact_number text,
  add column if not exists bank_name text,
  add column if not exists bank_branch_name text,
  add column if not exists bank_account_or_iban text;
