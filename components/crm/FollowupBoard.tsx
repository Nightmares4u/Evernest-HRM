import Link from "next/link";
import { Chip } from "@/components/StatusChip";
import { formatCrmDateTime } from "@/lib/crm/format";
import type { CrmFollowupBoardLeadVM } from "@/lib/db/crm";
import type { CrmLeadStatus } from "@/lib/types/crm";

export type FollowupBucketKey = "overdue" | "today" | "upcoming" | "none";

export type FollowupBucket = {
  key: FollowupBucketKey;
  title: string;
  description: string;
  countTone: string;
  leads: CrmFollowupBoardLeadVM[];
};

const STATUS_TONES: Record<
  CrmLeadStatus,
  "green" | "amber" | "red" | "blue" | "gray" | "indigo" | "yellow"
> = {
  new: "indigo",
  assigned: "blue",
  contacted: "amber",
  qualified: "green",
  follow_up: "yellow",
  lost: "red",
  converted: "green",
};

export function FollowupKpis({ buckets }: { buckets: FollowupBucket[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {buckets.map((bucket) => (
        <div
          key={bucket.key}
          className={`rounded-lg p-4 shadow ring-1 ring-black/5 ${bucket.countTone}`}
        >
          <div className="text-xs font-medium uppercase tracking-wide">{bucket.title}</div>
          <div className="mt-2 text-3xl font-semibold">{bucket.leads.length}</div>
        </div>
      ))}
    </section>
  );
}

export function FollowupBoard({
  buckets,
  nowUtc,
}: {
  buckets: FollowupBucket[];
  nowUtc: Date;
}) {
  return (
    <section className="space-y-6">
      {buckets.map((bucket) => (
        <div key={bucket.key} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">{bucket.title}</h2>
              <p className="text-xs text-gray-500">{bucket.description}</p>
            </div>
            <span className="text-xs text-gray-500">{bucket.leads.length} leads</span>
          </div>

          {bucket.leads.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
              Nothing in this bucket.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {bucket.leads.map((lead) => (
                <FollowupCard
                  key={lead.id}
                  lead={lead}
                  bucketKey={bucket.key}
                  nowUtc={nowUtc}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function FollowupCard({
  lead,
  bucketKey,
  nowUtc,
}: {
  lead: CrmFollowupBoardLeadVM;
  bucketKey: FollowupBucketKey;
  nowUtc: Date;
}) {
  return (
    <Link
      href={`/crm/leads/${lead.id}`}
      className="block rounded-lg bg-white p-4 shadow ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-gray-900">
            {lead.customer_name || lead.customer_phone}
          </div>
          {lead.customer_name && (
            <div className="mt-0.5 text-xs text-gray-500">{lead.customer_phone}</div>
          )}
        </div>
        <Chip label={lead.status} tone={STATUS_TONES[lead.status] ?? "gray"} />
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <Meta label="Follow-up" value={followupLabel(lead, bucketKey, nowUtc)} />
        <Meta label="Counselor" value={lead.assigned_agent_name ?? "Unassigned"} />
        {lead.source_whatsapp_label && (
          <Meta label="WhatsApp" value={lead.source_whatsapp_label} />
        )}
        {lead.interested_country && <Meta label="Country" value={lead.interested_country} />}
        {lead.branch_code && <Meta label="Branch" value={lead.branch_code} />}
      </div>
    </Link>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="min-w-0 text-right text-gray-700">{value}</span>
    </div>
  );
}

function followupLabel(
  lead: CrmFollowupBoardLeadVM,
  bucketKey: FollowupBucketKey,
  nowUtc: Date
): string {
  if (!lead.next_followup_at) return "No follow-up set";

  if (bucketKey === "overdue") {
    return `Overdue by ${overdueBy(lead.next_followup_at, nowUtc)}`;
  }

  if (bucketKey === "today") {
    return `Today ${formatTimePKT(lead.next_followup_at)}`;
  }

  return formatCrmDateTime(lead.next_followup_at);
}

function overdueBy(iso: string, nowUtc: Date): string {
  const diffMs = Math.max(0, nowUtc.getTime() - new Date(iso).getTime());
  const totalHours = Math.max(1, Math.floor(diffMs / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

function formatTimePKT(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
