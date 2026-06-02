import { addDaysIso, endOfMonth, startOfMonth } from "@/lib/attendance/format";
import { countScheduledWorkingDays } from "@/lib/payroll/preview";
import type { AttendanceRecord, EmployeeWithJoins, Holiday } from "@/lib/types/hrm";

export type PayrollExportMode = "monthly" | "custom_range" | "yearly";
export type PayrollExportScope = "all" | "branch" | "department" | "employee";

export type PayrollExportFilters = {
  mode: PayrollExportMode;
  month: string;
  year: number;
  startDate: string;
  endDate: string;
  scope: PayrollExportScope;
  branchId: string | null;
  departmentId: string | null;
  employeeId: string | null;
};

export type PayrollExportRow = {
  employeeId: string;
  employeeName: string;
  contactEmail: string | null;
  contactNumber: string | null;
  cnic: string | null;
  bankName: string | null;
  bankBranchName: string | null;
  bankAccountOrIban: string | null;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  departmentId: string | null;
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
};

export type PayrollExportBreakdownRow = PayrollExportRow & {
  month: string;
};

export type PayrollExportGroupTotal = {
  key: string;
  label: string;
  employeeCount: number;
  grossBasePayable: number;
  deductionAmount: number;
  netPayable: number;
};

export type PayrollExportReport = {
  filters: PayrollExportFilters;
  periodLabel: string;
  scopeLabel: string;
  rows: PayrollExportRow[];
  monthlyBreakdown: PayrollExportBreakdownRow[];
  totals: {
    employeeCount: number;
    grossBasePayable: number;
    deductionAmount: number;
    netPayable: number;
  };
  branchTotals: PayrollExportGroupTotal[];
  departmentTotals: PayrollExportGroupTotal[];
};

const PRESENT_STATUSES = new Set(["present", "late", "half_day", "approved_manually"]);
const REMOTE_STATUSES = new Set(["remote_present", "remote_late", "remote_half_day"]);
const LATE_STATUSES = new Set(["late", "remote_late"]);
const HALF_DAY_STATUSES = new Set(["half_day", "remote_half_day"]);

export function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function isMonthKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number.parseInt(value.slice(5, 7), 10);
  return month >= 1 && month <= 12;
}

export function monthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthKey}-01T00:00:00Z`));
}

export function monthsInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let cursor = startOfMonth(startDate);
  while (cursor <= endDate) {
    out.push(cursor.slice(0, 7));
    cursor = addMonths(cursor.slice(0, 7), 1) + "-01";
  }
  return out;
}

export function addMonths(monthKey: string, n: number): string {
  const [year, month] = monthKey.split("-").map((part) => Number.parseInt(part, 10));
  const dt = new Date(Date.UTC(year, month - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
}

export function resolvePayrollPeriod(filters: PayrollExportFilters): {
  startDate: string;
  endDate: string;
  label: string;
} {
  if (filters.mode === "yearly") {
    return {
      startDate: `${filters.year}-01-01`,
      endDate: `${filters.year}-12-31`,
      label: String(filters.year),
    };
  }
  if (filters.mode === "custom_range") {
    return {
      startDate: filters.startDate,
      endDate: filters.endDate,
      label: `${filters.startDate} to ${filters.endDate}`,
    };
  }
  const startDate = `${filters.month}-01`;
  return {
    startDate,
    endDate: endOfMonth(startDate),
    label: monthLabel(filters.month),
  };
}

export function filterPayrollEmployees(
  employees: EmployeeWithJoins[],
  filters: PayrollExportFilters
): EmployeeWithJoins[] {
  return employees.filter((employee) => {
    if (filters.scope === "branch") return employee.branch_id === filters.branchId;
    if (filters.scope === "department") {
      return employee.department_id === filters.departmentId;
    }
    if (filters.scope === "employee") return employee.id === filters.employeeId;
    return true;
  });
}

export function buildPayrollExportReport(args: {
  filters: PayrollExportFilters;
  employees: EmployeeWithJoins[];
  records: AttendanceRecord[];
  holidays: Holiday[];
  scopeLabel: string;
}): PayrollExportReport {
  const period = resolvePayrollPeriod(args.filters);
  const employees = filterPayrollEmployees(args.employees, args.filters);
  const recordsByEmployee = groupBy(args.records, (record) => record.employee_id);
  const monthlyBreakdown: PayrollExportBreakdownRow[] = [];

  const rows = employees.map((employee) => {
    const employeeRecords = recordsByEmployee.get(employee.id) ?? [];
    if (args.filters.mode === "yearly") {
      const monthlyRows = monthsInRange(period.startDate, period.endDate).map((month) => {
        const monthStart = `${month}-01`;
        const monthEnd = endOfMonth(monthStart);
        return buildEmployeePayrollRow({
          employee,
          records: employeeRecords.filter(
            (record) => record.date >= monthStart && record.date <= monthEnd
          ),
          holidays: args.holidays,
          periodStart: monthStart,
          periodEnd: monthEnd,
        });
      });
      monthlyBreakdown.push(
        ...monthlyRows.map((row, index) => ({
          ...row,
          month: monthsInRange(period.startDate, period.endDate)[index],
        }))
      );
      return aggregateRows(employee, monthlyRows, period.startDate, period.endDate);
    }

    return buildEmployeePayrollRow({
      employee,
      records: employeeRecords,
      holidays: args.holidays,
      periodStart: period.startDate,
      periodEnd: period.endDate,
    });
  });

  return {
    filters: args.filters,
    periodLabel: period.label,
    scopeLabel: args.scopeLabel,
    rows,
    monthlyBreakdown,
    totals: summarizeRows(rows),
    branchTotals: groupTotals(rows, (row) => row.branchId ?? "unassigned", (row) =>
      row.branchCode ?? row.branchName ?? "Unassigned"
    ),
    departmentTotals: groupTotals(
      rows,
      (row) => row.departmentId ?? "unassigned",
      (row) => row.departmentName ?? "Unassigned"
    ),
  };
}

function buildEmployeePayrollRow(args: {
  employee: EmployeeWithJoins;
  records: AttendanceRecord[];
  holidays: Holiday[];
  periodStart: string;
  periodEnd: string;
}): PayrollExportRow {
  const records = args.records.filter(
    (record) => record.date >= args.periodStart && record.date <= args.periodEnd
  );
  const scheduledWorkingDays = countScheduledWorkingDays(
    args.periodStart,
    args.periodEnd,
    args.employee.branch_id,
    args.holidays
  );
  const presentDays = records.filter((record) => PRESENT_STATUSES.has(record.status)).length;
  const remoteDays = records.filter((record) => REMOTE_STATUSES.has(record.status)).length;
  const leaveDays = records.filter((record) => record.status === "on_leave").length;
  const absentRecords = records.filter((record) => record.status === "absent");
  const lateRecords = records.filter((record) => LATE_STATUSES.has(record.status));
  const halfDayRecords = records.filter((record) => HALF_DAY_STATUSES.has(record.status));
  const lateDeductionRecords = everyNth(lateRecords, 3);
  const halfDayDeductionRecords = halfDayRecords.slice(2);
  const attendanceExempt = args.employee.attendance_exempt;
  const absentDays = attendanceExempt ? 0 : absentRecords.length;
  const lateCount = attendanceExempt ? 0 : lateRecords.length;
  const lateDeductionDays = attendanceExempt ? 0 : lateDeductionRecords.length;
  const halfDayCount = attendanceExempt ? 0 : halfDayRecords.length;
  const halfDayDeductionDays = attendanceExempt ? 0 : halfDayDeductionRecords.length * 0.5;
  const paidHolidays = countPaidHolidays({
    holidays: args.holidays,
    employeeId: args.employee.id,
    branchId: args.employee.branch_id,
    startDate: args.periodStart,
    endDate: args.periodEnd,
  });
  const grossBasePayable = calculateBasePay({
    employee: args.employee,
    holidays: args.holidays,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
  });
  const deductionAmount = attendanceExempt
    ? 0
    : Math.round(
        absentRecords.reduce(
          (sum, record) => sum + dailyRateForDate(args.employee, args.holidays, record.date),
          0
        ) +
          lateDeductionRecords.reduce(
            (sum, record) => sum + dailyRateForDate(args.employee, args.holidays, record.date),
            0
          ) +
          halfDayDeductionRecords.reduce(
            (sum, record) =>
              sum + dailyRateForDate(args.employee, args.holidays, record.date) * 0.5,
            0
          )
      );
  const totalDeductionDays =
    absentDays + lateDeductionDays + halfDayDeductionDays;
  const roundedGrossBasePayable = Math.round(grossBasePayable);

  return {
    employeeId: args.employee.id,
    employeeName: payrollEmployeeName(args.employee),
    contactEmail: args.employee.contact_email,
    contactNumber: args.employee.contact_number,
    cnic: args.employee.cnic,
    bankName: args.employee.bank_name,
    bankBranchName: args.employee.bank_branch_name,
    bankAccountOrIban: args.employee.bank_account_or_iban,
    branchId: args.employee.branch_id,
    branchName: args.employee.branch_name,
    branchCode: args.employee.branch_code,
    departmentId: args.employee.department_id,
    departmentName: args.employee.department_name,
    role: args.employee.role_description ?? args.employee.user_role,
    monthlySalary: args.employee.monthly_salary,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    scheduledWorkingDays,
    presentDays,
    remoteDays,
    leaveDays,
    paidHolidays,
    absentDays,
    lateCount,
    lateDeductionDays,
    halfDayCount,
    halfDayDeductionDays,
    totalDeductionDays,
    grossBasePayable: roundedGrossBasePayable,
    deductionAmount,
    netPayable: Math.max(0, roundedGrossBasePayable - deductionAmount),
    notesStatus: args.employee.employment_status === "active" ? "Payroll-ready" : args.employee.employment_status,
  };
}

function calculateBasePay(args: {
  employee: EmployeeWithJoins;
  holidays: Holiday[];
  periodStart: string;
  periodEnd: string;
}): number {
  return monthsInRange(args.periodStart, args.periodEnd).reduce((sum, month) => {
    const monthStart = `${month}-01`;
    const monthEnd = endOfMonth(monthStart);
    const segmentStart = args.periodStart > monthStart ? args.periodStart : monthStart;
    const segmentEnd = args.periodEnd < monthEnd ? args.periodEnd : monthEnd;
    const fullMonthWorkingDays = countScheduledWorkingDays(
      monthStart,
      monthEnd,
      args.employee.branch_id,
      args.holidays
    );
    const segmentWorkingDays = countScheduledWorkingDays(
      segmentStart,
      segmentEnd,
      args.employee.branch_id,
      args.holidays
    );
    if (fullMonthWorkingDays <= 0) return sum;
    return sum + args.employee.monthly_salary * (segmentWorkingDays / fullMonthWorkingDays);
  }, 0);
}

function dailyRateForDate(
  employee: EmployeeWithJoins,
  holidays: Holiday[],
  date: string
): number {
  const monthStart = startOfMonth(date);
  const scheduledWorkingDays = countScheduledWorkingDays(
    monthStart,
    endOfMonth(monthStart),
    employee.branch_id,
    holidays
  );
  return scheduledWorkingDays > 0 ? employee.monthly_salary / scheduledWorkingDays : 0;
}

function payrollEmployeeName(employee: EmployeeWithJoins): string {
  const personalName = [
    employee.first_name,
    employee.middle_name,
    employee.last_name,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return personalName || employee.full_name;
}

function countPaidHolidays(args: {
  holidays: Holiday[];
  employeeId: string;
  branchId: string | null;
  startDate: string;
  endDate: string;
}): number {
  return args.holidays.filter((holiday) => {
    if (!holiday.is_paid || holiday.date < args.startDate || holiday.date > args.endDate) {
      return false;
    }
    if (holiday.employee_id) return holiday.employee_id === args.employeeId;
    if (holiday.company_wide) return true;
    return Boolean(args.branchId && holiday.branch_id === args.branchId);
  }).length;
}

function everyNth<T>(items: T[], n: number): T[] {
  return items.filter((_, index) => (index + 1) % n === 0);
}

function aggregateRows(
  employee: EmployeeWithJoins,
  rows: PayrollExportRow[],
  periodStart: string,
  periodEnd: string
): PayrollExportRow {
  const totals = summarizeRows(rows);
  return {
    employeeId: employee.id,
    employeeName: payrollEmployeeName(employee),
    contactEmail: employee.contact_email,
    contactNumber: employee.contact_number,
    cnic: employee.cnic,
    bankName: employee.bank_name,
    bankBranchName: employee.bank_branch_name,
    bankAccountOrIban: employee.bank_account_or_iban,
    branchId: employee.branch_id,
    branchName: employee.branch_name,
    branchCode: employee.branch_code,
    departmentId: employee.department_id,
    departmentName: employee.department_name,
    role: employee.role_description ?? employee.user_role,
    monthlySalary: employee.monthly_salary,
    periodStart,
    periodEnd,
    scheduledWorkingDays: sum(rows, "scheduledWorkingDays"),
    presentDays: sum(rows, "presentDays"),
    remoteDays: sum(rows, "remoteDays"),
    leaveDays: sum(rows, "leaveDays"),
    paidHolidays: sum(rows, "paidHolidays"),
    absentDays: sum(rows, "absentDays"),
    lateCount: sum(rows, "lateCount"),
    lateDeductionDays: sum(rows, "lateDeductionDays"),
    halfDayCount: sum(rows, "halfDayCount"),
    halfDayDeductionDays: sum(rows, "halfDayDeductionDays"),
    totalDeductionDays: sum(rows, "totalDeductionDays"),
    grossBasePayable: totals.grossBasePayable,
    deductionAmount: totals.deductionAmount,
    netPayable: totals.netPayable,
    notesStatus: "Annual aggregate",
  };
}

function summarizeRows(rows: PayrollExportRow[]) {
  return {
    employeeCount: rows.length,
    grossBasePayable: sum(rows, "grossBasePayable"),
    deductionAmount: sum(rows, "deductionAmount"),
    netPayable: sum(rows, "netPayable"),
  };
}

function groupTotals(
  rows: PayrollExportRow[],
  getKey: (row: PayrollExportRow) => string,
  getLabel: (row: PayrollExportRow) => string
): PayrollExportGroupTotal[] {
  const grouped = new Map<string, PayrollExportGroupTotal>();
  for (const row of rows) {
    const key = getKey(row);
    const current = grouped.get(key) ?? {
      key,
      label: getLabel(row),
      employeeCount: 0,
      grossBasePayable: 0,
      deductionAmount: 0,
      netPayable: 0,
    };
    current.employeeCount += 1;
    current.grossBasePayable += row.grossBasePayable;
    current.deductionAmount += row.deductionAmount;
    current.netPayable += row.netPayable;
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }
  return grouped;
}

function sum<T extends Record<string, unknown>>(items: T[], key: keyof T): number {
  return items.reduce((total, item) => total + Number(item[key] ?? 0), 0);
}
