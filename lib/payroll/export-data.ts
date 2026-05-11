import { redirect } from "next/navigation";
import { endOfMonth, startOfMonth } from "@/lib/attendance/format";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listBranches, listDepartments, listEmployees } from "@/lib/db/queries";
import { listAttendanceForPayroll, listHolidays } from "@/lib/db/payroll";
import {
  buildPayrollExportReport,
  filterPayrollEmployees,
  resolvePayrollPeriod,
  type PayrollExportFilters,
} from "@/lib/payroll/export";
import { scopeLabel } from "@/lib/payroll/export-ui";

export async function loadPayrollExportReport(filters: PayrollExportFilters) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin%20access%20required");
  }

  const [employees, branches, departments] = await Promise.all([
    listEmployees(),
    listBranches(),
    listDepartments(),
  ]);
  const period = resolvePayrollPeriod(filters);
  const holidayStart = startOfMonth(period.startDate);
  const holidayEnd = endOfMonth(period.endDate);
  const scopedEmployees = filterPayrollEmployees(employees, filters);
  const [attendance, holidays] = await Promise.all([
    listAttendanceForPayroll(period.startDate, period.endDate),
    listHolidays(holidayStart, holidayEnd),
  ]);
  const scopedEmployeeIds = new Set(scopedEmployees.map((employee) => employee.id));
  const report = buildPayrollExportReport({
    filters,
    employees: scopedEmployees,
    records: attendance.filter((record) => scopedEmployeeIds.has(record.employee_id)),
    holidays,
    scopeLabel: scopeLabel({ filters, branches, departments, employees }),
  });

  return {
    me,
    report,
    employees,
    branches,
    departments,
  };
}
