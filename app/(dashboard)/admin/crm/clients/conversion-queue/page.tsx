import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import { listCrmLeadsAwaitingConversion } from "@/lib/db/crm";

export default async function CrmConversionQueuePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin%20access%20required");
  }

  const leads = await listCrmLeadsAwaitingConversion();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm" className="text-sm text-indigo-600 hover:text-indigo-500">
              CRM admin
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <span className="text-sm text-gray-500">Conversion queue</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Client conversion queue
          </h1>
          <p className="text-sm text-gray-500">
            Converted leads that do not have a client shell yet.
          </p>
        </div>
        <Link
          href="/crm/clients"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          CRM clients
        </Link>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Awaiting conversion</h2>
          <span className="text-xs text-gray-500">{leads.length} leads</span>
        </div>
        {leads.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No converted leads are waiting for client creation.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Lead</Th>
                  <Th>Assigned counselor</Th>
                  <Th>Converted marker</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr key={lead.lead_id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/crm/leads/${lead.lead_id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        {lead.customer_name || lead.customer_phone}
                      </Link>
                      {lead.customer_name && (
                        <div className="text-xs text-gray-500">{lead.customer_phone}</div>
                      )}
                    </Td>
                    <Td>{lead.assigned_agent_name ?? "Unassigned"}</Td>
                    <Td>{formatCrmDateTime(lead.converted_at)}</Td>
                    <Td>
                      <Link
                        href={`/crm/leads/${lead.lead_id}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        Open conversion panel
                      </Link>
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
