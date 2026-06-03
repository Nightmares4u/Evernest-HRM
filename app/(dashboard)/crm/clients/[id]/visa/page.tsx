import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  ensureClientMilestonesSeeded,
  getCrmClientForVisaPage,
  listCrmClientApplications,
  listCrmClientDocuments,
  listCrmClientVisaDecisions,
} from "@/lib/db/crm";
import {
  CRM_CLIENT_VISA_DECISION_LABELS,
  CRM_COUNTRY_MILESTONES,
  CRM_DOC_CODE_LABELS,
  type CrmClientVisaDecision,
  type CrmClientVisaDecisionOutcome,
  type CrmClientDocState,
  type CrmClientMilestoneStatus,
  type CrmClientStatus,
  type CrmClientCountryMilestoneVM,
  type CrmClientDocumentVM,
} from "@/lib/types/crm";
import {
  moveToPreDepartureAction,
  recordVisaDecisionAction,
  rollbackToVisaPrepAction,
} from "../../closure/actions";
import {
  rollbackClientStatus,
  setMilestoneStatus,
  transitionClientToVisaPrep,
  transitionClientToVisaSubmitted,
} from "../../visa/actions";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LifecycleTabs } from "@/components/ui/LifecycleTabs";

type Search = { error?: string; ok?: string };

const MILESTONE_STATUS_TONES: Record<
  CrmClientMilestoneStatus,
  "green" | "amber" | "red" | "blue" | "gray" | "blue" | "yellow" | "teal"
> = {
  not_started: "gray",
  in_progress: "yellow",
  done: "green",
  not_applicable: "blue",
};

const DOC_STATE_TONES: Record<
  CrmClientDocState,
  "green" | "amber" | "red" | "blue" | "gray" | "blue" | "yellow" | "teal"
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
  const [data, visaDecisions, documents, applications] = await Promise.all([
    getCrmClientForVisaPage(id),
    listCrmClientVisaDecisions(id),
    listCrmClientDocuments(id),
    listCrmClientApplications(id),
  ]);
  if (!data) notFound();

  const client = data.client;
  const requiredMilestones = data.milestones.filter((milestone) => milestone.definition?.required);
  const optionalMilestones = data.milestones.filter((milestone) => !milestone.definition?.required);
  const stats = milestoneStats(data.milestones);
  const countryDefinitions = data.country ? CRM_COUNTRY_MILESTONES[data.country] : [];

  const docsAwaitingReview = documents.filter((document) =>
    document.doc_state === "uploaded" || document.doc_state === "under_review"
  ).length;
  const applicationsInFlight = applications.filter((application) =>
    application.status === "submitted" ||
    application.status === "under_review" ||
    application.status === "waitlisted"
  ).length;
  const showVisaBadge =
    Boolean(data?.country) &&
    (data.client.status === "offer_accepted" ||
      data.client.status === "visa_prep" ||
      data.client.status === "visa_submitted");
  const visaMilestonesRemaining = data?.isBlockedFromVisaSubmitted.missing.length ?? 0;
  const closureBadgeCount =
    data.client.status === "pre_departure" &&
    (!data.client.flight_date || !data.client.accommodation_details || !data.client.briefing_completed_at)
      ? 1
      : 0;

  const tabs = [
    { href: `/crm/clients/${data.client.id}/documents`, label: "Documents", badge: docsAwaitingReview, badgeTone: "yellow" as const },
    { href: `/crm/clients/${data.client.id}/applications`, label: "Applications", badge: applicationsInFlight, badgeTone: "blue" as const },
    { href: `/crm/clients/${data.client.id}/visa`, label: "Visa Stage", badge: showVisaBadge ? visaMilestonesRemaining : 0, badgeTone: "red" as const },
    { href: `/crm/clients/${data.client.id}/financials`, label: "Financials" },
    { href: `/crm/clients/${data.client.id}/closure`, label: "Closure", badge: closureBadgeCount, badgeTone: "amber" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visa Stage"
        description={`${data.client.lead_customer_name || data.client.lead_customer_phone} ${data.client.target_country ? `· ${data.client.target_country}` : ""}`}
        breadcrumbs={
          <div className="flex items-center gap-2 mb-2 text-sm">
            <Link href="/crm/clients" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
              CRM clients
            </Link>
            <span className="text-gray-400">/</span>
            <Link
              href={`/crm/clients/${data.client.id}`}
              className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              {data.client.client_code}
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">Visa stage</span>
          </div>
        }
        action={
          <Link
            href={`/crm/clients/${data.client.id}`}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Back to client shell
          </Link>
        }
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <LifecycleTabs tabs={tabs} />

      {!data.country && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          We don't have a milestone checklist for this client's target country yet. You can still
          upload visa-stage documents and submit the visa file when ready.
        </div>
      )}

      {data.country && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Done" value={stats.done} tone="green" />
            <StatCard label="In progress" value={stats.in_progress} tone="amber" />
            <StatCard label="Not started" value={stats.not_started} tone="gray" />
            <StatCard label="Not applicable" value={stats.not_applicable} tone="blue" />
          </div>

          <SectionCard
            title="Required milestones"
            description={`${formatLabel(data.country)} checklist · ${countryDefinitions.length} registry items.`}
            action={
              data.isBlockedFromVisaSubmitted.blocked ? (
                <StatusBadge label={`${data.isBlockedFromVisaSubmitted.missing.length} blocking`} tone="red" />
              ) : (
                <StatusBadge label="Gate clear" tone="green" />
              )
            }
          >
            {requiredMilestones.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                No required milestones are configured for this country.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {requiredMilestones.map((milestone) => (
                  <MilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    canManage={data.canManage}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {optionalMilestones.length > 0 && (
            <details className="rounded-lg bg-white shadow-sm ring-1 ring-inset ring-gray-200 group">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-gray-900 list-none flex items-center justify-between">
                <span>Optional / non-blocking milestones</span>
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-5 pb-5 border-t border-gray-100">
                <div className="mt-4 space-y-4">
                  {optionalMilestones.map((milestone) => (
                    <MilestoneRow
                      key={milestone.id}
                      milestone={milestone}
                      canManage={data.canManage}
                    />
                  ))}
                </div>
              </div>
            </details>
          )}
        </>
      )}

      <VisaDocsCard clientId={data.client.id} docs={data.visaDocs} />
      <VisaDecisionCard
        clientId={data.client.id}
        clientStatus={data.client.status}
        decisions={visaDecisions}
        canTransitionStatus={data.canTransitionStatus}
      />
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
    <article className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-inset ring-gray-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-bold text-gray-900 truncate">
              {definition?.label ?? milestone.milestone_code}
            </h3>
            <StatusBadge
              label={formatLabel(milestone.status)}
              tone={MILESTONE_STATUS_TONES[milestone.status]}
            />
          </div>
          {definition?.description && (
            <p className="mt-2 text-sm text-gray-600">{definition.description}</p>
          )}
          <p className="mt-3 text-xs font-medium text-gray-500 bg-gray-50 inline-block px-2 py-1 rounded-md border border-gray-100">
            Due {formatDateInputDisplay(milestone.due_at)} · Completed by{" "}
            <span className="text-gray-900">{milestone.completed_by_name ?? "-"}</span> on {formatCrmDateTime(milestone.completed_at)}
          </p>
          {milestone.notes && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors">
                Show milestone notes
              </summary>
              <p className="mt-2 rounded-md bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700 italic">
                "{milestone.notes}"
              </p>
            </details>
          )}
        </div>
      </div>

      {canManage && (
        <form action={setMilestoneStatus} className="mt-5 grid gap-4 md:grid-cols-[14rem_12rem_1fr_auto] border-t border-gray-100 pt-5">
          <input type="hidden" name="client_id" value={milestone.client_id} />
          <input type="hidden" name="milestone_id" value={milestone.id} />
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Status</span>
            <select
              name="to_status"
              defaultValue={milestone.status}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
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
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Note</span>
            <input
              name="note"
              defaultValue={milestone.notes ?? ""}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </label>
          <div className="flex items-end">
            <button className="w-full md:w-auto rounded-md bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors">
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
    <SectionCard
      title="Visa-stage documents"
      description="Upload and review these in the existing documents workspace."
      action={
        <Link
          href={`/crm/clients/${clientId}/documents`}
          className="rounded-md bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
        >
          Manage documents
        </Link>
      }
    >
      {docs.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
          No current visa-stage documents uploaded yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {docs.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors">
              <div>
                <div className="font-semibold text-gray-900">{doc.file_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {CRM_DOC_CODE_LABELS[doc.doc_code as keyof typeof CRM_DOC_CODE_LABELS] ?? doc.doc_code}
                </div>
              </div>
              <StatusBadge label={formatLabel(doc.doc_state)} tone={DOC_STATE_TONES[doc.doc_state]} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function VisaDecisionCard({
  clientId,
  clientStatus,
  decisions,
  canTransitionStatus,
}: {
  clientId: string;
  clientStatus: CrmClientStatus;
  decisions: CrmClientVisaDecision[];
  canTransitionStatus: boolean;
}) {
  if (clientStatus !== "visa_submitted" && clientStatus !== "visa_decision") {
    return null;
  }

  const latestDecision = decisions[0] ?? null;
  return (
    <SectionCard
      title="Record visa decision"
      description="Capture embassy decisions and move the client into the next closure stage."
      action={
        latestDecision && (
          <StatusBadge
            label={CRM_CLIENT_VISA_DECISION_LABELS[latestDecision.outcome]}
            tone={visaDecisionTone(latestDecision.outcome)}
          />
        )
      }
    >
      {canTransitionStatus ? (
        <form action={recordVisaDecisionAction} className="mt-4 grid gap-4 md:grid-cols-[14rem_12rem_1fr_auto]">
          <input type="hidden" name="client_id" value={clientId} />
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Outcome</span>
            <select
              name="outcome"
              defaultValue="granted"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            >
              <option value="granted">Granted</option>
              <option value="refused">Refused</option>
              <option value="additional_info_requested">Additional info requested</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Decision date</span>
            <input
              name="decided_at"
              type="date"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Note</span>
            <input
              name="note"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
            />
          </label>
          <div className="flex items-end">
            <button className="w-full md:w-auto rounded-md bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors">
              Record
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-center text-gray-500">
          Only the assigned counselor or super admin can record visa decisions.
        </p>
      )}

      {decisions.length > 0 && (
        <div className="mt-6 border border-gray-100 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Outcome</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Decided</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Note</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Recorded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {decisions.map((decision) => (
                <tr key={decision.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 align-top">
                    <StatusBadge
                      label={CRM_CLIENT_VISA_DECISION_LABELS[decision.outcome]}
                      tone={visaDecisionTone(decision.outcome)}
                    />
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">{formatCrmDateTime(decision.decided_at)}</td>
                  <td className="px-4 py-3 align-top">{decision.note ?? "-"}</td>
                  <td className="px-4 py-3 align-top">{decision.recorded_by_user_id ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canTransitionStatus && clientStatus === "visa_decision" && latestDecision && (
        <div className="mt-6 border-t border-gray-100 pt-5">
          {latestDecision.outcome === "granted" ? (
            <form action={moveToPreDepartureAction} className="flex flex-wrap items-end gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
              <input type="hidden" name="client_id" value={clientId} />
              <label className="flex-1 min-w-[200px] space-y-1 text-xs font-medium text-gray-600">
                <span>Note</span>
                <input
                  name="note"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
                />
              </label>
              <button className="rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500 transition-colors">
                Move to pre-departure
              </button>
            </form>
          ) : (
            <form action={rollbackToVisaPrepAction} className="flex flex-wrap items-end gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
              <input type="hidden" name="client_id" value={clientId} />
              <label className="flex-1 min-w-[200px] space-y-1 text-xs font-medium text-gray-600">
                <span>Re-application note</span>
                <input
                  name="note"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
                />
              </label>
              <button className="rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-colors">
                Roll back to visa prep
              </button>
            </form>
          )}
        </div>
      )}
    </SectionCard>
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
    <SectionCard title="Visa status transition">
      <div className="mt-4 space-y-5">
        {canTransitionStatus && clientStatus === "offer_accepted" && (
          <form action={transitionClientToVisaPrep} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="client_id" value={clientId} />
            <label className="flex-1 min-w-[200px] space-y-1 text-xs font-medium text-gray-600">
              <span>Note</span>
              <input
                name="note"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
              />
            </label>
            <button className="rounded-md bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500 transition-colors">
              Move to visa prep
            </button>
          </form>
        )}

        {canTransitionStatus && clientStatus === "visa_prep" && (
          <form action={transitionClientToVisaSubmitted} className="space-y-4 bg-gray-50/50 p-4 rounded-lg border border-gray-100">
            <input type="hidden" name="client_id" value={clientId} />
            {blocked && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm flex items-center justify-between">
                <span className="font-medium">Required milestones remaining:</span>
                <span className="font-semibold">{missing.join(", ")}</span>
              </div>
            )}
            <label className="block space-y-1 text-xs font-medium text-gray-600">
              <span>Note</span>
              <input
                name="note"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
              />
            </label>
            <button
              disabled={blocked}
              className="rounded-md bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-gray-300 transition-colors"
            >
              Submit visa file
            </button>
          </form>
        )}

        {isSuperAdmin && (clientStatus === "visa_prep" || clientStatus === "visa_submitted") && (
          <form action={rollbackClientStatus} className="space-y-4 border-t border-gray-100 pt-5">
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
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:ring-red-500 outline-none"
              />
            </label>
            <button className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors">
              Roll back status
            </button>
          </form>
        )}

        {!canTransitionStatus && (
          <p className="text-sm text-gray-500 text-center py-2 bg-gray-50 rounded-md border border-dashed border-gray-200">
            Only the assigned counselor or super admin can move visa status forward.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function visaDecisionTone(
  outcome: CrmClientVisaDecisionOutcome
): "green" | "amber" | "red" | "blue" | "gray" | "blue" | "yellow" | "teal" {
  if (outcome === "granted") return "green";
  if (outcome === "refused") return "red";
  return "amber";
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
  return <div className={`rounded-md border px-4 py-3 text-sm shadow-sm ${classes}`}>{children}</div>;
}
