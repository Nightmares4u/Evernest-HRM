import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  ensureClientMilestonesSeeded,
  getCrmClientForVisaPage,
} from "@/lib/db/crm";
import {
  CRM_COUNTRY_MILESTONES,
  CRM_DOC_CODE_LABELS,
  type CrmClientDocState,
  type CrmClientMilestoneStatus,
  type CrmClientStatus,
  type CrmClientCountryMilestoneVM,
  type CrmClientDocumentVM,
} from "@/lib/types/crm";
import {
  rollbackClientStatus,
  setMilestoneStatus,
  transitionClientToVisaPrep,
  transitionClientToVisaSubmitted,
} from "../../visa/actions";

type Search = { error?: string; ok?: string };

const CLIENT_STATUS_TONES: Record<
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

const MILESTONE_STATUS_TONES: Record<
  CrmClientMilestoneStatus,
  "green" | "amber" | "red" | "blue" | "gray" | "indigo" | "yellow" | "teal"
> = {
  not_started: "gray",
  in_progress: "yellow",
  done: "green",
  not_applicable: "blue",
};

const DOC_STATE_TONES: Record<
  CrmClientDocState,
  "green" | "amber" | "red" | "blue" | "gray" | "indigo" | "yellow" | "teal"
> = {
  uploaded: "blue",
  under_review: "yellow",
  approved: "green",
  rejected_resubmit: "red",
  expired: "gray",
};

export default async function ClientVisaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.appUser.is_active) redirect("/dashboard?error=Active%20user%20required");

  await ensureClientMilestonesSeeded(id);
  const data = await getCrmClientForVisaPage(id);
  if (!data) notFound();

  const requiredMilestones = data.milestones.filter((milestone) => milestone.definition?.required);
  const optionalMilestones = data.milestones.filter((milestone) => !milestone.definition?.required);
  const stats = milestoneStats(data.milestones);
  const countryDefinitions = data.country ? CRM_COUNTRY_MILESTONES[data.country] : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/crm/clients" className="text-indigo-600 hover:text-indigo-500">
              CRM clients
            </Link>
            <span className="text-gray-400">/</span>
            <Link
              href={`/crm/clients/${data.client.id}`}
              className="text-indigo-600 hover:text-indigo-500"
            >
              {data.client.client_code}
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">Visa stage</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Visa stage</h1>
          <p className="text-sm text-gray-500">
            {data.client.lead_customer_name || data.client.lead_customer_phone}
            {data.client.target_country && <> · {data.client.target_country}</>}
          </p>
        </div>
        <Chip label={formatLabel(data.client.status)} tone={CLIENT_STATUS_TONES[data.client.status]} />
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      {!data.country && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          We don't have a milestone checklist for this client's target country yet. You can still
          upload visa-stage documents and submit the visa file when ready.
        </section>
      )}

      {data.country && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Done" value={stats.done} />
            <Stat label="In progress" value={stats.in_progress} />
            <Stat label="Not started" value={stats.not_started} />
            <Stat label="Not applicable" value={stats.not_applicable} />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Required milestones</h2>
                <p className="text-sm text-gray-500">
                  {formatLabel(data.country)} checklist · {countryDefinitions.length} registry items.
                </p>
              </div>
              {data.isBlockedFromVisaSubmitted.blocked ? (
                <Chip label={`${data.isBlockedFromVisaSubmitted.missing.length} blocking`} tone="red" />
              ) : (
                <Chip label="Gate clear" tone="green" />
              )}
            </div>
            {requiredMilestones.length === 0 ? (
              <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                No required milestones are configured for this country.
              </p>
            ) : (
              <div className="space-y-3">
                {requiredMilestones.map((milestone) => (
                  <MilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    canManage={data.canManage}
                  />
                ))}
              </div>
            )}
          </section>

          {optionalMilestones.length > 0 && (
            <details className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
              <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                Optional / non-blocking milestones
              </summary>
              <div className="mt-4 space-y-3">
                {optionalMilestones.map((milestone) => (
                  <MilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    canManage={data.canManage}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <VisaDocsCard clientId={data.client.id} docs={data.visaDocs} />
      <TransitionCard
        clientId={data.client.id}
        clientStatus={data.client.status}
        canTransitionStatus={data.canTransitionStatus}
        isSuperAdmin={me.appUser.role === "super_admin"}
        blocked={data.isBlockedFromVisaSubmitted.blocked}
        missing={data.isBlockedFromVisaSubmitted.missing}
      />
    </div>
  );
}

function MilestoneRow({
  milestone,
  canManage,
}: {
  milestone: CrmClientCountryMilestoneVM;
  canManage: boolean;
}) {
  const definition = milestone.definition;
  return (
    <article className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">
              {definition?.label ?? milestone.milestone_code}
            </h3>
            <Chip
              label={formatLabel(milestone.status)}
              tone={MILESTONE_STATUS_TONES[milestone.status]}
            />
          </div>
          {definition?.description && (
            <p className="mt-1 text-sm text-gray-500">{definition.description}</p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Due {formatDateInputDisplay(milestone.due_at)} · Completed by{" "}
            {milestone.completed_by_name ?? "-"} on {formatCrmDateTime(milestone.completed_at)}
          </p>
          {milestone.notes && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-gray-600">
                Show milestone notes
              </summary>
              <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {milestone.notes}
              </p>
            </details>
          )}
        </div>
      </div>

      {canManage && (
        <form action={setMilestoneStatus} className="mt-4 grid gap-3 md:grid-cols-[14rem_12rem_1fr_auto]">
          <input type="hidden" name="client_id" value={milestone.client_id} />
          <input type="hidden" name="milestone_id" value={milestone.id} />
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              name="to_status"
              defaultValue={milestone.status}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
            >
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="not_applicable">Not applicable</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Due date</span>
            <input
              name="due_at"
              type="date"
              defaultValue={dateInputValue(milestone.due_at)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Note</span>
            <input
              name="note"
              defaultValue={milestone.notes ?? ""}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <div className="flex items-end">
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              Save
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function VisaDocsCard({
  clientId,
  docs,
}: {
  clientId: string;
  docs: CrmClientDocumentVM[];
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Visa-stage documents</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload and review these in the existing documents workspace.
          </p>
        </div>
        <Link
          href={`/crm/clients/${clientId}/documents`}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
        >
          Manage documents
        </Link>
      </div>
      {docs.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
          No current visa-stage documents uploaded yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {docs.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <div className="font-medium text-gray-900">{doc.file_name}</div>
                <div className="text-xs text-gray-500">
                  {CRM_DOC_CODE_LABELS[doc.doc_code as keyof typeof CRM_DOC_CODE_LABELS] ?? doc.doc_code}
                </div>
              </div>
              <Chip label={formatLabel(doc.doc_state)} tone={DOC_STATE_TONES[doc.doc_state]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TransitionCard({
  clientId,
  clientStatus,
  canTransitionStatus,
  isSuperAdmin,
  blocked,
  missing,
}: {
  clientId: string;
  clientStatus: CrmClientStatus;
  canTransitionStatus: boolean;
  isSuperAdmin: boolean;
  blocked: boolean;
  missing: string[];
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Visa status transition</h2>
      <div className="mt-4 space-y-4">
        {canTransitionStatus && clientStatus === "offer_accepted" && (
          <form action={transitionClientToVisaPrep} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="client_id" value={clientId} />
            <label className="min-w-64 flex-1 space-y-1 text-xs font-medium text-gray-600">
              <span>Note</span>
              <input
                name="note"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <button className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500">
              Move to visa prep
            </button>
          </form>
        )}

        {canTransitionStatus && clientStatus === "visa_prep" && (
          <form action={transitionClientToVisaSubmitted} className="space-y-3">
            <input type="hidden" name="client_id" value={clientId} />
            {blocked && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Required milestones remaining: {missing.join(", ")}
              </div>
            )}
            <label className="block space-y-1 text-xs font-medium text-gray-600">
              <span>Note</span>
              <input
                name="note"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <button
              disabled={blocked}
              className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              Submit visa file
            </button>
          </form>
        )}

        {isSuperAdmin && (clientStatus === "visa_prep" || clientStatus === "visa_submitted") && (
          <form action={rollbackClientStatus} className="space-y-3 border-t border-gray-100 pt-4">
            <input type="hidden" name="client_id" value={clientId} />
            <input
              type="hidden"
              name="to_status"
              value={clientStatus === "visa_prep" ? "offer_accepted" : "visa_prep"}
            />
            <label className="block space-y-1 text-xs font-medium text-gray-600">
              <span>
                Roll back to {clientStatus === "visa_prep" ? "offer accepted" : "visa prep"} reason
              </span>
              <textarea
                name="reason"
                required
                rows={3}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
              Roll back status
            </button>
          </form>
        )}

        {!canTransitionStatus && (
          <p className="text-sm text-gray-500">
            Only the assigned counselor or super admin can move visa status forward.
          </p>
        )}
      </div>
    </section>
  );
}

function milestoneStats(milestones: CrmClientCountryMilestoneVM[]) {
  return {
    done: milestones.filter((milestone) => milestone.status === "done").length,
    in_progress: milestones.filter((milestone) => milestone.status === "in_progress").length,
    not_started: milestones.filter((milestone) => milestone.status === "not_started").length,
    not_applicable: milestones.filter((milestone) => milestone.status === "not_applicable").length,
  };
}

function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function formatDateInputDisplay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "-";
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
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
