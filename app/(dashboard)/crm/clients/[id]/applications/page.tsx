import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditClientApplication } from "@/lib/crm/permissions-clients";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientDetail,
  getCrmClientForVisaPage,
  listClientDocumentsForApplicationPicker,
  listCrmClientApplications,
  listCrmClientDocuments,
} from "@/lib/db/crm";
import {
  CRM_APPLICATION_STATUS_GROUPS,
  CRM_APPLICATION_STATUS_LABELS,
  CRM_DOC_CODE_LABELS,
  type CrmClientApplicationIntakeTerm,
  type CrmClientApplicationStatus,
  type CrmClientApplicationVM,
  type CrmClientStatus,
} from "@/lib/types/crm";
import {
  createApplication,
  deleteApplication,
  transitionApplicationStatus,
  updateApplicationFields,
} from "../../applications/actions";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LifecycleTabs } from "@/components/ui/LifecycleTabs";

type Search = { error?: string; ok?: string };
type OfferDocumentOption = { id: string; doc_code: string; file_name: string };

const STATUS_TONES: Record<
  CrmClientApplicationStatus,
  "green" | "amber" | "red" | "blue" | "gray" | "blue" | "yellow" | "teal"
> = {
  draft: "gray",
  submitted: "blue",
  under_review: "yellow",
  offer: "green",
  rejected: "red",
  waitlisted: "amber",
  accepted: "teal",
  declined: "red",
  withdrawn: "gray",
};

const GROUPS = [
  { key: "draft", title: "Draft", statuses: CRM_APPLICATION_STATUS_GROUPS.draft },
  { key: "in_flight", title: "In flight", statuses: CRM_APPLICATION_STATUS_GROUPS.in_flight },
  { key: "outcomes", title: "Outcomes", statuses: CRM_APPLICATION_STATUS_GROUPS.outcomes },
  { key: "closed", title: "Closed", statuses: CRM_APPLICATION_STATUS_GROUPS.closed },
] as const;

export default async function ClientApplicationsPage({
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

  const [detail, applications, offerDocuments, documents, visaData] = await Promise.all([
    getCrmClientDetail(id),
    listCrmClientApplications(id),
    listClientDocumentsForApplicationPicker(id),
    listCrmClientDocuments(id),
    getCrmClientForVisaPage(id),
  ]);

  if (!detail) notFound();
  const { client } = detail;
  const canEdit = canEditClientApplication(me, client);
  const stats = groupStats(applications);

  const docsAwaitingReview = documents.filter((document) =>
    document.doc_state === "uploaded" || document.doc_state === "under_review"
  ).length;
  const applicationsInFlight = applications.filter((application) =>
    application.status === "submitted" ||
    application.status === "under_review" ||
    application.status === "waitlisted"
  ).length;
  const showVisaBadge =
    Boolean(visaData?.country) &&
    (client.status === "offer_accepted" ||
      client.status === "visa_prep" ||
      client.status === "visa_submitted");
  const visaMilestonesRemaining = visaData?.isBlockedFromVisaSubmitted.missing.length ?? 0;
  const closureBadgeCount =
    client.status === "pre_departure" &&
    (!client.flight_date || !client.accommodation_details || !client.briefing_completed_at)
      ? 1
      : 0;

  const tabs = [
    { href: `/crm/clients/${client.id}/documents`, label: "Documents", badge: docsAwaitingReview, badgeTone: "yellow" as const },
    { href: `/crm/clients/${client.id}/applications`, label: "Applications", badge: applicationsInFlight, badgeTone: "blue" as const },
    { href: `/crm/clients/${client.id}/visa`, label: "Visa Stage", badge: showVisaBadge ? visaMilestonesRemaining : 0, badgeTone: "red" as const },
    { href: `/crm/clients/${client.id}/financials`, label: "Financials" },
    { href: `/crm/clients/${client.id}/closure`, label: "Closure", badge: closureBadgeCount, badgeTone: "amber" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description={`${client.lead_customer_name || client.lead_customer_phone}`}
        breadcrumbs={
          <div className="flex items-center gap-2 mb-2 text-sm">
            <Link href="/crm/clients" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
              CRM clients
            </Link>
            <span className="text-gray-400">/</span>
            <Link
              href={`/crm/clients/${client.id}`}
              className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              {client.client_code}
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">Applications</span>
          </div>
        }
        action={
          <Link
            href={`/crm/clients/${client.id}`}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors"
          >
            Back to client shell
          </Link>
        }
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <LifecycleTabs tabs={tabs} />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="In flight" value={stats.in_flight} />
        <StatCard label="With outcomes" value={stats.outcomes} />
        <StatCard label="Closed" value={stats.closed} />
      </section>

      {canEdit && (
        <details className="rounded-lg bg-white shadow-sm ring-1 ring-black/5 group">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-gray-900 list-none flex items-center justify-between">
            <span>+ Add new application</span>
            <span className="text-blue-600 group-open:hidden">Expand</span>
          </summary>
          <div className="px-5 pb-5 border-t border-gray-100">
            <CreateApplicationForm clientId={client.id} />
          </div>
        </details>
      )}

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const rows = applications.filter((application) =>
            (group.statuses as readonly CrmClientApplicationStatus[]).includes(application.status)
          );
          return (
            <ApplicationGroup
              key={group.key}
              title={group.title}
              applications={rows}
              canEdit={canEdit}
              isSuperAdmin={me.appUser.role === "super_admin"}
              offerDocuments={offerDocuments}
            />
          );
        })}
      </div>
    </div>
  );
}

function CreateApplicationForm({ clientId }: { clientId: string }) {
  return (
    <form action={createApplication} className="mt-4 grid gap-4 md:grid-cols-2">
      <input type="hidden" name="client_id" value={clientId} />
      <TextInput name="university_name" label="University name" required />
      <TextInput name="program_name" label="Program name" />
      <NumberInput name="intake_year" label="Intake year" min={2020} max={2035} />
      <TermSelect />
      <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-2">
        <span>Notes</span>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        />
      </label>
      <div className="md:col-span-2">
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
          Create application
        </button>
      </div>
    </form>
  );
}

function ApplicationGroup({
  title,
  applications,
  canEdit,
  isSuperAdmin,
  offerDocuments,
}: {
  title: string;
  applications: CrmClientApplicationVM[];
  canEdit: boolean;
  isSuperAdmin: boolean;
  offerDocuments: OfferDocumentOption[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{applications.length} applications</span>
      </div>
      {applications.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-4 py-4 text-sm text-gray-500 text-center">
          No applications in this section.
        </p>
      ) : (
        <div className="space-y-4">
          {applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              canEdit={canEdit}
              isSuperAdmin={isSuperAdmin}
              offerDocuments={offerDocuments}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ApplicationCard({
  application,
  canEdit,
  isSuperAdmin,
  offerDocuments,
}: {
  application: CrmClientApplicationVM;
  canEdit: boolean;
  isSuperAdmin: boolean;
  offerDocuments: OfferDocumentOption[];
}) {
  const nextStatuses = validNextStatuses(application.status);

  return (
    <article className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-inset ring-gray-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-bold text-gray-900 truncate">
              {application.university_name}
            </h3>
            <StatusBadge
              label={CRM_APPLICATION_STATUS_LABELS[application.status]}
              tone={STATUS_TONES[application.status]}
            />
          </div>
          <p className="mt-1 text-sm font-medium text-gray-600">{application.program_name ?? "Program not specified"}</p>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4 bg-gray-50/50 rounded-lg p-4 border border-gray-100">
            <Info label="Intake" value={formatIntake(application.intake_year, application.intake_term)} />
            <Info label="Decision" value={formatCrmDateTime(application.decision_at)} />
            <Info label="Tuition" value={formatMoney(application.tuition_total, application.offer_amount_currency)} />
            <Info label="Scholarship" value={formatMoney(application.scholarship_amount, application.offer_amount_currency)} />
            <Info label="Submitted" value={formatCrmDateTime(application.submitted_at)} />
            <Info label="Offer letter" value={application.offer_letter_file_name ?? "-"} />
          </dl>
          {application.notes && (
            <p className="mt-4 rounded-md bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700 italic">
              "{application.notes}"
            </p>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <details className="rounded-md border border-gray-200 bg-white group">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 list-none flex items-center justify-between">
              <span>Edit application details</span>
              <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="border-t border-gray-100 p-4 bg-gray-50/50">
              <EditApplicationForm application={application} offerDocuments={offerDocuments} />
            </div>
          </details>
          <details className="rounded-md border border-gray-200 bg-white group">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 list-none flex items-center justify-between">
              <span>Change application status</span>
              <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="border-t border-gray-100 p-4 bg-gray-50/50">
              {nextStatuses.length === 0 ? (
                <p className="text-sm text-gray-500">No valid 2C transitions from this status.</p>
              ) : (
                <TransitionForm application={application} nextStatuses={nextStatuses} />
              )}
            </div>
          </details>
        </div>
      )}

      {isSuperAdmin && application.status === "draft" && (
        <form action={deleteApplication} className="mt-5 border-t border-gray-100 pt-4 flex justify-end">
          <input type="hidden" name="application_id" value={application.id} />
          <button className="rounded-md bg-white border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors">
            Delete draft application
          </button>
        </form>
      )}
    </article>
  );
}

function EditApplicationForm({
  application,
  offerDocuments,
}: {
  application: CrmClientApplicationVM;
  offerDocuments: OfferDocumentOption[];
}) {
  return (
    <form action={updateApplicationFields} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="application_id" value={application.id} />
      <TextInput name="university_name" label="University name" defaultValue={application.university_name} required />
      <TextInput name="program_name" label="Program name" defaultValue={application.program_name ?? ""} />
      <NumberInput name="intake_year" label="Intake year" min={2020} max={2035} defaultValue={application.intake_year ?? ""} />
      <TermSelect defaultValue={application.intake_term ?? ""} />
      <NumberInput name="tuition_total" label="Tuition total" min={0} step="0.01" defaultValue={application.tuition_total ?? ""} />
      <NumberInput name="scholarship_amount" label="Scholarship amount" min={0} step="0.01" defaultValue={application.scholarship_amount ?? ""} />
      <FixedCurrency />
      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>Offer letter document</span>
        <select
          name="offer_letter_document_id"
          defaultValue={application.offer_letter_document_id ?? ""}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        >
          <option value="">No linked document</option>
          {offerDocuments.map((document) => (
            <option key={document.id} value={document.id}>
              {CRM_DOC_CODE_LABELS[document.doc_code as keyof typeof CRM_DOC_CODE_LABELS] ?? document.doc_code} - {document.file_name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-2">
        <span>Notes</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={application.notes ?? ""}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        />
      </label>
      <div className="md:col-span-2 flex justify-end">
        <button className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 transition-colors">
          Save changes
        </button>
      </div>
    </form>
  );
}

function TransitionForm({
  application,
  nextStatuses,
}: {
  application: CrmClientApplicationVM;
  nextStatuses: CrmClientApplicationStatus[];
}) {
  return (
    <form action={transitionApplicationStatus} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="application_id" value={application.id} />
      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>New status</span>
        <select
          name="to_status"
          required
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        >
          {nextStatuses.map((status) => (
            <option key={status} value={status}>
              {CRM_APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>Decision date</span>
        <input
          name="decision_date"
          type="date"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        />
      </label>
      <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-2">
        <span>Note</span>
        <input
          name="note"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
        />
      </label>
      <div className="md:col-span-2 flex justify-end">
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors">
          Update status
        </button>
      </div>
    </form>
  );
}

function FixedCurrency() {
  return (
    <div className="space-y-1 text-xs font-medium text-gray-600">
      <span>Currency</span>
      <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        PKR only
      </div>
    </div>
  );
}

function TextInput({
  name,
  label,
  defaultValue,
  required = false,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
      />
    </label>
  );
}

function NumberInput({
  name,
  label,
  defaultValue,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  defaultValue?: number | string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
      />
    </label>
  );
}

function TermSelect({ defaultValue = "" }: { defaultValue?: CrmClientApplicationIntakeTerm | "" }) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>Intake term</span>
      <select
        name="intake_term"
        defaultValue={defaultValue}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 outline-none"
      >
        <option value="">No term</option>
        <option value="fall">Fall</option>
        <option value="spring">Spring</option>
        <option value="summer">Summer</option>
      </select>
    </label>
  );
}

function validNextStatuses(from: CrmClientApplicationStatus): CrmClientApplicationStatus[] {
  switch (from) {
    case "draft":
      return ["submitted", "withdrawn"];
    case "submitted":
      return ["under_review", "withdrawn"];
    case "under_review":
      return ["offer", "rejected", "waitlisted", "withdrawn"];
    case "waitlisted":
      return ["offer", "rejected", "withdrawn"];
    case "offer":
      return ["accepted", "declined", "withdrawn"];
    case "rejected":
    case "declined":
      return ["withdrawn"];
    default:
      return [];
  }
}

function groupStats(applications: CrmClientApplicationVM[]) {
  return {
    draft: applications.filter((application) =>
      CRM_APPLICATION_STATUS_GROUPS.draft.includes(application.status as "draft")
    ).length,
    in_flight: applications.filter((application) =>
      (CRM_APPLICATION_STATUS_GROUPS.in_flight as readonly CrmClientApplicationStatus[]).includes(application.status)
    ).length,
    outcomes: applications.filter((application) =>
      (CRM_APPLICATION_STATUS_GROUPS.outcomes as readonly CrmClientApplicationStatus[]).includes(application.status)
    ).length,
    closed: applications.filter((application) =>
      CRM_APPLICATION_STATUS_GROUPS.closed.includes(application.status as "withdrawn")
    ).length,
  };
}

function formatIntake(year: number | null, term: CrmClientApplicationIntakeTerm | null): string {
  if (!year && !term) return "-";
  return [term ? formatLabel(term) : null, year ? String(year) : null].filter(Boolean).join(" ");
}

function formatLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function formatMoney(amount: number | null, currency: string): string {
  if (amount == null) return "-";
  return `${currency} ${amount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-inset ring-gray-200">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">{value}</div>
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
  return <div className={`rounded-md border px-4 py-3 text-sm shadow-sm ${classes}`}>{children}</div>;
}
