import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  assignCrmLead,
  autoAssignCrmLead,
} from "@/app/(dashboard)/admin/crm/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDate, formatCrmDateTime } from "@/lib/crm/format";
import { getCrmLeadDetail, listCrmAssignableEmployees } from "@/lib/db/crm";

type Search = { error?: string; ok?: string };

const INPUT =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900";

const STATUS_TONES = {
  new: "indigo",
  assigned: "blue",
  contacted: "amber",
  qualified: "green",
  follow_up: "yellow",
  lost: "red",
  converted: "green",
} as const;

export default async function CrmLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const [lead, employees] = await Promise.all([
    getCrmLeadDetail(id),
    me.appUser.role === "super_admin" ? listCrmAssignableEmployees() : Promise.resolve([]),
  ]);
  if (!lead) notFound();

  const canAssign = me.appUser.role === "super_admin";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/crm/leads" className="text-sm text-indigo-600 hover:text-indigo-500">
              CRM leads
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <span className="text-sm text-gray-500">{lead.customer_phone}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            {lead.customer_name || lead.customer_phone}
          </h1>
          <p className="text-sm text-gray-500">
            Lead profile, assignment, source, and Stage 1 activity timeline.
          </p>
        </div>
        <Chip label={lead.status} tone={STATUS_TONES[lead.status] ?? "gray"} />
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900">Lead profile</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Phone" value={lead.customer_phone} />
            <Info label="Name" value={lead.customer_name ?? "-"} />
            <Info label="Country" value={lead.interested_country ?? "-"} />
            <Info label="City" value={lead.city ?? "-"} />
            <Info label="Product" value={lead.product_category ?? "-"} />
            <Info label="Next follow-up" value={formatCrmDate(lead.next_followup_at)} />
          </dl>
        </div>

        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Assignment</h2>
          <div className="mt-4 space-y-2 text-sm">
            <Info label="Assigned employee" value={lead.assigned_agent_name ?? "Unassigned"} />
            <Info
              label="Branch"
              value={lead.branch_code ? `${lead.branch_code} - ${lead.branch_name}` : "-"}
            />
          </div>
          {canAssign && (
            <div className="mt-5 space-y-4">
              <form action={autoAssignCrmLead}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <button
                  type="submit"
                  className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Auto-assign by rules
                </button>
              </form>
              <form action={assignCrmLead} className="space-y-3 border-t border-gray-100 pt-4">
                <input type="hidden" name="lead_id" value={lead.id} />
                <label className="block space-y-1 text-xs font-medium text-gray-600">
                  <span>Assign to employee</span>
                  <select name="employee_id" defaultValue={lead.assigned_agent_id ?? ""} className={INPUT}>
                    <option value="">Choose employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name} ({employee.branch_code ?? "no branch"})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs font-medium text-gray-600">
                  <span>Reason optional</span>
                  <input name="reason" className={INPUT} placeholder="Manual assignment" />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Assign lead
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Extracted details</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Last qualification" value={lead.last_qualification ?? "-"} />
            <Info label="Marks/CGPA" value={lead.marks_cgpa ?? "-"} />
            <Info label="Study gap" value={lead.study_gap ?? "-"} />
            <Info label="Budget range" value={lead.budget_range ?? "-"} />
            <Info label="English test" value={lead.english_test_status ?? "-"} />
            <Info
              label="Quality score"
              value={lead.quality_score == null ? "-" : lead.quality_score.toFixed(2)}
            />
          </dl>
        </div>

        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Source information</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info
              label="WhatsApp number"
              value={
                lead.source_whatsapp_label
                  ? `${lead.source_whatsapp_label} (${lead.source_whatsapp_display_number})`
                  : "-"
              }
            />
            <Info
              label="Campaign/source"
              value={
                lead.campaign_label
                  ? `${lead.campaign_label} (${lead.campaign_platform})`
                  : "-"
              }
            />
            <Info label="Created" value={formatCrmDateTime(lead.created_at)} />
            <Info label="Updated" value={formatCrmDateTime(lead.updated_at)} />
          </dl>
          {lead.raw_inbox && (
            <Link
              href={`/crm/inbox/${lead.raw_inbox.id}`}
              className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Open raw intake
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Assignment history</h2>
          {lead.assignments.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No assignment history yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lead.assignments.map((assignment) => (
                <li key={assignment.id} className="rounded-md border border-gray-100 p-3 text-sm">
                  <div className="font-medium text-gray-900">
                    {assignment.to_employee_name ?? "Unassigned"}
                  </div>
                  <div className="text-gray-500">{assignment.reason ?? assignment.status}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    {formatCrmDateTime(assignment.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Timeline title="Activity timeline" items={lead.activities} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Placeholder title="Notes" text="Notes UI is a placeholder for a later Stage 1 pass." />
        <Placeholder title="Follow-up" text="Follow-up scheduling is reserved for a later Stage 1 pass." />
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

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-500">{text}</p>
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
