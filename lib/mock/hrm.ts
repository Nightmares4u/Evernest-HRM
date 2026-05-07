// Mock HRM data for dev mode.
//
// Used by UI surfaces while real Supabase wiring is pending. The shape of
// each entity matches the corresponding type in lib/types/hrm.ts so that
// swapping in real DB queries later is a 1:1 substitution.
//
// Source of truth for staff facts: memory/projects/hrm/seed/users.csv
// and HRM_MASTER_CONTEXT.md §5. Do NOT duplicate plaintext passwords here.

import type {
  AttendanceRecord,
  AttendanceStatus,
  Branch,
  Department,
  EmployeeWithJoins,
  Shift,
} from "@/lib/types/hrm";

// stable mock IDs — readable, not real UUIDs
const id = (slug: string) => `mock-${slug}`;

// ---------- branches ----------

export const MOCK_BRANCHES: Branch[] = [
  {
    id: id("branch-khi"),
    name: "Karachi",
    code: "KHI",
    default_shift_id: id("shift-khi-std"),
    ip_whitelist: [],
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: id("branch-lhe"),
    name: "Lahore",
    code: "LHE",
    default_shift_id: id("shift-lhe-std"),
    ip_whitelist: [],
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: id("branch-rmt"),
    name: "Remote",
    code: "RMT",
    default_shift_id: id("shift-khi-std"),
    ip_whitelist: [],
    created_at: "2025-01-01T00:00:00Z",
  },
];

// ---------- departments ----------

export const MOCK_DEPARTMENTS: Department[] = [
  { id: id("dept-b2c-sales"), name: "B2C Sales", created_at: "2025-01-01T00:00:00Z" },
  { id: id("dept-b2b"), name: "B2B", created_at: "2025-01-01T00:00:00Z" },
  { id: id("dept-ops"), name: "Operations", created_at: "2025-01-01T00:00:00Z" },
  { id: id("dept-mkt"), name: "Marketing", created_at: "2025-01-01T00:00:00Z" },
  { id: id("dept-b2c-closing"), name: "B2C Closing", created_at: "2025-01-01T00:00:00Z" },
  { id: id("dept-mgmt"), name: "Management", created_at: "2025-01-01T00:00:00Z" },
];

// ---------- shifts ----------

export const MOCK_SHIFTS: Shift[] = [
  {
    id: id("shift-khi-std"),
    name: "Karachi-Standard",
    start_time: "11:00:00",
    end_time: "18:00:00",
    late_grace_minutes: 10,
    half_day_threshold_minutes: 240,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: id("shift-lhe-std"),
    name: "Lahore-Standard",
    start_time: "10:30:00",
    end_time: "18:30:00",
    late_grace_minutes: 10,
    half_day_threshold_minutes: 240,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: id("shift-komal-ext"),
    name: "Komal-Extended",
    start_time: "11:00:00",
    end_time: "19:00:00",
    late_grace_minutes: 10,
    half_day_threshold_minutes: 240,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: id("shift-sufyan"),
    name: "Sufyan",
    start_time: "13:00:00",
    end_time: "19:00:00",
    late_grace_minutes: 10,
    half_day_threshold_minutes: 240,
    created_at: "2025-01-01T00:00:00Z",
  },
];

// ---------- employees (with joined display fields) ----------

const EPOCH = "2025-01-01T00:00:00Z";

function makeEmployee(seed: {
  slug: string;
  full_name: string;
  email: string;
  branch_code: "KHI" | "LHE" | "RMT";
  department_name: string;
  shift_name: string;
  monthly_salary: number;
  role_description: string;
  user_role: EmployeeWithJoins["user_role"];
  attendance_exempt?: boolean;
  remote_allowed?: boolean;
  remote_default_days?: number[];
  hire_date?: string;
  manager_slug?: string;
}): EmployeeWithJoins {
  const branch = MOCK_BRANCHES.find((b) => b.code === seed.branch_code)!;
  const dept = MOCK_DEPARTMENTS.find((d) => d.name === seed.department_name)!;
  const shift = MOCK_SHIFTS.find((s) => s.name === seed.shift_name)!;
  return {
    id: id(`emp-${seed.slug}`),
    user_id: id(`user-${seed.slug}`),
    full_name: seed.full_name,
    phone: null,
    branch_id: branch.id,
    department_id: dept.id,
    manager_id: seed.manager_slug ? id(`emp-${seed.manager_slug}`) : null,
    shift_id: shift.id,
    monthly_salary: seed.monthly_salary,
    role_description: seed.role_description,
    employment_status: "active",
    attendance_exempt: seed.attendance_exempt ?? false,
    payroll_exempt: false,
    remote_allowed: seed.remote_allowed ?? false,
    remote_default_days: seed.remote_default_days ?? [],
    hire_date: seed.hire_date ?? "2025-01-01",
    termination_date: null,
    created_at: EPOCH,
    updated_at: EPOCH,
    // joined display
    branch_name: branch.name,
    branch_code: branch.code,
    department_name: dept.name,
    shift_name: shift.name,
    email: seed.email,
    user_role: seed.user_role,
  };
}

export const MOCK_EMPLOYEES: EmployeeWithJoins[] = [
  makeEmployee({
    slug: "yashal",
    full_name: "Syed Yashal Raza",
    email: "yashal@evernestconsultants.com",
    branch_code: "KHI",
    department_name: "Management",
    shift_name: "Karachi-Standard",
    monthly_salary: 40000,
    role_description: "Regional Manager — North America",
    user_role: "super_admin",
    attendance_exempt: true,
    remote_allowed: true,
    remote_default_days: [1, 2, 3, 4, 5, 6, 7],
  }),
  makeEmployee({
    slug: "komal",
    full_name: "Komal",
    email: "komal@evernestconsultants.com",
    branch_code: "KHI",
    department_name: "B2C Closing",
    shift_name: "Komal-Extended",
    monthly_salary: 130000,
    role_description: "Branch Manager / Closer",
    user_role: "branch_manager",
    manager_slug: "yashal",
  }),
  makeEmployee({
    slug: "rabia",
    full_name: "Rabia",
    email: "rabia@evernestconsultants.com",
    branch_code: "KHI",
    department_name: "B2C Sales",
    shift_name: "Karachi-Standard",
    monthly_salary: 50000,
    role_description: "Counsellor",
    user_role: "employee",
    manager_slug: "komal",
  }),
  makeEmployee({
    slug: "aayan",
    full_name: "Aayan",
    email: "aayan@evernestconsultants.com",
    branch_code: "KHI",
    department_name: "B2B",
    shift_name: "Sufyan",
    monthly_salary: 45000,
    role_description: "B2B Specialist",
    user_role: "employee",
    remote_allowed: true,
    remote_default_days: [1, 2],
    manager_slug: "komal",
  }),
  makeEmployee({
    slug: "sufyan",
    full_name: "Sufyan",
    email: "sufyan@evernestconsultants.com",
    branch_code: "KHI",
    department_name: "Operations",
    shift_name: "Sufyan",
    monthly_salary: 40000,
    role_description: "Operations",
    user_role: "employee",
    remote_allowed: true,
    remote_default_days: [1, 2],
    manager_slug: "komal",
  }),
  makeEmployee({
    slug: "deena",
    full_name: "Deena",
    email: "deena@evernestconsultants.com",
    branch_code: "KHI",
    department_name: "B2C Sales",
    shift_name: "Karachi-Standard",
    monthly_salary: 25000,
    role_description: "Counsellor",
    user_role: "employee",
    manager_slug: "komal",
  }),
  makeEmployee({
    slug: "ushna",
    full_name: "Ushna",
    email: "ushna@evernestconsultants.com",
    branch_code: "LHE",
    department_name: "B2C Sales",
    shift_name: "Lahore-Standard",
    monthly_salary: 65000,
    role_description: "Lahore Sales / BDO",
    user_role: "branch_manager",
    manager_slug: "yashal",
  }),
  makeEmployee({
    slug: "mehwish",
    full_name: "Mehwish",
    email: "mehwish@evernestconsultants.com",
    branch_code: "LHE",
    department_name: "B2C Sales",
    shift_name: "Lahore-Standard",
    monthly_salary: 65000,
    role_description: "Counsellor",
    user_role: "employee",
    manager_slug: "ushna",
  }),
  makeEmployee({
    slug: "shehryar",
    full_name: "Shehryar",
    email: "shehryar@evernestconsultants.com",
    branch_code: "RMT",
    department_name: "Marketing",
    shift_name: "Karachi-Standard",
    monthly_salary: 20000,
    role_description: "Ads & Campaign Manager",
    user_role: "employee",
    attendance_exempt: true,
    remote_allowed: true,
    remote_default_days: [1, 2, 3, 4, 5, 6],
    manager_slug: "yashal",
  }),
  makeEmployee({
    slug: "ravil",
    full_name: "Ravil",
    email: "ravil@evernestconsultants.com",
    branch_code: "RMT",
    department_name: "Marketing",
    shift_name: "Karachi-Standard",
    monthly_salary: 12000,
    role_description: "Content Specialist",
    user_role: "employee",
    attendance_exempt: true,
    remote_allowed: true,
    remote_default_days: [1, 2, 3, 4, 5, 6],
    manager_slug: "yashal",
  }),
  makeEmployee({
    slug: "murtaza",
    full_name: "Murtaza",
    email: "murtaza@evernestconsultants.com",
    branch_code: "RMT",
    department_name: "Marketing",
    shift_name: "Karachi-Standard",
    monthly_salary: 12000,
    role_description: "Designer",
    user_role: "employee",
    attendance_exempt: true,
    remote_allowed: true,
    remote_default_days: [1, 2, 3, 4, 5, 6],
    manager_slug: "yashal",
  }),
  makeEmployee({
    slug: "aun",
    full_name: "Aun",
    email: "aun@evernestconsultants.com",
    branch_code: "RMT",
    department_name: "Marketing",
    shift_name: "Karachi-Standard",
    monthly_salary: 13000,
    role_description: "Video Designer",
    user_role: "employee",
    attendance_exempt: true,
    remote_allowed: true,
    remote_default_days: [1, 2, 3, 4, 5, 6],
    hire_date: "2026-04-01",
    manager_slug: "yashal",
  }),
];

// ---------- mock attendance for "today" ----------
//
// Synthesized in pure JS based on today's date; no DB needed.
// Use lib/attendance/format.ts helpers (Phase 4) to label statuses.

export function makeMockTodayAttendance(today: Date = new Date()): Array<
  AttendanceRecord & { employee_full_name: string; branch_code: string | null }
> {
  const isoDate = today.toISOString().slice(0, 10);
  // Sunday = locked off; UI handles it. Still render rows so the panel
  // visually shows everyone but with status='day_off' or similar.
  // For mock, hand-tune statuses to demonstrate each chip variant.
  const fixtures: Array<{
    slug: string;
    status: AttendanceStatus;
    check_in_offset_min?: number; // minutes after expected_start; negative = early
    worked_min?: number;
    is_late?: boolean;
    is_half_day?: boolean;
    is_absent?: boolean;
    mode?: "office" | "remote" | "manual";
    requires_review?: boolean;
  }> = [
    { slug: "komal", status: "present", check_in_offset_min: 4, worked_min: 480 },
    { slug: "rabia", status: "late", check_in_offset_min: 22, worked_min: 410, is_late: true },
    { slug: "aayan", status: "remote_present", check_in_offset_min: 5, worked_min: 360, mode: "remote" },
    { slug: "sufyan", status: "remote_pending_review", check_in_offset_min: 8, worked_min: 360, mode: "remote", requires_review: true },
    { slug: "deena", status: "absent", is_absent: true },
    { slug: "ushna", status: "present", check_in_offset_min: 2, worked_min: 470 },
    { slug: "mehwish", status: "half_day", check_in_offset_min: 5, worked_min: 200, is_half_day: true },
    // marketing folks are attendance_exempt — they would not normally appear
    // in the Today panel, but include one to demonstrate "n/a" handling.
  ];

  return fixtures.map((f) => {
    const emp = MOCK_EMPLOYEES.find((e) => e.id === id(`emp-${f.slug}`))!;
    const shift = MOCK_SHIFTS.find((s) => s.id === emp.shift_id)!;
    const expectedStart = `${isoDate}T${shift.start_time}+05:00`;
    const expectedEnd = `${isoDate}T${shift.end_time}+05:00`;
    const checkInAt = !f.is_absent
      ? offsetIso(expectedStart, f.check_in_offset_min ?? 0)
      : null;
    const checkOutAt = !f.is_absent && f.worked_min
      ? offsetIso(checkInAt!, f.worked_min)
      : null;

    return {
      id: id(`att-${isoDate}-${f.slug}`),
      employee_id: emp.id,
      date: isoDate,
      shift_id: emp.shift_id,
      expected_start: expectedStart,
      expected_end: expectedEnd,
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
      worked_minutes: f.worked_min ?? null,
      status: f.status,
      late_minutes: f.is_late ? Math.max(0, (f.check_in_offset_min ?? 0) - shift.late_grace_minutes) : 0,
      is_late: f.is_late ?? false,
      is_half_day: f.is_half_day ?? false,
      is_absent: f.is_absent ?? false,
      mode: f.mode ?? "office",
      ip_address: null,
      user_agent: null,
      geolocation: null,
      branch_id: emp.branch_id,
      requires_review: f.requires_review ?? false,
      approved_by: null,
      approval_note: null,
      created_at: EPOCH,
      updated_at: EPOCH,
      employee_full_name: emp.full_name,
      branch_code: emp.branch_code,
    };
  });
}

function offsetIso(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}
