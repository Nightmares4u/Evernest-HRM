import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import {
  addCrmLeadNote,
  completeCrmLeadFollowup,
  scheduleCrmLeadFollowup,
  updateCrmLeadStatus,
} from "@/app/(dashboard)/crm/leads/actions";
import { convertLeadToClient } from "@/app/(dashboard)/crm/clients/actions";
import {
  assignCrmLead,
  autoAssignCrmLead,
} from "@/app/(dashboard)/admin/crm/actions";
import { requestLeadTransfer } from "@/app/(dashboard)/crm/transfers/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDate, formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientForLead,
  getCrmLeadDetail,
  getPendingCrmTransferForLead,
  listCrmAssignableEmployees,
  listCrmLeadTransfersForLead,
  type CrmLeadTransferVM,
} from "@/lib/db/crm";
import type { CrmLeadStatus, CrmTransferStatus } from "@/lib/types/crm";

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

const TRANSFER_STATUS_TONES: Record<
  CrmTransferStatus,
  "green" | "amber" | "red" | "gray" | "indigo"
> = {
  pending: "amber",
  accepted: "green",
  rejected: "red",
  cancelled: "gray",
  admin_override: "indigo",
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

  const [lead, pendingTransfer, transferHistory, employees, existingClient] = await Promise.all([
    getCrmLeadDetail(id),
    getPendingCrmTransferForLead(id),
    listCrmLeadTransfersForLead(id),
    listCrmAssignableEmployees(),
    getCrmClientForLead(id),
  ]);
  if (!lead) notFound();

  const canAssign = me.appUser.role === "super_admin";
  const canWorkLead =
    canAssign || Boolean(me.employee?.id && me.employee.id === lead.assigned_agent_id);
  const canRequestTransfer = canWorkLead;
  const transferTargetEmployees = employees.filter(
    (employee) => employee.id !== lead.assigned_agent_id
  );

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
                  Auto-assign lead
                </button>
                <p className="mt-1 text-[11px] text-gray-500">
                  Tries WhatsApp number owner first, then fallback rules.
                </p>
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

      <LeadWorkbench
        leadId={lead.id}
        canWorkLead={canWorkLead}
        currentStatus={lead.status}
        nextFollowupAt={lead.next_followup_at}
      />

      {existingClient ? (
        <ClientCreatedBanner
          clientId={existingClient.id}
          clientCode={existingClient.client_code}
        />
      ) : lead.status === "converted" ? (
        <ConvertLeadPanel lead={lead} canWorkLead={canWorkLead} />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Assignment history</h2>
          {lead.assignments.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No assignment history yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lead.assignments.map((assignment) => (
                <li key={assignment.id} className="rounded-md border border-gray-100 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-gray-900">
                      {assignment.to_employee_name ?? "Unassigned"}
                    </div>
                    <Chip
                      label={assignmentMethodLabel(assignment.method, assignment.reason)}
                      tone={assignmentMethodTone(assignment.method, assignment.reason)}
                    />
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
        <TransferLeadPanel
          leadId={lead.id}
          canRequestTransfer={canRequestTransfer}
          pendingTransfer={pendingTransfer}
          employees={transferTargetEmployees}
        />
        <TransferHistory transfers={transferHistory} />
      </section>
    </div>
  );
}

async function requestTransferForm(formData: FormData) {
  "use server";
  const leadId = String(formData.get("lead_id") ?? "");
  const result = await requestLeadTransfer(
    leadId,
    String(formData.get("to_employee_id") ?? ""),
    String(formData.get("reason") ?? "")
  );
  const key = result.ok ? "ok" : "error";
  redirect(`/crm/leads/${leadId}?${key}=${encodeURIComponent(result.message)}`);
}

async function addNoteForm(formData: FormData) {
  "use server";
  const leadId = String(formData.get("lead_id") ?? "");
  const result = await addCrmLeadNote(leadId, String(formData.get("note") ?? ""));
  redirectLeadActionResult(result, leadId);
}

async function updateStatusForm(formData: FormData) {
  "use server";
  const leadId = String(formData.get("lead_id") ?? "");
  const result = await updateCrmLeadStatus(
    leadId,
    String(formData.get("status") ?? ""),
    String(formData.get("note") ?? "")
  );
  redirectLeadActionResult(result, leadId);
}

async function scheduleFollowupForm(formData: FormData) {
  "use server";
  const leadId = String(formData.get("lead_id") ?? "");
  const result = await scheduleCrmLeadFollowup(
    leadId,
    String(formData.get("next_followup_at") ?? ""),
    String(formData.get("note") ?? "")
  );
  redirectLeadActionResult(result, leadId);
}

async function completeFollowupForm(formData: FormData) {
  "use server";
  const leadId = String(formData.get("lead_id") ?? "");
  const result = await completeCrmLeadFollowup(
    leadId,
    String(formData.get("note") ?? "")
  );
  redirectLeadActionResult(result, leadId);
}

function redirectLeadActionResult(
  result: { ok: boolean; message: string; leadId?: string },
  fallbackLeadId: string
): never {
  const leadId = result.leadId || fallbackLeadId;
  const key = result.ok ? "ok" : "error";
  redirect(`/crm/leads/${leadId || ""}?${key}=${encodeURIComponent(result.message)}`);
}

function isFallbackOwnerAssignment(reason: string | null): boolean {
  return Boolean(reason && /WhatsApp number fallback/i.test(reason));
}

function assignmentMethodLabel(
  method: string | null,
  reason: string | null = null
): string {
  switch (method) {
    case "auto_source_owner":
      return isFallbackOwnerAssignment(reason)
        ? "Fallback counselor"
        : "WhatsApp number owner";
    case "auto_rule":
      return "Fallback rule";
    case "manual":
      return "Manual";
    case "manager_override":
      return "Manager override";
    case "review_queue":
      return "Review queue";
    default:
      return "Unknown";
  }
}

function assignmentMethodTone(
  method: string | null,
  reason: string | null = null
): "indigo" | "blue" | "amber" | "gray" | "teal" {
  switch (method) {
    case "auto_source_owner":
      return isFallbackOwnerAssignment(reason) ? "teal" : "indigo";
    case "auto_rule":
      return "amber";
    case "manual":
    case "manager_override":
      return "blue";
    default:
      return "gray";
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function LeadWorkbench({
  leadId,
  canWorkLead,
  currentStatus,
  nextFollowupAt,
}: {
  leadId: string;
  canWorkLead: boolean;
  currentStatus: CrmLeadStatus;
  nextFollowupAt: string | null;
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Lead workbench</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add internal context, update the lead stage, and schedule the next counselor follow-up.
          </p>
        </div>
        <Chip label={formatStatusLabel(currentStatus)} tone={STATUS_TONES[currentStatus] ?? "gray"} />
      </div>

      {!canWorkLead ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
          Only the assigned counselor or super admin can work this lead.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <form action={addNoteForm} className="rounded-md border border-gray-100 p-4">
            <input type="hidden" name="lead_id" value={leadId} />
            <h3 className="text-sm font-semibold text-gray-900">Internal note</h3>
            <p className="mt-1 text-xs text-gray-500">
              Internal note for counselors/admins. Not sent to client.
            </p>
            <label className="mt-3 block space-y-1 text-xs font-medium text-gray-600">
              <span>Note</span>
              <textarea
                name="note"
                required
                rows={5}
                className={INPUT}
                placeholder="Add counselor context, call summary, or client preference."
              />
            </label>
            <button
              type="submit"
              className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Add note
            </button>
          </form>

          <form action={updateStatusForm} className="rounded-md border border-gray-100 p-4">
            <input type="hidden" name="lead_id" value={leadId} />
            <h3 className="text-sm font-semibold text-gray-900">Status update</h3>
            <p className="mt-1 text-xs text-gray-500">
              Current status: {formatStatusLabel(currentStatus)}
            </p>
            <label className="mt-3 block space-y-1 text-xs font-medium text-gray-600">
              <span>Status</span>
              <select name="status" defaultValue={currentStatus} className={INPUT}>
                {CRM_LEAD_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block space-y-1 text-xs font-medium text-gray-600">
              <span>Note optional</span>
              <textarea
                name="note"
                rows={3}
                className={INPUT}
                placeholder="Why is the status changing?"
              />
            </label>
            <button
              type="submit"
              className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Update status
            </button>
          </form>

          <div className="rounded-md border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Follow-up</h3>
            <p className="mt-1 text-xs text-gray-500">
              Schedule the next contact. Scheduling moves active leads into follow-up status.
            </p>
            {nextFollowupAt && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Current scheduled follow-up: {formatCrmDateTime(nextFollowupAt)}
              </div>
            )}
            <form action={scheduleFollowupForm} className="mt-3 space-y-3">
              <input type="hidden" name="lead_id" value={leadId} />
              <label className="block space-y-1 text-xs font-medium text-gray-600">
                <span>Next follow-up date/time</span>
                <input
                  type="datetime-local"
                  name="next_followup_at"
                  required
                  defaultValue={formatDateTimeInput(nextFollowupAt)}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-gray-600">
                <span>Note optional</span>
                <textarea
                  name="note"
                  rows={2}
                  className={INPUT}
                  placeholder="What should happen on this follow-up?"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Schedule follow-up
              </button>
            </form>
            {nextFollowupAt && (
              <form action={completeFollowupForm} className="mt-4 border-t border-gray-100 pt-4">
                <input type="hidden" name="lead_id" value={leadId} />
                <label className="block space-y-1 text-xs font-medium text-gray-600">
                  <span>Completion note optional</span>
                  <textarea
                    name="note"
                    rows={2}
                    className={INPUT}
                    placeholder="What happened during the follow-up?"
                  />
                </label>
                <button
                  type="submit"
                  className="mt-3 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Mark follow-up complete
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ClientCreatedBanner({
  clientId,
  clientCode,
}: {
  clientId: string;
  clientCode: string;
}) {
  return (
    <section className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-semibold">Client created:</span> {clientCode}
        </div>
        <Link href={`/crm/clients/${clientId}`} className="font-medium text-green-900 hover:text-green-700">
          View client
        </Link>
      </div>
    </section>
  );
}

function ConvertLeadPanel({
  lead,
  canWorkLead,
}: {
  lead: {
    id: string;
    customer_name: string | null;
    customer_phone: string;
    interested_country: string | null;
  };
  canWorkLead: boolean;
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Convert to client</h2>
          <p className="mt-1 text-sm text-gray-500">
            Create the Stage 2A client shell after agreement signing and advance payment.
          </p>
        </div>
        <Chip label="student" tone="indigo" />
      </div>

      {!canWorkLead ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
          Only the assigned counselor or super admin can convert this lead.
        </p>
      ) : (
        <form action={convertLeadToClient} className="mt-5 grid gap-4 lg:grid-cols-3">
          <input type="hidden" name="lead_id" value={lead.id} />
          <input type="hidden" name="client_type" value="student" />
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Target country</span>
            <input
              name="target_country"
              defaultValue={lead.interested_country ?? ""}
              className={INPUT}
              placeholder="Italy"
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Target level</span>
            <select name="target_level" defaultValue="" className={INPUT}>
              <option value="">Choose level</option>
              <option value="bachelors">Bachelors</option>
              <option value="masters">Masters</option>
              <option value="phd">PhD</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Currency</span>
            <input name="currency" defaultValue="PKR" className={INPUT} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Agreement signed at</span>
            <input type="datetime-local" name="agreement_signed_at" required className={INPUT} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Advance paid at</span>
            <input type="datetime-local" name="advance_paid_at" required className={INPUT} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Advance amount</span>
            <input
              type="number"
              min="1"
              step="0.01"
              name="advance_amount"
              required
              className={INPUT}
              placeholder="50000"
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Total fee optional</span>
            <input
              type="number"
              min="0"
              step="0.01"
              name="total_fee"
              className={INPUT}
              placeholder="250000"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Create client shell
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pakistanOffsetMs = 5 * 60 * 60 * 1000;
  return new Date(date.getTime() + pakistanOffsetMs).toISOString().slice(0, 16);
}

function TransferLeadPanel({
  leadId,
  canRequestTransfer,
  pendingTransfer,
  employees,
}: {
  leadId: string;
  canRequestTransfer: boolean;
  pendingTransfer: CrmLeadTransferVM | null;
  employees: Array<{ id: string; full_name: string; branch_code: string | null }>;
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Transfer lead</h2>
          <p className="mt-1 text-sm text-gray-500">
            Use this when the lead belongs to another counselor or product queue. The receiving counselor must accept before ownership changes.
          </p>
        </div>
        <Link
          href="/crm/transfers"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View transfer inbox
        </Link>
      </div>

      {!canRequestTransfer ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
          Only the assigned counselor or super admin can request a transfer.
        </p>
      ) : pendingTransfer ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A transfer request is already pending for this lead.
        </div>
      ) : (
        <form action={requestTransferForm} className="mt-4 space-y-3">
          <input type="hidden" name="lead_id" value={leadId} />
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Target counselor</span>
            <select name="to_employee_id" required defaultValue="" className={INPUT}>
              <option value="" disabled>
                Choose counselor
              </option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.branch_code ?? "no branch"})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600">
            <span>Transfer reason</span>
            <textarea
              name="reason"
              required
              rows={3}
              className={INPUT}
              placeholder="Why should this lead move to another counselor?"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Request transfer
          </button>
        </form>
      )}
    </div>
  );
}

function TransferHistory({ transfers }: { transfers: CrmLeadTransferVM[] }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Transfer history</h2>
      {transfers.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No transfer history yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {transfers.map((transfer) => (
            <li key={transfer.id} className="rounded-md border border-gray-100 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-gray-900">
                  {employeeLabel(transfer.from_employee_name, transfer.from_employee_branch_code)} to{" "}
                  {employeeLabel(transfer.to_employee_name, transfer.to_employee_branch_code)}
                </div>
                <Chip
                  label={transfer.status}
                  tone={TRANSFER_STATUS_TONES[transfer.status]}
                />
              </div>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <Info label="Requested by" value={transfer.requested_by_name ?? "-"} />
                <Info label="Requested" value={formatCrmDateTime(transfer.requested_at)} />
                <Info label="Reason" value={transfer.reason} />
                <Info label="Decision note" value={transfer.decision_note ?? "-"} />
                {transfer.decided_at && (
                  <Info label="Decided" value={formatCrmDateTime(transfer.decided_at)} />
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function employeeLabel(name: string | null, branchCode: string | null): string {
  if (!name) return "Unassigned";
  return branchCode ? `${name} (${branchCode})` : name;
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
