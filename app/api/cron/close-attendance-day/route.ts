import { NextResponse } from "next/server";
import { buildPktTimestamp } from "@/lib/attendance/policy";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { defaultCronCloseDate, isIsoDate, isoWeekday } from "@/lib/cron/utils";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ShiftLite = {
  id: string;
  start_time: string;
  end_time: string;
};

type EmployeeRow = {
  id: string;
  branch_id: string | null;
  attendance_exempt: boolean;
  shifts: ShiftLite | ShiftLite[] | null;
};

type HolidayRow = {
  branch_id: string | null;
  employee_id: string | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function holidayAppliesToEmployee(
  holiday: HolidayRow,
  employeeId: string,
  branchId: string | null
): boolean {
  if (holiday.employee_id) return holiday.employee_id === employeeId;
  if (holiday.branch_id) return holiday.branch_id === branchId;
  return true;
}

export async function POST(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const targetDate = url.searchParams.get("date") ?? defaultCronCloseDate();
  if (!isIsoDate(targetDate)) {
    return NextResponse.json(
      { ok: false, error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const summary = {
    ok: true,
    date: targetDate,
    employees_checked: 0,
    absences_created: 0,
    skipped_sunday: false,
    skipped_holiday: 0,
    skipped_leave: 0,
    skipped_exempt: 0,
    already_had_record: 0,
    errors: [] as string[],
  };

  if (isoWeekday(targetDate) === 7) {
    summary.skipped_sunday = true;
    return NextResponse.json(summary);
  }

  const admin = createAdminClient();
  const [employeesRes, existingRes, holidaysRes, leaveRes] = await Promise.all([
    admin
      .from("employees")
      .select(
        `
        id, branch_id, attendance_exempt,
        shifts ( id, start_time, end_time )
        `
      )
      .eq("employment_status", "active"),
    admin
      .from("attendance_records")
      .select("employee_id")
      .eq("date", targetDate),
    admin
      .from("holidays")
      .select("branch_id, employee_id")
      .eq("date", targetDate)
      .eq("is_paid", true),
    admin
      .from("leave_requests")
      .select("employee_id")
      .eq("status", "approved")
      .lte("start_date", targetDate)
      .gte("end_date", targetDate),
  ]);

  if (employeesRes.error) {
    return NextResponse.json(
      { ok: false, error: `Could not load employees: ${employeesRes.error.message}` },
      { status: 500 }
    );
  }
  if (existingRes.error) summary.errors.push(`attendance: ${existingRes.error.message}`);
  if (holidaysRes.error) summary.errors.push(`holidays: ${holidaysRes.error.message}`);
  if (leaveRes.error) summary.errors.push(`leave: ${leaveRes.error.message}`);

  const existingEmployeeIds = new Set(
    ((existingRes.data ?? []) as Array<{ employee_id: string }>).map(
      (row) => row.employee_id
    )
  );
  const holidays = (holidaysRes.data ?? []) as HolidayRow[];
  const leaveEmployeeIds = new Set(
    ((leaveRes.data ?? []) as Array<{ employee_id: string }>).map(
      (row) => row.employee_id
    )
  );

  for (const employee of (employeesRes.data ?? []) as unknown as EmployeeRow[]) {
    summary.employees_checked += 1;

    if (employee.attendance_exempt) {
      summary.skipped_exempt += 1;
      continue;
    }
    if (existingEmployeeIds.has(employee.id)) {
      summary.already_had_record += 1;
      continue;
    }
    if (
      holidays.some((holiday) =>
        holidayAppliesToEmployee(holiday, employee.id, employee.branch_id)
      )
    ) {
      summary.skipped_holiday += 1;
      continue;
    }
    if (leaveEmployeeIds.has(employee.id)) {
      summary.skipped_leave += 1;
      continue;
    }

    const shift = pickOne(employee.shifts);
    if (!shift) {
      summary.errors.push(`employee ${employee.id}: missing shift`);
      continue;
    }

    const { data: record, error: insertError } = await admin
      .from("attendance_records")
      .insert({
        employee_id: employee.id,
        date: targetDate,
        shift_id: shift.id,
        expected_start: buildPktTimestamp(targetDate, shift.start_time),
        expected_end: buildPktTimestamp(targetDate, shift.end_time),
        check_in_at: null,
        check_out_at: null,
        worked_minutes: null,
        status: "absent",
        late_minutes: 0,
        is_late: false,
        is_half_day: false,
        is_absent: true,
        mode: "system",
        geolocation: { status: "system_auto_absent" },
        branch_id: employee.branch_id,
        requires_review: false,
        verification_status: "system_auto_absent",
        review_reason: null,
      })
      .select("id")
      .single();

    if (insertError || !record) {
      if (insertError?.code === "23505") {
        summary.already_had_record += 1;
      } else {
        summary.errors.push(
          `employee ${employee.id}: ${insertError?.message ?? "insert failed"}`
        );
      }
      continue;
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: null,
      target_type: "attendance_record",
      target_id: record.id,
      action: "cron_auto_absent",
      old_value: null,
      new_value: {
        employee_id: employee.id,
        date: targetDate,
        status: "absent",
        mode: "system",
      },
      reason: "Daily cron auto-closed missing attendance as absent",
    });
    if (auditError) {
      summary.errors.push(`audit ${record.id}: ${auditError.message}`);
    }
    summary.absences_created += 1;
  }

  return NextResponse.json(summary);
}
