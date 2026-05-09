import { createAdminClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/db/queries";
import type { AttendanceRecord, Holiday } from "@/lib/types/hrm";

export type HolidayRowVM = Holiday & {
  branch_name: string | null;
  branch_code: string | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function holidaySelect() {
  return `
    id, date, name, type, branch_id, employee_id, is_paid,
    company_wide, notes, created_by, created_at,
    branches ( name, code )
  `;
}

type HolidayRaw = Holiday & {
  branches: { name: string; code: string } | { name: string; code: string }[] | null;
};

function rowToHoliday(row: HolidayRaw): HolidayRowVM {
  const branch = pickOne(row.branches);
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    type: row.type,
    branch_id: row.branch_id,
    employee_id: row.employee_id,
    is_paid: row.is_paid,
    company_wide: row.company_wide,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    branch_name: branch?.name ?? null,
    branch_code: branch?.code ?? null,
  };
}

export async function listHolidays(
  startDate?: string,
  endDate?: string
): Promise<HolidayRowVM[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createAdminClient();
  let query = supabase
    .from("holidays")
    .select(holidaySelect())
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);

  const { data, error } = await query;
  if (error) throw new Error(`listHolidays: ${error.message}`);
  return ((data ?? []) as unknown as HolidayRaw[]).map(rowToHoliday);
}

export async function listAttendanceForPayroll(
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) throw new Error(`listAttendanceForPayroll: ${error.message}`);
  return (data ?? []) as AttendanceRecord[];
}
