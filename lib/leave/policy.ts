// Pure leave-rule helpers.

/**
 * Count Mon-Sat days inclusive between two ISO dates (YYYY-MM-DD).
 * Skips Sundays. Returns 0 if range is invalid.
 *
 * Note: doesn't subtract holidays — admin can adjust the days_count when
 * reviewing if a holiday falls inside the range. (Holiday subtraction can
 * land in a follow-up phase.)
 */
export function countWorkingDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) return 0;

  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    // getUTCDay: 0=Sun..6=Sat
    if (d.getUTCDay() !== 0) days += 1;
  }
  return days;
}

/**
 * Yield each Mon-Sat date string between start and end (inclusive).
 */
export function eachWorkingDay(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  if (end < start) return out;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0) {
      out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}
