import type { AttendanceRecord, EmployeeWithJoins, Holiday } from "@/lib/types/hrm";

export type PayrollPreview = {
  employeeId: string;
  employeeName: string;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  monthlySalary: number;
  scheduledWorkingDays: number;
  dailyDeductionRate: number;
  absentDays: number;
  lateCount: number;
  lateDeductionDays: number;
  halfDayCount: number;
  extraHalfDays: number;
  halfDayDeductionDays: number;
  totalDeductionDays: number;
  deductionAmount: number;
  estimatedPayable: number;
};

const LATE_STATUSES = new Set(["late", "remote_late"]);
const HALF_DAY_STATUSES = new Set(["half_day", "remote_half_day"]);

export function countScheduledWorkingDays(
  monthStart: string,
  monthEnd: string,
  branchId: string | null,
  holidays: Holiday[]
): number {
  const paidHolidayDates = new Set(
    holidays
      .filter(
        (holiday) =>
          holiday.is_paid &&
          holiday.date >= monthStart &&
          holiday.date <= monthEnd &&
          (holiday.company_wide || (branchId != null && holiday.branch_id === branchId))
      )
      .map((holiday) => holiday.date)
  );

  let count = 0;
  const day = new Date(`${monthStart}T00:00:00Z`);
  const end = new Date(`${monthEnd}T00:00:00Z`);
  while (day <= end) {
    const iso = day.toISOString().slice(0, 10);
    const isSunday = day.getUTCDay() === 0;
    if (!isSunday && !paidHolidayDates.has(iso)) count += 1;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}

export function buildPayrollPreview({
  employee,
  records,
  holidays,
  monthStart,
  monthEnd,
}: {
  employee: Pick<
    EmployeeWithJoins,
    "id" | "full_name" | "branch_id" | "branch_name" | "branch_code" | "monthly_salary"
  >;
  records: AttendanceRecord[];
  holidays: Holiday[];
  monthStart: string;
  monthEnd: string;
}): PayrollPreview {
  const lateCount = records.filter((record) => LATE_STATUSES.has(record.status)).length;
  const halfDayCount = records.filter((record) => HALF_DAY_STATUSES.has(record.status)).length;
  const absentDays = records.filter((record) => record.status === "absent").length;
  const lateDeductionDays = Math.floor(lateCount / 3);
  const extraHalfDays = Math.max(0, halfDayCount - 2);
  const halfDayDeductionDays = extraHalfDays * 0.5;
  const totalDeductionDays = absentDays + lateDeductionDays + halfDayDeductionDays;
  const scheduledWorkingDays = countScheduledWorkingDays(
    monthStart,
    monthEnd,
    employee.branch_id,
    holidays
  );
  const dailyDeductionRate =
    scheduledWorkingDays > 0 ? employee.monthly_salary / scheduledWorkingDays : 0;
  const deductionAmount = Math.round(dailyDeductionRate * totalDeductionDays);

  return {
    employeeId: employee.id,
    employeeName: employee.full_name,
    branchId: employee.branch_id,
    branchName: employee.branch_name,
    branchCode: employee.branch_code,
    monthlySalary: employee.monthly_salary,
    scheduledWorkingDays,
    dailyDeductionRate,
    absentDays,
    lateCount,
    lateDeductionDays,
    halfDayCount,
    extraHalfDays,
    halfDayDeductionDays,
    totalDeductionDays,
    deductionAmount,
    estimatedPayable: Math.max(0, employee.monthly_salary - deductionAmount),
  };
}
