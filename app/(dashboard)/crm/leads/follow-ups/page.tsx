import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FollowupBoard,
  FollowupKpis,
  type FollowupBucket,
  type FollowupBucketKey,
} from "@/components/crm/FollowupBoard";
import { getCurrentUser } from "@/lib/auth/current-user";
import { todayPKT } from "@/lib/attendance/format";
import {
  listCrmAssignableEmployees,
  listCrmLeadsForFollowupBoard,
  type CrmFollowupBoardLeadVM,
} from "@/lib/db/crm";
import type { CrmLeadStatus } from "@/lib/types/crm";

type Search = {
  agent?: string;
  status?: string;
  country?: string;
};

const CRM_LEAD_STATUS_OPTIONS: CrmLeadStatus[] = [
  "new",
  "assigned",
  "contacted",
  "qualified",
  "follow_up",
  "lost",
  "converted",
];

const BUCKET_DEFS: Array<Omit<FollowupBucket, "leads">> = [
  {
    key: "overdue",
    title: "Overdue",
    description: "Follow-ups before today in PKT.",
    countTone: "bg-red-50 text-red-800 ring-red-600/15",
  },
  {
    key: "today",
    title: "Due today",
    description: "Follow-ups within today's PKT window.",
    countTone: "bg-amber-50 text-amber-800 ring-amber-600/15",
  },
  {
    key: "upcoming",
    title: "Upcoming",
    description: "Follow-ups after today.",
    countTone: "bg-gray-50 text-gray-800 ring-gray-500/15",
  },
  {
    key: "none",
    title: "No follow-up",
    description: "Open leads without a scheduled follow-up.",
    countTone: "bg-gray-50 text-gray-800 ring-gray-500/15",
  },
];

export default async function CrmFollowupsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  const isSuperAdmin = me.appUser.role === "super_admin";
  const selectedAgentId = isSuperAdmin ? cleanParam(sp.agent) : null;
  const scopeToEmployeeId = isSuperAdmin
    ? selectedAgentId
    : me.employee?.id ?? null;
  const statusFilter = parseStatus(sp.status);
  const countryFilter = cleanParam(sp.country);

  const [employees, leads] = await Promise.all([
    isSuperAdmin ? listCrmAssignableEmployees() : Promise.resolve([]),
    scopeToEmployeeId === null && !isSuperAdmin
      ? Promise.resolve([])
      : listCrmLeadsForFollowupBoard({
          scopeToEmployeeId,
          statusFilter,
          countryFilter,
        }),
  ]);

  const nowUtc = new Date();
  const { startUtc, endUtc } = todayPktUtcBounds(nowUtc);
  const buckets = bucketLeads(leads, nowUtc, startUtc, endUtc);
  const hasEmployeeScope = isSuperAdmin || Boolean(me.employee?.id);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Follow-ups</h1>
          <p className="text-sm text-gray-500">
            Your assigned leads grouped by next follow-up.
          </p>
        </div>
        <Link
          href="/crm/leads"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          CRM leads
        </Link>
      </header>

      <FollowupKpis buckets={buckets} />

      <section className="sticky top-4 z-10 rounded-lg bg-white/95 p-4 shadow ring-1 ring-black/5 backdrop-blur">
        <form className="flex flex-wrap items-end gap-3">
          {isSuperAdmin && (
            <label className="space-y-1 text-xs font-medium text-gray-600">
              <span>Counselor</span>
              <select
                name="agent"
                defaultValue={selectedAgentId ?? ""}
                className="w-56 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">All counselors</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name} ({employee.branch_code ?? "no branch"})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              className="w-44 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value="">All statuses</option>
              {CRM_LEAD_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Country</span>
            <input
              name="country"
              defaultValue={countryFilter ?? ""}
              placeholder="e.g. Italy"
              className="w-48 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Filter
          </button>
          <Link
            href="/crm/leads/follow-ups"
            className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Clear filters
          </Link>
        </form>
      </section>

      {!hasEmployeeScope ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No assigned leads found for your account.
        </p>
      ) : (
        <FollowupBoard buckets={buckets} nowUtc={nowUtc} />
      )}
    </div>
  );
}

function parseStatus(value: string | undefined): CrmLeadStatus | null {
  return CRM_LEAD_STATUS_OPTIONS.includes(value as CrmLeadStatus)
    ? (value as CrmLeadStatus)
    : null;
}

function cleanParam(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function todayPktUtcBounds(nowUtc: Date): { startUtc: Date; endUtc: Date } {
  const [year, month, day] = todayPKT(nowUtc)
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  const startUtc = new Date(Date.UTC(year, month - 1, day, -5, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month - 1, day + 1, -5, 0, 0, -1));
  return { startUtc, endUtc };
}

function bucketLeads(
  leads: CrmFollowupBoardLeadVM[],
  nowUtc: Date,
  pktTodayStartUtc: Date,
  pktTodayEndUtc: Date
): FollowupBucket[] {
  const grouped: Record<FollowupBucketKey, CrmFollowupBoardLeadVM[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    none: [],
  };

  for (const lead of leads) {
    grouped[bucketOf(lead, nowUtc, pktTodayStartUtc, pktTodayEndUtc)].push(lead);
  }

  return BUCKET_DEFS.map((bucket) => ({
    ...bucket,
    leads: grouped[bucket.key],
  }));
}

function bucketOf(
  lead: CrmFollowupBoardLeadVM,
  _nowUtc: Date,
  pktTodayStartUtc: Date,
  pktTodayEndUtc: Date
): FollowupBucketKey {
  if (!lead.next_followup_at) return "none";
  const at = new Date(lead.next_followup_at);
  if (at < pktTodayStartUtc) return "overdue";
  if (at <= pktTodayEndUtc) return "today";
  return "upcoming";
}
