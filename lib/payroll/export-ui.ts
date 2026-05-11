import { endOfMonth, todayPKT } from "@/lib/attendance/format";
import {
  isIsoDate,
  isMonthKey,
  type PayrollExportFilters,
  type PayrollExportReport,
  type PayrollExportScope,
  type PayrollExportMode,
} from "@/lib/payroll/export";
import type { Branch, Department, EmployeeWithJoins } from "@/lib/types/hrm";

const MODES: PayrollExportMode[] = ["monthly", "custom_range", "yearly"];
const SCOPES: PayrollExportScope[] = ["all", "branch", "department", "employee"];

export function parsePayrollExportFilters(
  params: URLSearchParams,
  today = todayPKT()
): PayrollExportFilters {
  const modeRaw = params.get("mode") ?? "monthly";
  const mode = MODES.includes(modeRaw as PayrollExportMode)
    ? (modeRaw as PayrollExportMode)
    : "monthly";
  const month = isMonthKey(params.get("month")) ? params.get("month")! : today.slice(0, 7);
  const yearRaw = Number.parseInt(params.get("year") ?? today.slice(0, 4), 10);
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
    ? yearRaw
    : Number.parseInt(today.slice(0, 4), 10);
  const fallbackStart = `${month}-01`;
  const fallbackEnd = endOfMonth(fallbackStart);
  const startDate = isIsoDate(params.get("start_date"))
    ? params.get("start_date")!
    : fallbackStart;
  const endDateCandidate = isIsoDate(params.get("end_date"))
    ? params.get("end_date")!
    : fallbackEnd;
  const endDate = endDateCandidate >= startDate ? endDateCandidate : startDate;
  const scopeRaw = params.get("scope") ?? "all";
  const scope = SCOPES.includes(scopeRaw as PayrollExportScope)
    ? (scopeRaw as PayrollExportScope)
    : "all";

  return {
    mode,
    month,
    year,
    startDate,
    endDate,
    scope,
    branchId: params.get("branch_id") || null,
    departmentId: params.get("department_id") || null,
    employeeId: params.get("employee_id") || null,
  };
}

export function filtersToSearchParams(filters: PayrollExportFilters): URLSearchParams {
  const params = new URLSearchParams({
    mode: filters.mode,
    month: filters.month,
    year: String(filters.year),
    start_date: filters.startDate,
    end_date: filters.endDate,
    scope: filters.scope,
  });
  if (filters.branchId) params.set("branch_id", filters.branchId);
  if (filters.departmentId) params.set("department_id", filters.departmentId);
  if (filters.employeeId) params.set("employee_id", filters.employeeId);
  return params;
}

export function scopeLabel(args: {
  filters: PayrollExportFilters;
  branches: Branch[];
  departments: Department[];
  employees: EmployeeWithJoins[];
}): string {
  if (args.filters.scope === "branch") {
    const branch = args.branches.find((item) => item.id === args.filters.branchId);
    return branch ? `Branch: ${branch.name} (${branch.code})` : "Branch";
  }
  if (args.filters.scope === "department") {
    const department = args.departments.find(
      (item) => item.id === args.filters.departmentId
    );
    return department ? `Department: ${department.name}` : "Department";
  }
  if (args.filters.scope === "employee") {
    const employee = args.employees.find((item) => item.id === args.filters.employeeId);
    return employee ? `Employee: ${employee.full_name}` : "Employee";
  }
  return "All company";
}

export function payrollExportFilename(report: PayrollExportReport, extension: "csv"): string {
  if (report.filters.mode === "monthly") {
    const date = new Date(`${report.filters.month}-01T00:00:00Z`);
    const label = new Intl.DateTimeFormat("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
      .format(date)
      .replace(" ", "-");
    return `EN-HRM-Payroll-${label}.${extension}`;
  }
  if (report.filters.mode === "yearly") {
    return `EN-HRM-Payroll-${report.filters.year}.${extension}`;
  }
  return `EN-HRM-Payroll-${report.filters.startDate}_to_${report.filters.endDate}.${extension}`;
}

export function payrollReportToCsv(report: PayrollExportReport): string {
  const rows = [
    ["EN Consultants (Pvt) Ltd."],
    ["Payroll Export / Salary Payable Report"],
    ["Period", report.periodLabel],
    ["Scope", report.scopeLabel],
    [],
    ["Summary"],
    ["Total employees", report.totals.employeeCount],
    ["Total gross/base payable", report.totals.grossBasePayable],
    ["Total deductions", report.totals.deductionAmount],
    ["Total net payable", report.totals.netPayable],
    [],
    ["Employee rows"],
    payrollHeader(),
    ...report.rows.map(payrollRowToCsvRow),
    [],
    ["Branch totals"],
    ["Branch", "Employees", "Gross/Base Payable", "Deductions", "Net Payable"],
    ...report.branchTotals.map((row) => [
      row.label,
      row.employeeCount,
      row.grossBasePayable,
      row.deductionAmount,
      row.netPayable,
    ]),
    [],
    ["Department/category totals"],
    ["Department/category", "Employees", "Gross/Base Payable", "Deductions", "Net Payable"],
    ...report.departmentTotals.map((row) => [
      row.label,
      row.employeeCount,
      row.grossBasePayable,
      row.deductionAmount,
      row.netPayable,
    ]),
  ];

  if (report.monthlyBreakdown.length > 0) {
    rows.push(
      [],
      ["Monthly breakdown"],
      ["Month", ...payrollHeader()],
      ...report.monthlyBreakdown.map((row) => [row.month, ...payrollRowToCsvRow(row)])
    );
  }

  return rows.map(csvLine).join("\r\n");
}

function payrollHeader(): string[] {
  return [
    "Employee name",
    "Contact email",
    "Contact number",
    "CNIC",
    "Bank name",
    "Bank branch name",
    "Account number / IBAN",
    "Branch",
    "Department/category",
    "Role",
    "Salary",
    "Period start",
    "Period end",
    "Scheduled working days",
    "Present days",
    "Remote days",
    "Leave days",
    "Paid holidays",
    "Absent days",
    "Late count",
    "Late deduction days",
    "Half-day count",
    "Half-day deduction days",
    "Total deduction days",
    "Gross/base payable for period",
    "Deduction amount",
    "Net payable",
    "Notes/status",
  ];
}

function payrollRowToCsvRow(row: {
  employeeName: string;
  contactEmail: string | null;
  contactNumber: string | null;
  cnic: string | null;
  bankName: string | null;
  bankBranchName: string | null;
  bankAccountOrIban: string | null;
  branchCode: string | null;
  branchName: string | null;
  departmentName: string | null;
  role: string;
  monthlySalary: number;
  periodStart: string;
  periodEnd: string;
  scheduledWorkingDays: number;
  presentDays: number;
  remoteDays: number;
  leaveDays: number;
  paidHolidays: number;
  absentDays: number;
  lateCount: number;
  lateDeductionDays: number;
  halfDayCount: number;
  halfDayDeductionDays: number;
  totalDeductionDays: number;
  grossBasePayable: number;
  deductionAmount: number;
  netPayable: number;
  notesStatus: string;
}): Array<string | number> {
  return [
    row.employeeName,
    row.contactEmail ?? "",
    row.contactNumber ?? "",
    row.cnic ?? "",
    row.bankName ?? "",
    row.bankBranchName ?? "",
    row.bankAccountOrIban ?? "",
    row.branchCode ?? row.branchName ?? "",
    row.departmentName ?? "",
    row.role,
    row.monthlySalary,
    row.periodStart,
    row.periodEnd,
    row.scheduledWorkingDays,
    row.presentDays,
    row.remoteDays,
    row.leaveDays,
    row.paidHolidays,
    row.absentDays,
    row.lateCount,
    row.lateDeductionDays,
    row.halfDayCount,
    row.halfDayDeductionDays,
    row.totalDeductionDays,
    row.grossBasePayable,
    row.deductionAmount,
    row.netPayable,
    row.notesStatus,
  ];
}

function csvLine(values: Array<string | number | null | undefined>): string {
  return values
    .map((value) => {
      const text = String(value ?? "");
      return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}
