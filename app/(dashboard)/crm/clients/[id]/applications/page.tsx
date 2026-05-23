import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditClientApplication } from "@/lib/crm/permissions-clients";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientDetail,
  listClientDocumentsForApplicationPicker,
  listCrmClientApplications,
} from "@/lib/db/crm";
import {
  CRM_APPLICATION_STATUS_GROUPS,
  CRM_APPLICATION_STATUS_LABELS,
  CRM_DOC_CODE_LABELS,
  type CrmClientApplicationIntakeTerm,
  type CrmClientApplicationStatus,
  type CrmClientApplicationVM,
} from "@/lib/types/crm";
import {
  createApplication,
  deleteApplication,
  transitionApplicationStatus,
  updateApplicationFields,
} from "../../applications/actions";

type Search = { error?: string; ok?: string };
type OfferDocumentOption = { id: string; doc_code: string; file_name: string };

const STATUS_TONES: Record<
  CrmClientApplicationStatus,
  "green" | "amber" | "red" | "blue" | "gray" | "indigo" | "yellow" | "teal"
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

  const [detail, applications, offerDocuments] = await Promise.all([
    getCrmClientDetail(id),
    listCrmClientApplications(id),
    listClientDocumentsForApplicationPicker(id),
  ]);

  if (!detail) notFound();
  const { client } = detail;
  const canEdit = canEditClientApplication(me, client);
  const stats = groupStats(applications);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/crm/clients" className="text-sm text-indigo-600 hover:text-indigo-500">
              CRM clients
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <Link
              href={`/crm/clients/${client.id}`}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              {client.client_code}
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <span className="text-sm text-gray-500">Applications</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Applications</h1>
          <p className="text-sm text-gray-500">
            {client.lead_customer_name || client.lead_customer_phone}
          </p>
        </div>
        <Link
          href={`/crm/clients/${client.id}`}
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Client shell
        </Link>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Draft" value={stats.draft} />
        <Stat label="In flight" value={stats.in_flight} />
        <Stat label="With outcomes" value={stats.outcomes} />
        <Stat label="Closed" value={stats.closed} />
      </section>

      {canEdit && (
        <details className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">
            + Add application
          </summary>
          <CreateApplicationForm clientId={client.id} />
        </details>
      )}

      <section className="space-y-6">
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
      </section>
    </div>
  );
}

function CreateApplicationForm({ clientId }: { clientId: string }) {
  return (
    <form action={createApplication} className="mt-4 grid gap-3 md:grid-cols-2">
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
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
        />
      </label>
      <div className="md:col-span-2">
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
          Add application
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
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-500">{applications.length} applications</span>
      </div>
      {applications.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
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
    <article className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">
              {application.university_name}
            </h3>
            <Chip
              label={CRM_APPLICATION_STATUS_LABELS[application.status]}
              tone={STATUS_TONES[application.status]}
            />
          </div>
          <p className="mt-1 text-sm text-gray-600">{application.program_name ?? "-"}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Intake" value={formatIntake(application.intake_year, application.intake_term)} />
            <Info label="Decision" value={formatCrmDateTime(application.decision_at)} />
            <Info label="Tuition" value={formatMoney(application.tuition_total, application.offer_amount_currency)} />
            <Info label="Scholarship" value={formatMoney(application.scholarship_amount, application.offer_amount_currency)} />
            <Info label="Submitted" value={formatCrmDateTime(application.submitted_at)} />
            <Info label="Offer letter" value={application.offer_letter_file_name ?? "-"} />
          </dl>
          {application.notes && (
            <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {application.notes}
            </p>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <details className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Edit</summary>
            <EditApplicationForm application={application} offerDocuments={offerDocuments} />
          </details>
          <details className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Change status</summary>
            {nextStatuses.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No valid 2C transitions from this status.</p>
            ) : (
              <TransitionForm application={application} nextStatuses={nextStatuses} />
            )}
          </details>
        </div>
      )}

      {isSuperAdmin && application.status === "draft" && (
        <form action={deleteApplication} className="mt-4">
          <input type="hidden" name="application_id" value={application.id} />
          <button className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500">
            Delete draft
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
    <form action={updateApplicationFields} className="mt-4 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="application_id" value={application.id} />
      <TextInput name="university_name" label="University name" defaultValue={application.university_name} required />
      <TextInput name="program_name" label="Program name" defaultValue={application.program_name ?? ""} />
      <NumberInput name="intake_year" label="Intake year" min={2020} max={2035} defaultValue={application.intake_year ?? ""} />
      <TermSelect defaultValue={application.intake_term ?? ""} />
      <NumberInput name="tuition_total" label="Tuition total" min={0} step="0.01" defaultValue={application.tuition_total ?? ""} />
      <NumberInput name="scholarship_amount" label="Scholarship amount" min={0} step="0.01" defaultValue={application.scholarship_amount ?? ""} />
      <TextInput name="offer_amount_currency" label="Currency" defaultValue={application.offer_amount_currency} />
      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>Offer letter document</span>
        <select
          name="offer_letter_document_id"
          defaultValue={application.offer_letter_document_id ?? ""}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
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
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
        />
      </label>
      <div className="md:col-span-2">
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
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
    <form action={transitionApplicationStatus} className="mt-4 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="application_id" value={application.id} />
      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>New status</span>
        <select
          name="to_status"
          required
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
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
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
        />
      </label>
      <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-2">
        <span>Note</span>
        <input
          name="note"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
        />
      </label>
      <div className="md:col-span-2">
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
          Update status
        </button>
      </div>
    </form>
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
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
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
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
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
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
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
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-gray-900">{value}</dd>
    </div>
  );
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
