import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDate, formatCrmDateTime } from "@/lib/crm/format";
import { listCrmLeads } from "@/lib/db/crm";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { DataTable, Td } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { UsersRound } from "lucide-react";

type Search = { error?: string; ok?: string; assignment?: string; enrichment?: string };

const STATUS_TONES = {
  new: "blue",
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

  const leads = await listCrmLeads({
    assignment: sp.assignment,
    enrichment: sp.enrichment,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Leads"
        description="Qualified leads ready for assignment and follow-up."
        action={
          <Link
            href="/crm/inbox"
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Raw Inbox
          </Link>
        }
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <SectionCard>
        <form className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Assignment filter</span>
            <select
              name="assignment"
              defaultValue={sp.assignment ?? ""}
              className="w-52 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            >
              <option value="">All leads</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Enrichment</span>
            <select
              name="enrichment"
              defaultValue={sp.enrichment ?? ""}
              className="w-52 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            >
              <option value="">All</option>
              <option value="needs">Needs enrichment</option>
              <option value="complete">Enrichment complete</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
          >
            Apply filters
          </button>
          <Link
            href="/crm/leads"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Reset
          </Link>
        </form>
      </SectionCard>

      <SectionCard title="Latest Leads" description={`${leads.length} shown`}>
        {leads.length === 0 ? (
          <EmptyState
            title="No leads found"
            description="No CRM leads visible for your role or matching these filters."
            icon={<UsersRound className="h-10 w-10" />}
          />
        ) : (
          <div className="mt-4">
            <DataTable
              columns={[
                "Lead",
                "Country/Product",
                "City",
                "Status",
                "Assigned",
                "Branch",
                "Source/Campaign",
                "Next Follow-up",
                "Latest Activity",
              ]}
            >
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/crm/leads/${lead.id}`}
                      className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      {lead.customer_name || lead.customer_phone}
                    </Link>
                    {lead.customer_name && (
                      <div className="text-xs text-gray-500 mt-0.5">{lead.customer_phone}</div>
                    )}
                  </Td>
                  <Td>
                    <div className="font-medium text-gray-900">{lead.interested_country ?? "-"}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {lead.product_category ?? "-"}
                    </div>
                  </Td>
                  <Td>{lead.city ?? "-"}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge label={lead.status} tone={STATUS_TONES[lead.status] ?? "gray"} />
                      {lead.needs_enrichment && (
                        <StatusBadge label="needs enrichment" tone="amber" />
                      )}
                    </div>
                  </Td>
                  <Td>{lead.assigned_agent_name ?? "Unassigned"}</Td>
                  <Td>
                    {lead.branch_code ? `${lead.branch_code} - ${lead.branch_name}` : "-"}
                  </Td>
                  <Td>
                    <div className="font-medium text-gray-900">{lead.campaign_label ?? lead.source_whatsapp_label ?? "-"}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {lead.campaign_platform ?? lead.source_whatsapp_display_number ?? ""}
                    </div>
                  </Td>
                  <Td>{formatCrmDate(lead.next_followup_at)}</Td>
                  <Td>
                    <div className="font-medium text-gray-900">{lead.latest_activity_label ?? "-"}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatCrmDateTime(lead.latest_activity_at)}
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </SectionCard>
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
