import { addDaysIso, todayPKT } from "@/lib/attendance/format";

export type CronParams = Record<string, string>;

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function defaultCronCloseDate(): string {
  return addDaysIso(todayPKT(), -1);
}

export function parseYearMonth(params: URLSearchParams): {
  year: number;
  month: number;
} {
  const today = todayPKT();
  const fallbackYear = Number.parseInt(today.slice(0, 4), 10);
  const fallbackMonth = Number.parseInt(today.slice(5, 7), 10);
  const year = Number.parseInt(params.get("year") ?? "", 10);
  const month = Number.parseInt(params.get("month") ?? "", 10);
  return {
    year: Number.isFinite(year) ? year : fallbackYear,
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : fallbackMonth,
  };
}

export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function previousYearMonth(year: number, month: number): {
  year: number;
  month: number;
} {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}
