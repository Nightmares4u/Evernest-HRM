// HRM domain types — aligned with supabase/migrations/0001_init.sql.
//
// Keep this file in lock-step with the migration. If the schema changes,
// update both the SQL and these types in the same commit.
//
// Convention:
//   - DB enums map to TS string literal unions (typed at compile time).
//   - DB columns that are NOT NULL map to required fields.
//   - Nullable columns use `T | null`.
//   - Date columns are `string` (ISO date or timestamptz; the application
//     converts when needed). Asia/Karachi handling lives at the boundary.

// ---------- enums ----------

export type EmploymentStatus = "active" | "inactive" | "terminated";

export type AttendanceStatus =
  | "present"
  | "late"
  | "half_day"
  | "absent"
  | "on_leave"
  | "day_off"
  | "public_holiday"
  | "remote_present"
  | "remote_late"
  | "remote_half_day"
  | "remote_pending_review"
  | "remote_rejected"
  | "pending_review"
  | "approved_manually";

export type AttendanceMode = "office" | "remote" | "manual";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type TaskStatus = "to_do" | "in_progress" | "done" | "blocked";

export type TaskPriority = "low" | "normal" | "urgent";

export type HolidayType =
  | "public"
  | "office_closure"
  | "special_day_off"
  | "branch_specific"
  | "individual";

export type UserRole =
  | "super_admin"
  | "admin_hr"
  | "branch_manager"
  | "manager"
  | "employee";

export type RecurrenceType = "weekly" | "monthly" | "daily";

export type PayrollRunStatus = "draft" | "finalized" | "paid";

export type PayslipStatus = "draft" | "approved" | "paid";

// ---------- core ----------

export type AppUser = {
  id: string;
  display_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

export type Branch = {
  id: string;
  name: string;
  code: string;
  default_shift_id: string | null;
  ip_whitelist: string[];
  office_latitude: number | null;
  office_longitude: number | null;
  office_radius_meters: number;
  created_at: string;
};

export type Department = {
  id: string;
  name: string;
  created_at: string;
};

export type Shift = {
  id: string;
  name: string;
  start_time: string; // 'HH:MM' or 'HH:MM:SS'
  end_time: string;
  late_grace_minutes: number;
  half_day_threshold_minutes: number;
  created_at: string;
};

export type Employee = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  branch_id: string | null;
  department_id: string | null;
  manager_id: string | null;
  shift_id: string | null;
  monthly_salary: number;
  role_description: string | null;
  employment_status: EmploymentStatus;
  attendance_exempt: boolean;
  payroll_exempt: boolean;
  remote_allowed: boolean;
  remote_default_days: number[];
  hire_date: string;
  termination_date: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- attendance ----------

export type Holiday = {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
  branch_id: string | null;
  employee_id: string | null;
  is_paid: boolean;
  created_by: string | null;
  created_at: string;
};

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  date: string;
  shift_id: string | null;
  expected_start: string;
  expected_end: string;
  check_in_at: string | null;
  check_out_at: string | null;
  worked_minutes: number | null;
  status: AttendanceStatus;
  late_minutes: number;
  is_late: boolean;
  is_half_day: boolean;
  is_absent: boolean;
  mode: AttendanceMode;
  ip_address: string | null;
  user_agent: string | null;
  geolocation: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    status?: string;
    review_signal?: string;
    distance_meters?: number;
    verification_status?: string;
    check_out_status?: string;
    check_out_lat?: number;
    check_out_lng?: number;
    check_out_accuracy?: number;
    check_out_distance_meters?: number;
    check_out_verification_status?: string;
    check_out_review_signal?: string;
  } | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  verification_status: string | null;
  review_reason: string | null;
  branch_id: string | null;
  requires_review: boolean;
  approved_by: string | null;
  approval_note: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- leave ----------

export type LeaveBalance = {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  accrued: number;
  used: number;
  carry_forward_in: number;
  balance: number;
  updated_at: string;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

// ---------- tasks ----------

export type RecurringTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  branch_id: string | null;
  department_id: string | null;
  recurrence_type: RecurrenceType;
  recurrence_days: number[];
  priority: TaskPriority;
  requires_approval: boolean;
  active: boolean;
  due_time: string | null; // 'HH:MM[:SS]' or null = EOD
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  branch_id: string | null;
  department_id: string | null;
  due_date: string;
  due_time: string | null; // 'HH:MM[:SS]' or null = EOD
  priority: TaskPriority;
  status: TaskStatus;
  origin: string;
  recurring_task_id: string | null;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  completed_at: string | null;
};

export type TaskUpdate = {
  id: string;
  task_id: string;
  user_id: string;
  attendance_record_id: string | null;
  note: string | null;
  status_update: TaskStatus | null;
  created_at: string;
};

export type TaskAttachment = {
  id: string;
  task_update_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  checksum: string | null;
  created_at: string;
};

// ---------- payroll ----------

export type PayrollAdjustment = {
  type: "bonus" | "custom_deduction" | "allowance" | string;
  amount: number;
  reason: string;
};

export type PayrollRun = {
  id: string;
  year: number;
  month: number;
  status: PayrollRunStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
};

export type Payslip = {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  monthly_salary: number;
  calendar_days_employed: number;
  absent_days: number;
  late_count: number;
  half_day_count: number;
  leaves_used: number;
  deduction_days: number;
  prorated_earnings: number;
  deduction_amount: number;
  calculated_net: number;
  adjustments: PayrollAdjustment[];
  final_amount: number;
  disbursed_amount: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  status: PayslipStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- audit + settings ----------

export type AuditLog = {
  id: string;
  actor_id: string | null;
  target_type: string;
  target_id: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
};

export type Setting = {
  key: string;
  value: unknown;
  updated_at: string;
};

// ---------- view ----------

export type EmployeeOverdueTasks = {
  employee_id: string;
  user_id: string;
  full_name: string;
  branch_id: string | null;
  overdue_count: number;
  is_redlined: boolean;
};

// ---------- composed / view-model types (UI helpers) ----------

/**
 * Employee + joined names for display (branch name, department name, shift name).
 * Used by the employee directory and admin Today panel.
 */
export type EmployeeWithJoins = Employee & {
  branch_name: string | null;
  branch_code: string | null;
  department_name: string | null;
  shift_name: string | null;
  email: string;
  user_role: UserRole;
};
