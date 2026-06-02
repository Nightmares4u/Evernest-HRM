import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientForClosurePage,
  listCrmClientApplications,
  listCrmClientDocuments,
} from "@/lib/db/crm";
import {
  CRM_CLIENT_VISA_DECISION_LABELS,
  type CrmClientRefund,
  type CrmClientStatus,
  type CrmClientVisaDecision,
  type CrmClientVisaDecisionOutcome,
  type CrmClientVM,
} from "@/lib/types/crm";
import {
  markAlumniAction,
  markDepartedAction,
  recordClientRefundAction,
  updatePreDepartureFieldsAction,
  withdrawClientAction,
} from "../../closure/actions";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, Td } from "@/components/ui/DataTable";
import { DangerZone } from "@/components/ui/DangerZone";
import { LifecycleTabs } from "@/components/ui/LifecycleTabs";

type Search = { error?: string; ok?: string };

const FIELD =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:ring-blue-600 outline-none";
const BTN_PRIMARY =
  "rounded-md bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors";
const BTN_GREEN =
  "rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-500 transition-colors";

const CLIENT_STATUS_TONES: Record<
  CrmClientStatus,
  "green" | "amber" | "red" | "blue" | "gray" | "yellow" | "teal"
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

export default async function ClientClosurePage({
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

  const [data, documents, applications] = await Promise.all([
    getCrmClientForClosurePage(id),
    listCrmClientDocuments(id),
    listCrmClientApplications(id),
  ]);

  if (!data) notFound();

  const { client, visaDecisions, refunds } = data;
  const canWithdrawFromStatus =
    client.status !== "alumni" && client.status !== "withdrawn_refunded";
  const canRecordRefundForStatus =
    data.canRecordRefund && client.status === "withdrawn_refunded";

  const docsAwaitingReview = documents.filter(
    (document) =>
      document.doc_state === "uploaded" || document.doc_state === "under_review"
  ).length;
  const applicationsInFlight = applications.filter(
    (application) =>
      application.status === "submitted" ||
      application.status === "under_review" ||
      application.status === "waitlisted"
  ).length;
  // Assume visa milestone is cleared if they are in closure.
  const visaMilestonesRemaining = 0;
  const closureBadgeCount =
    client.status === "pre_departure" &&
    (!client.flight_date ||
      !client.accommodation_details ||
      !client.briefing_completed_at)
      ? 1
      : 0;

  const tabs = [
    { href: `/crm/clients/${client.id}/documents`, label: "Documents", badge: docsAwaitingReview, badgeTone: "yellow" as const },
    { href: `/crm/clients/${client.id}/applications`, label: "Applications", badge: applicationsInFlight, badgeTone: "blue" as const },
    { href: `/crm/clients/${client.id}/visa`, label: "Visa Stage", badge: visaMilestonesRemaining, badgeTone: "red" as const },
    { href: `/crm/clients/${client.id}/financials`, label: "Financials" },
    { href: `/crm/clients/${client.id}/closure`, label: "Closure", badge: closureBadgeCount, badgeTone: "amber" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Closure"
        description={`${client.lead_customer_name || client.lead_customer_phone}`}
        breadcrumbs={
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Link href="/crm/clients" className="font-medium text-blue-700 transition-colors hover:text-blue-900">
              CRM clients
            </Link>
            <span className="text-gray-400">/</span>
            <Link
              href={`/crm/clients/${client.id}`}
              className="font-medium text-blue-700 transition-colors hover:text-blue-900"
            >
              {client.client_code}
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">Closure</span>
          </div>
        }
        action={<StatusBadge label={formatLabel(client.status)} tone={CLIENT_STATUS_TONES[client.status]} />}
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <LifecycleTabs tabs={tabs} />

      <VisaDecisionSummary decisions={visaDecisions} />

      {client.status === "pre_departure" && (
        <PreDeparturePanel client={client} canTransitionStatus={data.canTransitionStatus} />
      )}

      {client.status === "departed" && (
        <DepartedPanel client={client} canTransitionStatus={data.canTransitionStatus} />
      )}

      {client.status === "alumni" && <AlumniPanel client={client} />}

      {client.status === "withdrawn_refunded" && <WithdrawnPanel client={client} />}

      {!["pre_departure", "departed", "alumni", "withdrawn_refunded"].includes(client.status) && (
        <SectionCard title="Closure status">
          <p className="mt-2 text-sm text-gray-500">
            Closure controls become available after a granted visa decision moves the client to
            pre-departure. Withdrawals are still available to super admins before terminal closure.
          </p>
        </SectionCard>
      )}

      {data.canWithdraw && canWithdrawFromStatus && <WithdrawPanel clientId={client.id} />}

      <RefundsPanel
        clientId={client.id}
        refunds={refunds}
        canRecordRefund={canRecordRefundForStatus}
      />
    </div>
  );
}

function PreDeparturePanel({
  client,
  canTransitionStatus,
}: {
  client: CrmClientVM;
  canTransitionStatus: boolean;
}) {
  const flightDateIsPast =
    client.flight_date != null && new Date(client.flight_date).getTime() < Date.now();

  return (
    <div className="space-y-6">
      <SectionCard title="Pre-departure details">
        {flightDateIsPast ? (
          <Notice tone="amber">Flight date is in the past. This is a soft warning only.</Notice>
        ) : (
          <p className="text-sm text-gray-500">
            Flight date should be in the future when submitted. This is a soft warning only.
          </p>
        )}
        {canTransitionStatus ? (
          <form action={updatePreDepartureFieldsAction} className="mt-6 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="client_id" value={client.id} />
            <DateTimeInput name="flight_date" label="Flight date" value={client.flight_date} />
            <DateTimeInput
              name="briefing_completed_at"
              label="Briefing completed"
              value={client.briefing_completed_at}
            />
            <TextArea name="flight_details" label="Flight details" value={client.flight_details} />
            <TextArea
              name="accommodation_details"
              label="Accommodation details"
              value={client.accommodation_details}
            />
            <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-2">
              <span>Briefing notes</span>
              <textarea
                name="briefing_notes"
                rows={3}
                defaultValue={client.briefing_notes ?? ""}
                className={FIELD}
              />
            </label>
            <div className="flex justify-end md:col-span-2">
              <button className={BTN_PRIMARY}>Save pre-departure details</button>
            </div>
          </form>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
            Only the assigned counselor or super admin can update pre-departure details.
          </p>
        )}
      </SectionCard>

      {canTransitionStatus && (
        <SectionCard title="Mark departed">
          <form action={markDepartedAction} className="mt-4 grid gap-4 md:grid-cols-[14rem_1fr_auto]">
            <input type="hidden" name="client_id" value={client.id} />
            <DateInput name="departure_date" label="Departure date" required />
            <TextInput name="note" label="Note" />
            <div className="flex items-end">
              <button className={`w-full md:w-auto ${BTN_GREEN}`}>Mark departed</button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}

function DepartedPanel({
  client,
  canTransitionStatus,
}: {
  client: CrmClientVM;
  canTransitionStatus: boolean;
}) {
  return (
    <div className="space-y-6">
      <SummaryCard title="Departure summary" client={client} />
      {canTransitionStatus && (
        <SectionCard title="Confirm arrival and mark alumni">
          <form action={markAlumniAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="client_id" value={client.id} />
            <DateInput name="arrival_date" label="Arrival date" />
            <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-2">
              <span>Alumni notes</span>
              <textarea
                name="alumni_notes"
                rows={3}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:ring-green-500 outline-none"
              />
            </label>
            <div className="flex justify-end md:col-span-2">
              <button className={BTN_GREEN}>Mark alumni</button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}

function AlumniPanel({ client }: { client: CrmClientVM }) {
  return (
    <SectionCard title="Alumni summary" action={<StatusBadge label="Closure complete" tone="green" />}>
      <dl className="mt-4 grid gap-6 rounded-lg border border-gray-100 bg-gray-50/50 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Departed" value={formatCrmDateTime(client.departure_date)} />
        <Info label="Arrived" value={formatCrmDateTime(client.arrival_date)} />
        <Info label="Alumni started" value={formatCrmDateTime(client.alumni_started_at)} />
        <Info label="Alumni notes" value={client.alumni_notes ?? "-"} />
      </dl>
    </SectionCard>
  );
}

function WithdrawnPanel({ client }: { client: CrmClientVM }) {
  return (
    <SectionCard title="Withdrawal summary">
      <dl className="mt-4 grid gap-6 rounded-lg border border-red-100 bg-red-50/30 p-5 sm:grid-cols-2">
        <Info label="Withdrawn at" value={formatCrmDateTime(client.withdrawn_at)} />
        <Info label="Reason" value={client.withdrawn_reason ?? "-"} />
      </dl>
    </SectionCard>
  );
}

function WithdrawPanel({ clientId }: { clientId: string }) {
  return (
    <DangerZone
      title="Withdraw client"
      warningText="This is a one-way action for Stage 2. Re-opening withdrawn clients is out of scope."
    >
      <form action={withdrawClientAction} className="mt-4 grid gap-4 md:grid-cols-3">
        <input type="hidden" name="client_id" value={clientId} />
        <label className="space-y-1 text-xs font-medium text-red-900 md:col-span-3">
          <span>Reason</span>
          <textarea
            name="reason"
            required
            rows={3}
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:ring-red-500 outline-none"
          />
        </label>
        <NumberInput name="refund_amount" label="Refund amount" min="0.01" step="0.01" />
        <TextInput name="refund_currency" label="Refund currency" defaultValue="PKR" />
        <div className="flex items-end md:col-span-3 lg:col-span-1">
          <button className="w-full rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500">
            Withdraw client
          </button>
        </div>
      </form>
    </DangerZone>
  );
}

function RefundsPanel({
  clientId,
  refunds,
  canRecordRefund,
}: {
  clientId: string;
  refunds: CrmClientRefund[];
  canRecordRefund: boolean;
}) {
  return (
    <SectionCard title="Refund history">
      {refunds.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No refunds recorded.
        </p>
      ) : (
        <div className="mt-4">
          <DataTable columns={["Refunded at", "Amount", "Reason", "Recorded by"]}>
            {refunds.map((refund) => (
              <tr key={refund.id} className="hover:bg-gray-50">
                <Td>{formatCrmDateTime(refund.refunded_at)}</Td>
                <Td className="font-medium text-gray-900">{formatMoney(refund.amount, refund.currency)}</Td>
                <Td>{refund.reason}</Td>
                <Td>{refund.recorded_by_user_id ?? "-"}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {canRecordRefund && (
        <form
          action={recordClientRefundAction}
          className="mt-6 grid gap-4 border-t border-gray-100 pt-6 md:grid-cols-[12rem_10rem_1fr_auto]"
        >
          <input type="hidden" name="client_id" value={clientId} />
          <NumberInput name="amount" label="Amount" min="0.01" step="0.01" required />
          <TextInput name="currency" label="Currency" defaultValue="PKR" />
          <TextInput name="reason" label="Reason" required />
          <div className="flex items-end">
            <button className={`w-full md:w-auto ${BTN_PRIMARY}`}>Record refund</button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}

function VisaDecisionSummary({ decisions }: { decisions: CrmClientVisaDecision[] }) {
  if (decisions.length === 0) return null;
  return (
    <SectionCard title="Visa decisions">
      <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
        {decisions.map((decision) => (
          <li
            key={decision.id}
            className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-gray-50"
          >
            <div>
              <div className="font-semibold text-gray-900">
                {CRM_CLIENT_VISA_DECISION_LABELS[decision.outcome]}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{formatCrmDateTime(decision.decided_at)}</div>
              {decision.note && (
                <div className="mt-2 rounded border border-gray-100 bg-white p-2 text-sm italic text-gray-600">
                  &ldquo;{decision.note}&rdquo;
                </div>
              )}
            </div>
            <StatusBadge label={CRM_CLIENT_VISA_DECISION_LABELS[decision.outcome]} tone={visaDecisionTone(decision.outcome)} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function SummaryCard({ title, client }: { title: string; client: CrmClientVM }) {
  return (
    <SectionCard title={title}>
      <dl className="mt-4 grid gap-6 rounded-lg border border-gray-100 bg-gray-50/50 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Flight date" value={formatCrmDateTime(client.flight_date)} />
        <Info label="Flight details" value={client.flight_details ?? "-"} />
        <Info label="Accommodation" value={client.accommodation_details ?? "-"} />
        <Info label="Briefing completed" value={formatCrmDateTime(client.briefing_completed_at)} />
        <Info label="Briefing notes" value={client.briefing_notes ?? "-"} />
        <Info label="Departure date" value={formatCrmDateTime(client.departure_date)} />
      </dl>
    </SectionCard>
  );
}

function TextInput({
  name,
  label,
  defaultValue = "",
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
      <input name={name} required={required} defaultValue={defaultValue} className={FIELD} />
    </label>
  );
}

function TextArea({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string | null;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <textarea name={name} rows={3} defaultValue={value ?? ""} className={FIELD} />
    </label>
  );
}

function NumberInput({
  name,
  label,
  min,
  step,
  required = false,
}: {
  name: string;
  label: string;
  min: string;
  step: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input name={name} type="number" min={min} step={step} required={required} className={FIELD} />
    </label>
  );
}

function DateInput({
  name,
  label,
  required = false,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input name={name} type="date" required={required} className={FIELD} />
    </label>
  );
}

function DateTimeInput({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string | null;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input name={name} type="datetime-local" defaultValue={dateTimeInputValue(value)} className={FIELD} />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function dateTimeInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function visaDecisionTone(
  outcome: CrmClientVisaDecisionOutcome
): "green" | "amber" | "red" {
  if (outcome === "granted") return "green";
  if (outcome === "refused") return "red";
  return "amber";
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
  tone: "green" | "red" | "amber";
}) {
  const classes =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-md border px-4 py-3 text-sm shadow-sm ${classes}`}>{children}</div>;
}
