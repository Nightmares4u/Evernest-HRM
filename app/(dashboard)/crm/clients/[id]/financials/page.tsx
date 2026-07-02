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
  CrmClientInvoice,
  CrmClientInvoiceStep,
  CrmClientPayment,
  CrmClientRefund,
  CrmClientStatus,
} from "@/lib/types/crm";
import { updateClientInvoice, upsertClientInvoiceStep } from "../../actions";

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
const BTN_SECONDARY =
  "rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 transition-colors";

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

  const { client, invoice, invoiceSteps, payments, refunds } = data;
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

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Invoice subtotal" value={formatMoney(data.invoiceSubtotal, client.currency)} />
        <StatCard label="Invoice paid" value={formatMoney(data.invoicePaidTotal, client.currency)} tone="green" />
        <StatCard label="Invoice waived" value={formatMoney(data.invoiceWaivedTotal, client.currency)} tone="amber" />
        <StatCard label="Balance due" value={formatMoney(data.invoiceBalanceDue, client.currency)} tone="blue" />
      </div>

      {invoice ? (
        <>
          <InvoiceHeaderPanel invoice={invoice} canEdit={data.canRecordPayment && !isTerminal} />
          <InvoiceStepsPanel
            clientId={client.id}
            invoice={invoice}
            steps={invoiceSteps}
            canEdit={data.canRecordPayment && !isTerminal}
          />
        </>
      ) : (
        <Notice tone="amber">
          No invoice record exists yet. Apply migration 0026 to create invoice shells for existing clients.
        </Notice>
      )}

      {!data.canRecordPayment && isTerminal && (
        <Notice tone="amber">Invoice payment updates are closed for terminal clients.</Notice>
      )}

      <PaymentHistory payments={payments} />
      <RefundHistory refunds={refunds} />
    </div>
  );
}

function InvoiceHeaderPanel({
  invoice,
  canEdit,
}: {
  invoice: CrmClientInvoice;
  canEdit: boolean;
}) {
  return (
    <SectionCard
      title="Invoice"
      description="Invoice header and printable reference details."
      action={
        <Link href={`/crm/clients/${invoice.client_id}/financials/invoice`} className={BTN_SECONDARY}>
          Export PDF
        </Link>
      }
    >
      <form action={updateClientInvoice} className="mt-4 grid gap-4 md:grid-cols-3">
        <input type="hidden" name="client_id" value={invoice.client_id} />
        <input type="hidden" name="invoice_id" value={invoice.id} />
        <TextInput name="invoice_number" label="Invoice number" defaultValue={invoice.invoice_number} required />
        <TextInput name="file_number" label="File number" defaultValue={invoice.file_number ?? ""} />
        <label className="space-y-1 text-xs font-medium text-gray-600">
          <span>Status</span>
          <select name="status" required defaultValue={invoice.status} className={FIELD} disabled={!canEdit}>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="void">Void</option>
          </select>
        </label>
        <TextInput name="invoice_date" label="Invoice date" defaultValue={invoice.invoice_date.slice(0, 10)} required type="date" />
        <TextInput name="due_label" label="Due date / label" defaultValue={invoice.due_label} required />
        <FixedCurrency />
        <TextInput name="bill_to_name" label="Bill to name" defaultValue={invoice.bill_to_name ?? ""} />
        <TextInput name="bill_to_location" label="Bill to location" defaultValue={invoice.bill_to_location ?? ""} />
        <TextInput name="package_title" label="Package title" defaultValue={invoice.package_title} required />
        <TextArea name="terms" label="Terms & instructions" defaultValue={invoice.terms} />
        <TextArea name="footer_note" label="Footer note" defaultValue={invoice.footer_note} />
        <div className="mt-2 flex justify-end border-t border-gray-100 pt-4 md:col-span-3">
          <button className={`w-full md:w-auto ${BTN_PRIMARY}`} disabled={!canEdit}>
            Save invoice
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function InvoiceStepsPanel({
  clientId,
  invoice,
  steps,
  canEdit,
}: {
  clientId: string;
  invoice: CrmClientInvoice;
  steps: CrmClientInvoiceStep[];
  canEdit: boolean;
}) {
  return (
    <SectionCard title="Invoice steps" description="Only steps marked paid create payment rows and affect financial totals.">
      <div className="mt-4">
        {steps.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No invoice steps yet.
          </p>
        ) : (
          <DataTable columns={["#", "Description", "Amount", "Status", "Payment"]}>
            {steps.map((step) => (
              <tr key={step.id} className="hover:bg-gray-50">
                <Td>{step.line_order}</Td>
                <Td>
                  <div className="font-medium text-gray-900">{step.description}</div>
                  <div className="text-xs text-gray-500">{step.detail_label ?? "-"}</div>
                </Td>
                <Td>{formatMoney(Number(step.quantity) * Number(step.unit_price), invoice.currency)}</Td>
                <Td>{formatLabel(step.status)}</Td>
                <Td>{step.payment_id ? "Linked" : "-"}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {steps.map((step) => (
          <InvoiceStepForm
            key={step.id}
            clientId={clientId}
            invoiceId={invoice.id}
            step={step}
            canEdit={canEdit}
          />
        ))}
        <InvoiceStepForm
          clientId={clientId}
          invoiceId={invoice.id}
          nextLineOrder={steps.length + 1}
          canEdit={canEdit}
        />
      </div>
    </SectionCard>
  );
}

function InvoiceStepForm({
  clientId,
  invoiceId,
  step,
  nextLineOrder,
  canEdit,
}: {
  clientId: string;
  invoiceId: string;
  step?: CrmClientInvoiceStep;
  nextLineOrder?: number;
  canEdit: boolean;
}) {
  const isExisting = Boolean(step);
  return (
    <form action={upsertClientInvoiceStep} className="rounded-md border border-gray-200 bg-gray-50 p-4">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      {step && <input type="hidden" name="step_id" value={step.id} />}
      <div className="grid gap-4 md:grid-cols-4">
        <NumberInput
          name="line_order"
          label="#"
          min="1"
          step="1"
          defaultValue={String(step?.line_order ?? nextLineOrder ?? 1)}
          required
        />
        <div className="md:col-span-2">
          <TextInput
            name="description"
            label="Description"
            defaultValue={step?.description ?? ""}
            required
          />
        </div>
        <label className="space-y-1 text-xs font-medium text-gray-600">
          <span>Status</span>
          <select name="status" required defaultValue={step?.status ?? "due"} className={FIELD} disabled={!canEdit}>
            <option value="due">Due</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
        </label>
        <NumberInput
          name="quantity"
          label="Quantity"
          min="0.01"
          step="0.01"
          defaultValue={String(step?.quantity ?? 1)}
          required
        />
        <NumberInput
          name="unit_price"
          label="Unit price"
          min="0"
          step="0.01"
          defaultValue={String(step?.unit_price ?? 0)}
          required
        />
        <TextInput
          name="detail_label"
          label="Bottom detail"
          defaultValue={step?.detail_label ?? ""}
        />
        <TextInput
          name="detail_status"
          label="Bottom status"
          defaultValue={step?.detail_status ?? (step?.status ? formatLabel(step.status) : "")}
        />
        <DateTimeInput
          name="paid_at"
          label="Paid at"
          defaultValue={step?.paid_at ? formatDateTimeLocalPKT(step.paid_at) : ""}
        />
      </div>
      <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
        <button className={isExisting ? BTN_SECONDARY : BTN_PRIMARY} disabled={!canEdit}>
          {isExisting ? "Save step" : "Add step"}
        </button>
      </div>
    </form>
  );
}

function FixedCurrency() {
  return (
    <div className="space-y-1 text-xs font-medium text-gray-600">
      <span>Currency</span>
      <div className={`${FIELD} flex items-center bg-gray-50 text-gray-700`}>PKR only</div>
    </div>
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
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} className={FIELD} />
    </label>
  );
}

function TextArea({
  name,
  label,
  defaultValue = "",
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-3">
      <span>{label}</span>
      <textarea name={name} defaultValue={defaultValue} rows={2} className={FIELD} />
    </label>
  );
}

function NumberInput({
  name,
  label,
  min,
  step,
  required = false,
  defaultValue = "",
}: {
  name: string;
  label: string;
  min: string;
  step: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input
        name={name}
        type="number"
        min={min}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className={FIELD}
      />
    </label>
  );
}

function DateTimeInput({
  name,
  label,
  required = false,
  defaultValue = "",
}: {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-gray-600">
      <span>{label}</span>
      <input
        name={name}
        type="datetime-local"
        required={required}
        defaultValue={defaultValue}
        className={FIELD}
      />
    </label>
  );
}

function formatDateTimeLocalPKT(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
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
