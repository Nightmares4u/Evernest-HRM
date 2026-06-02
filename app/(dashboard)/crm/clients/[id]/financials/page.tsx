import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientFinancialsPage,
  listCrmClientDocuments,
  listCrmClientApplications,
  getCrmClientForVisaPage,
} from "@/lib/db/crm";
import type {
  CrmClientPayment,
  CrmClientRefund,
  CrmClientStatus,
  CrmClientVM,
} from "@/lib/types/crm";
import { recordClientPayment } from "../../actions";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, Td } from "@/components/ui/DataTable";
import { LifecycleTabs } from "@/components/ui/LifecycleTabs";

type Search = { error?: string; ok?: string };

const FIELD =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:ring-blue-600 outline-none";
const BTN_PRIMARY =
  "rounded-md bg-blue-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors";

const STATUS_TONES: Record<
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

export default async function ClientFinancialsPage({
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

  const [data, documents, applications, visaData] = await Promise.all([
    getCrmClientFinancialsPage(id),
    listCrmClientDocuments(id),
    listCrmClientApplications(id),
    getCrmClientForVisaPage(id),
  ]);

  if (!data) notFound();

  const { client, payments, refunds } = data;
  const isTerminal = client.status === "alumni" || client.status === "withdrawn_refunded";

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
  const showVisaBadge =
    Boolean(visaData?.country) &&
    (client.status === "offer_accepted" ||
      client.status === "visa_prep" ||
      client.status === "visa_submitted");
  const visaMilestonesRemaining = visaData?.isBlockedFromVisaSubmitted.missing.length ?? 0;
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
    { href: `/crm/clients/${client.id}/visa`, label: "Visa Stage", badge: showVisaBadge ? visaMilestonesRemaining : 0, badgeTone: "red" as const },
    { href: `/crm/clients/${client.id}/financials`, label: "Financials" },
    { href: `/crm/clients/${client.id}/closure`, label: "Closure", badge: closureBadgeCount, badgeTone: "amber" as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financials"
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
            <span className="text-gray-500">Financials</span>
          </div>
        }
        action={<StatusBadge label={formatLabel(client.status)} tone={STATUS_TONES[client.status]} />}
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <LifecycleTabs tabs={tabs} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total received" value={formatMoney(data.totalReceived, client.currency)} tone="green" />
        <StatCard label="Total refunded" value={formatMoney(data.totalRefunded, client.currency)} tone="red" />
        <StatCard label="Net received" value={formatMoney(data.netReceived, client.currency)} tone="blue" />
      </div>

      {data.canRecordPayment && <RecordPaymentPanel client={client} />}

      {!data.canRecordPayment && isTerminal && (
        <Notice tone="amber">Payments are closed for terminal clients.</Notice>
      )}

      <PaymentHistory payments={payments} />
      <RefundHistory refunds={refunds} />
    </div>
  );
}

function RecordPaymentPanel({ client }: { client: CrmClientVM }) {
  return (
    <SectionCard title="Record payment">
      <form action={recordClientPayment} className="mt-4 grid gap-4 md:grid-cols-3">
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="return_to" value="financials" />
        <NumberInput name="amount" label="Amount" min="0.01" step="0.01" required />
        <TextInput name="currency" label="Currency" defaultValue={client.currency || "PKR"} />
        <DateTimeInput name="paid_at" label="Paid at" required />
        <label className="space-y-1 text-xs font-medium text-gray-600">
          <span>Method</span>
          <select name="method" required defaultValue="bank_transfer" className={FIELD}>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="online">Online</option>
            <option value="other">Other</option>
          </select>
        </label>
        <TextInput name="reference" label="Reference" />
        <TextInput name="notes" label="Notes" />
        <div className="mt-2 flex justify-end border-t border-gray-100 pt-4 md:col-span-3">
          <button className={`w-full md:w-auto ${BTN_PRIMARY}`}>Record payment</button>
        </div>
      </form>
    </SectionCard>
  );
}

function PaymentHistory({ payments }: { payments: CrmClientPayment[] }) {
  if (payments.length === 0) {
    return (
      <SectionCard title="Payment history">
        <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No payments recorded yet.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Payment history" description={`${payments.length} payments recorded`}>
      <div className="mt-4">
        <DataTable columns={["Paid at", "Amount", "Method", "Reference", "Notes", "Recorded by"]}>
          {payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-gray-50">
              <Td>{formatCrmDateTime(payment.paid_at)}</Td>
              <Td className="font-medium text-gray-900">{formatMoney(payment.amount, payment.currency)}</Td>
              <Td>{payment.method ?? "-"}</Td>
              <Td>{payment.reference ?? "-"}</Td>
              <Td>{payment.notes ?? "-"}</Td>
              <Td>{payment.recorded_by_user_id ?? "-"}</Td>
            </tr>
          ))}
        </DataTable>
      </div>
    </SectionCard>
  );
}

function RefundHistory({ refunds }: { refunds: CrmClientRefund[] }) {
  if (refunds.length === 0) {
    return (
      <SectionCard title="Refund history">
        <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No refunds recorded.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Refund history" description={`${refunds.length} refunds recorded`}>
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

function DateTimeInput({
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
      <input name={name} type="datetime-local" required={required} className={FIELD} />
    </label>
  );
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
