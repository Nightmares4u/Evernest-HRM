import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientDetail,
  getCrmClientForVisaPage,
  listCrmClientApplications,
  listCrmClientDocuments,
} from "@/lib/db/crm";
import type {
  CrmClientActivity,
  CrmClientPayment,
  CrmClientStatus,
} from "@/lib/types/crm";

type Search = { error?: string; ok?: string };

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

export default async function CrmClientDetailPage({
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

  const detail = await getCrmClientDetail(id);
  if (!detail) notFound();

  const { client, payments, activities } = detail;
  const [documents, applications, visaData] = await Promise.all([
    listCrmClientDocuments(client.id),
    listCrmClientApplications(client.id),
    getCrmClientForVisaPage(client.id),
  ]);
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/crm/clients" className="text-sm text-indigo-600 hover:text-indigo-500">
              CRM clients
            </Link>
            <span className="text-sm text-gray-400">/</span>
            <span className="text-sm text-gray-500">{client.client_code}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            {client.client_code}
          </h1>
          <p className="text-sm text-gray-500">
            {client.lead_customer_name || client.lead_customer_phone}
          </p>
        </div>
        <Chip label={formatLabel(client.status)} tone={STATUS_TONES[client.status]} />
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <nav className="flex flex-wrap gap-2">
        <Link
          href={`/crm/clients/${client.id}/documents`}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Documents
          {docsAwaitingReview > 0 && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
              {docsAwaitingReview}
            </span>
          )}
        </Link>
        <Link
          href={`/crm/clients/${client.id}/applications`}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Applications
          {applicationsInFlight > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              {applicationsInFlight}
            </span>
          )}
        </Link>
        <Link
          href={`/crm/clients/${client.id}/visa`}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Visa stage
          {showVisaBadge && visaMilestonesRemaining > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              {visaMilestonesRemaining}
            </span>
          )}
        </Link>
      </nav>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Client shell</h2>
              <p className="mt-1 text-sm text-gray-500">
                Phase 2A read-only client record created from a converted lead.
              </p>
            </div>
            <Link
              href={`/crm/leads/${client.lead_id}`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Back to lead
            </Link>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Assigned counselor" value={client.assigned_agent_name ?? "Unassigned"} />
            <Info
              label="Branch"
              value={client.branch_code ? `${client.branch_code} - ${client.branch_name}` : "-"}
            />
            <Info label="Target country" value={client.target_country ?? "-"} />
            <Info label="Target level" value={client.target_level ?? "-"} />
            <Info label="Agreement signed" value={formatCrmDateTime(client.agreement_signed_at)} />
            <Info label="Advance paid" value={formatCrmDateTime(client.advance_paid_at)} />
            <Info label="Advance amount" value={formatMoney(client.advance_amount, client.currency)} />
            <Info label="Total fee" value={formatMoney(client.total_fee, client.currency)} />
            <Info label="Created" value={formatCrmDateTime(client.created_at)} />
          </dl>
        </div>

        <Timeline activities={activities} />
      </section>

      <Payments payments={payments} />
    </div>
  );
}

function Payments({ payments }: { payments: CrmClientPayment[] }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Payments</h2>
      {payments.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No payments recorded yet.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-md border border-gray-100">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Paid at</Th>
                <Th>Amount</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <Td>{formatCrmDateTime(payment.paid_at)}</Td>
                  <Td>{formatMoney(payment.amount, payment.currency)}</Td>
                  <Td>{payment.method ?? "-"}</Td>
                  <Td>{payment.reference ?? "-"}</Td>
                  <Td>{payment.notes ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Timeline({ activities }: { activities: CrmClientActivity[] }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Activity timeline</h2>
      {activities.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No client activity yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {activities.map((activity) => (
            <li key={activity.id} className="border-l-2 border-indigo-100 pl-3 text-sm">
              <div className="font-medium text-gray-900">
                {formatLabel(activity.activity_type)}
              </div>
              <div className="text-gray-500">{activity.description ?? "-"}</div>
              <div className="mt-1 text-xs text-gray-400">
                {formatCrmDateTime(activity.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
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
