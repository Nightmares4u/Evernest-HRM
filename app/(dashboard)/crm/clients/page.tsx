import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  listCrmAssignableEmployees,
  listCrmClients,
} from "@/lib/db/crm";
import type { CrmClientStatus } from "@/lib/types/crm";

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
  "green" | "amber" | "red" | "blue" | "gray" | "indigo" | "yellow" | "teal"
> = {
  onboarding: "indigo",
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">CRM clients</h1>
          <p className="text-sm text-gray-500">
            Converted clients in the Stage 2A onboarding shell.
          </p>
        </div>
        <Link
          href="/crm/leads"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          CRM leads
        </Link>
      </header>

      <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
        <form className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="w-52 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
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

          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Filter
          </button>
          <Link
            href="/crm/clients"
            className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            Reset
          </Link>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Latest clients</h2>
          <span className="text-xs text-gray-500">{clients.length} shown</span>
        </div>
        {clients.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No clients visible for your role yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th>Target</Th>
                  <Th>Assigned</Th>
                  <Th>Branch</Th>
                  <Th>Advance</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/crm/clients/${client.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        {client.client_code}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {client.lead_customer_name || client.lead_customer_phone}
                      </div>
                    </Td>
                    <Td>
                      <Chip label={formatLabel(client.status)} tone={STATUS_TONES[client.status]} />
                    </Td>
                    <Td>
                      <div>{client.target_country ?? "-"}</div>
                      <div className="text-xs text-gray-500">{client.target_level ?? "-"}</div>
                    </Td>
                    <Td>{client.assigned_agent_name ?? "Unassigned"}</Td>
                    <Td>
                      {client.branch_code ? `${client.branch_code} - ${client.branch_name}` : "-"}
                    </Td>
                    <Td>{formatMoney(client.advance_amount, client.currency)}</Td>
                    <Td>{formatCrmDateTime(client.created_at)}</Td>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
