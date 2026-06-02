import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  listCrmAssignableEmployees,
  listCrmClients,
} from "@/lib/db/crm";
import type { CrmClientStatus } from "@/lib/types/crm";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { DataTable, Td } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { UsersRound } from "lucide-react";

type Search = {
  status?: string;
  agent?: string;
};

const CLIENT_STATUSES: CrmClientStatus[] = [
  "onboarding",
  "doc_review",
  "uni_selection",
  "applying",
  "offer_in_hand",
  "offer_accepted",
  "visa_prep",
  "visa_submitted",
  "visa_decision",
  "pre_departure",
  "departed",
  "alumni",
  "withdrawn_refunded",
];

const STATUS_TONES: Record<
  CrmClientStatus,
  "green" | "amber" | "red" | "blue" | "gray" | "blue" | "yellow" | "teal"
> = {
  onboarding: "blue",
  doc_review: "yellow",
  uni_selection: "blue",
  applying: "amber",
  offer_in_hand: "green",
  offer_accepted: "green",
  visa_prep: "teal",
  visa_submitted: "teal",
  visa_decision: "amber",
  pre_departure: "blue",
  departed: "green",
  alumni: "gray",
  withdrawn_refunded: "red",
};

export default async function CrmClientsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  const isSuperAdmin = me.appUser.role === "super_admin";
  const status = parseStatus(sp.status);
  const selectedAgentId = isSuperAdmin ? cleanParam(sp.agent) : null;
  const [clients, employees] = await Promise.all([
    listCrmClients({ status, scopeToEmployeeId: selectedAgentId }),
    isSuperAdmin ? listCrmAssignableEmployees() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Clients"
        description="Converted clients in the Stage 2 lifecycle."
        action={
          <Link
            href="/crm/leads"
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Switch to Leads
          </Link>
        }
      />

      <SectionCard>
        <form className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status filter</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="w-52 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            >
              <option value="">All statuses</option>
              {CLIENT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </label>

          {isSuperAdmin && (
            <label className="space-y-1 text-xs font-medium text-gray-600">
              <span>Counselor</span>
              <select
                name="agent"
                defaultValue={selectedAgentId ?? ""}
                className="w-56 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
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

          <button
            type="submit"
            className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
          >
            Apply filters
          </button>
          <Link
            href="/crm/clients"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Reset
          </Link>
        </form>
      </SectionCard>

      <SectionCard title="Latest Clients" description={`${clients.length} shown`}>
        {clients.length === 0 ? (
          <EmptyState
            title="No clients found"
            description="No clients visible for your role or matching these filters."
            icon={<UsersRound className="h-10 w-10" />}
          />
        ) : (
          <div className="mt-4">
            <DataTable
              columns={["Client", "Status", "Target", "Assigned", "Branch", "Advance", "Created"]}
            >
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/crm/clients/${client.id}`}
                      className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      {client.client_code}
                    </Link>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {client.lead_customer_name || client.lead_customer_phone}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge label={formatLabel(client.status)} tone={STATUS_TONES[client.status]} />
                  </Td>
                  <Td>
                    <div className="font-medium text-gray-900">{client.target_country ?? "-"}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{client.target_level ?? "-"}</div>
                  </Td>
                  <Td>{client.assigned_agent_name ?? "Unassigned"}</Td>
                  <Td>
                    {client.branch_code ? `${client.branch_code} - ${client.branch_name}` : "-"}
                  </Td>
                  <Td className="tabular-nums">{formatMoney(client.advance_amount, client.currency)}</Td>
                  <Td>{formatCrmDateTime(client.created_at)}</Td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function parseStatus(value: string | undefined): CrmClientStatus | null {
  return CLIENT_STATUSES.includes(value as CrmClientStatus)
    ? (value as CrmClientStatus)
    : null;
}

function cleanParam(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(amount: number | null, currency: string): string {
  if (amount == null) return "-";
  return `${currency} ${amount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}
