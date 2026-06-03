export type CrmFallbackWindow = {
  fallback_active: boolean | null;
  fallback_employee_id: string | null;
  fallback_starts_at: string | null;
  fallback_ends_at: string | null;
};

function parseBoundary(value: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NaN : timestamp;
}

export function isWhatsappNumberFallbackActiveNow(
  fallback: CrmFallbackWindow,
  now: Date = new Date()
): boolean {
  if (!fallback.fallback_active || !fallback.fallback_employee_id) return false;

  const nowTimestamp = now.getTime();
  if (Number.isNaN(nowTimestamp)) return false;

  const startsAt = parseBoundary(fallback.fallback_starts_at);
  const endsAt = parseBoundary(fallback.fallback_ends_at);

  if (startsAt !== null && Number.isNaN(startsAt)) return false;
  if (endsAt !== null && Number.isNaN(endsAt)) return false;
  if (startsAt != null && nowTimestamp < startsAt) return false;
  if (endsAt != null && nowTimestamp > endsAt) return false;

  return true;
}
