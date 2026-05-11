export type ShiftTiming = {
  id: string | null;
  name?: string | null;
  start_time: string;
  end_time: string;
  late_grace_minutes: number;
  half_day_threshold_minutes: number;
  is_custom: boolean;
};

export function employeeUsesCustomShift(employee: {
  custom_shift_enabled?: boolean | null;
  custom_shift_start?: string | null;
  custom_shift_end?: string | null;
}): boolean {
  return Boolean(
    employee.custom_shift_enabled &&
      employee.custom_shift_start &&
      employee.custom_shift_end
  );
}

export function resolveEmployeeShift(args: {
  employee: {
    custom_shift_enabled?: boolean | null;
    custom_shift_start?: string | null;
    custom_shift_end?: string | null;
  };
  shift: Omit<ShiftTiming, "is_custom"> | null;
}): ShiftTiming | null {
  if (employeeUsesCustomShift(args.employee)) {
    return {
      id: args.shift?.id ?? null,
      name: args.shift?.name ?? null,
      start_time: args.employee.custom_shift_start!,
      end_time: args.employee.custom_shift_end!,
      late_grace_minutes: args.shift?.late_grace_minutes ?? 10,
      half_day_threshold_minutes: args.shift?.half_day_threshold_minutes ?? 240,
      is_custom: true,
    };
  }

  return args.shift ? { ...args.shift, is_custom: false } : null;
}
