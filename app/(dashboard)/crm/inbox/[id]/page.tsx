import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  parseRawInboxDetails,
  promoteRawInboxToLead,
} from "@/app/(dashboard)/admin/crm/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import { getCrmRawInboxDetail } from "@/lib/db/crm";

type Search = { error?: string; ok?: string };

const STATUS_TONES = {
  raw_new: "indigo",
  awaiting_details: "amber",
  details_received: "green",
  needs_review: "yellow",
  qualified: "green",
  spam_duplicate: "red",
} as const;

export default async function CrmRawInboxDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const row = await getCrmRawInboxDetail(id);
  if (!row) notFound();

  const canMutate = me.appUser.role === "super_admin";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/crm/inbox" className="text-sm text-indigo-600 hover:text-indigo-500">
              Raw inbox
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <span className="text-sm text-gray-500">{row.sender_phone}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Raw intake detail</h1>
          <p className="text-sm text-gray-500">
            Parser review and promotion flow for manual/mock WhatsApp intake.
          </p>
        </div>
        <div className="flex gap-2">
          {canMutate && (
            <form action={parseRawInboxDetails}>
              <input type="hidden" name="id" value={row.id} />
              <button
                type="submit"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Parse Details
              </button>
            </form>
          )}
          {canMutate && !row.lead_id && (
            <form action={promoteRawInboxToLead}>
              <input type="hidden" name="id" value={row.id} />
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Promote to Lead
              </button>
            </form>
          )}
        </div>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Raw message</h2>
            <Chip label={row.status} tone={STATUS_TONES[row.status] ?? "gray"} />
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Lead/customer phone" value={row.sender_phone} />
            <Info label="Received" value={formatCrmDateTime(row.received_at)} />
            <Info
              label="Receiving EN WhatsApp number"
              value={
                row.whatsapp_number_label
                  ? `${row.whatsapp_number_label} (${row.whatsapp_display_number})`
                  : "-"
              }
            />
            <Info
              label="Campaign/source"
              value={
                row.campaign_label
                  ? `${row.campaign_label} (${row.campaign_platform})`
                  : "manual_mock"
              }
            />
          </dl>
          <div className="mt-5 rounded-md bg-gray-50 p-4 text-sm text-gray-800">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              First message
            </div>
            <p className="whitespace-pre-wrap">{row.first_message_text ?? row.last_message_text ?? "-"}</p>
          </div>
        </div>

        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Lead link</h2>
          {row.lead ? (
            <div className="mt-4 space-y-2 text-sm">
              <Link
                href={`/crm/leads/${row.lead.id}`}
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                {row.lead.customer_phone}
              </Link>
              <div className="text-gray-500">
                {row.lead.interested_country ?? "-"} / {row.lead.city ?? "-"}
              </div>
              <Chip label={row.lead.status} tone="indigo" />
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Not promoted yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-900">Parsed/extracted fields</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Country interested" value={row.extracted_country ?? "-"} />
          <Info label="Last qualification" value={row.extracted_qualification ?? "-"} />
          <Info label="Marks/CGPA" value={row.extracted_marks_cgpa ?? "-"} />
          <Info label="Study gap" value={row.extracted_study_gap ?? "-"} />
          <Info label="City" value={row.extracted_city ?? "-"} />
          <Info label="Budget range" value={row.extracted_budget_range ?? "-"} />
          <Info label="English test" value={row.extracted_english_test ?? "-"} />
          <Info
            label="Confidence"
            value={row.parser_confidence == null ? "-" : row.parser_confidence.toFixed(2)}
          />
        </dl>
        {row.missing_fields.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {row.missing_fields.map((field) => (
              <Chip key={field} label={`missing ${field}`} tone="yellow" />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Timeline title="Activity / history" items={row.activities} />
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Message history</h2>
          {row.messages.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No message history rows yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {row.messages.map((message) => (
                <li key={message.id} className="rounded-md border border-gray-100 p-3 text-sm">
                  <div className="mb-1 flex justify-between gap-3 text-xs text-gray-500">
                    <span>{message.direction}</span>
                    <span>{formatCrmDateTime(message.received_at ?? message.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-gray-800">{message.content ?? "-"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function Timeline({
  title,
  items,
}: {
  title: string;
  items: Array<{
    id: string;
    activity_label: string;
    description: string | null;
    actor_name: string | null;
    created_at: string;
  }>;
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No activity yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border-l-2 border-indigo-100 pl-3 text-sm">
              <div className="font-medium text-gray-900">{item.activity_label}</div>
              <div className="text-gray-500">{item.description ?? "-"}</div>
              <div className="mt-1 text-xs text-gray-400">
                {formatCrmDateTime(item.created_at)}
                {item.actor_name ? ` by ${item.actor_name}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "red";
}) {
  const classes =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-md border px-4 py-2 text-sm ${classes}`}>{children}</div>;
}
