import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDate, formatCrmDateTime } from "@/lib/crm/format";
import { listCrmLeads } from "@/lib/db/crm";

type Search = { error?: string; ok?: string };

const STATUS_TONES = {
  new: "indigo",
  assigned: "blue",
  contacted: "amber",
  qualified: "green",
  follow_up: "yellow",
  lost: "red",
  converted: "green",
} as const;

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  const leads = await listCrmLeads();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">CRM leads</h1>
          <p className="text-sm text-gray-500">
            Promoted Stage 1 leads with assignment and follow-up placeholders.
          </p>
        </div>
        <Link
          href="/crm/inbox"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Raw inbox
        </Link>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Latest leads</h2>
          <span className="text-xs text-gray-500">{leads.length} shown</span>
        </div>
        {leads.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No CRM leads visible for your role yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Lead</Th>
                  <Th>Country/product</Th>
                  <Th>City</Th>
                  <Th>Status</Th>
                  <Th>Assigned</Th>
                  <Th>Branch</Th>
                  <Th>Source/campaign</Th>
                  <Th>Next follow-up</Th>
                  <Th>Latest activity</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/crm/leads/${lead.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        {lead.customer_name || lead.customer_phone}
                      </Link>
                      {lead.customer_name && (
                        <div className="text-xs text-gray-500">{lead.customer_phone}</div>
                      )}
                    </Td>
                    <Td>
                      <div>{lead.interested_country ?? "-"}</div>
                      <div className="text-xs text-gray-500">
                        {lead.product_category ?? "-"}
                      </div>
                    </Td>
                    <Td>{lead.city ?? "-"}</Td>
                    <Td>
                      <Chip label={lead.status} tone={STATUS_TONES[lead.status] ?? "gray"} />
                    </Td>
                    <Td>{lead.assigned_agent_name ?? "Unassigned"}</Td>
                    <Td>
                      {lead.branch_code ? `${lead.branch_code} - ${lead.branch_name}` : "-"}
                    </Td>
                    <Td>
                      <div>{lead.campaign_label ?? lead.source_whatsapp_label ?? "-"}</div>
                      <div className="text-xs text-gray-500">
                        {lead.campaign_platform ?? lead.source_whatsapp_display_number ?? ""}
                      </div>
                    </Td>
                    <Td>{formatCrmDate(lead.next_followup_at)}</Td>
                    <Td>
                      <div>{lead.latest_activity_label ?? "-"}</div>
                      <div className="text-xs text-gray-500">
                        {formatCrmDateTime(lead.latest_activity_at)}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
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
