import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import { getCrmClientFinancialsPage } from "@/lib/db/crm";
import type {
  CrmClientPayment,
  CrmClientRefund,
  CrmClientStatus,
  CrmClientVM,
} from "@/lib/types/crm";
import { recordClientPayment } from "../../actions";

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

  const data = await getCrmClientFinancialsPage(id);
  if (!data) notFound();

  const { client, payments, refunds } = data;
  const isTerminal = client.status === "alumni" || client.status === "withdrawn_refunded";

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
            <span className="text-sm text-gray-500">Financials</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Financials</h1>
          <p className="text-sm text-gray-500">
            {client.lead_customer_name || client.lead_customer_phone}
          </p>
        </div>
        <Chip label={formatLabel(client.status)} tone={STATUS_TONES[client.status]} />
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Total received"
          value={formatMoney(data.totalReceived, client.currency)}
        />
        <SummaryCard
          label="Total refunded"
          value={formatMoney(data.totalRefunded, client.currency)}
        />
        <SummaryCard
          label="Net received"
          value={formatMoney(data.netReceived, client.currency)}
        />
      </section>

      {data.canRecordPayment && <RecordPaymentPanel client={client} />}

      {!data.canRecordPayment && isTerminal && (
        <Notice tone="amber">Payments are closed for terminal clients.</Notice>
      )}

      <PaymentHistory payments={payments} />
      <RefundHistory refunds={refunds} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

function RecordPaymentPanel({ client }: { client: CrmClientVM }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Record payment</h2>
      <form action={recordClientPayment} className="mt-4 grid gap-3 md:grid-cols-3">
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="return_to" value="financials" />
        <NumberInput name="amount" label="Amount" min="0.01" step="0.01" required />
        <TextInput name="currency" label="Currency" defaultValue={client.currency || "PKR"} />
        <DateTimeInput name="paid_at" label="Paid at" required />
        <label className="space-y-1 text-xs font-medium text-gray-600">
          <span>Method</span>
          <select
            name="method"
            required
            defaultValue="bank_transfer"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="online">Online</option>
            <option value="other">Other</option>
          </select>
        </label>
        <TextInput name="reference" label="Reference" />
        <TextInput name="notes" label="Notes" />
        <div className="md:col-span-3">
          <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
            Record payment
          </button>
        </div>
      </form>
    </section>
  );
}

function PaymentHistory({ payments }: { payments: CrmClientPayment[] }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Payment history</h2>
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
                <Th>Recorded by</Th>
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
                  <Td>{payment.recorded_by_user_id ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RefundHistory({ refunds }: { refunds: CrmClientRefund[] }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Refund history</h2>
      {refunds.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No refunds recorded.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-md border border-gray-100">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Refunded at</Th>
                <Th>Amount</Th>
                <Th>Reason</Th>
                <Th>Recorded by</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {refunds.map((refund) => (
                <tr key={refund.id}>
                  <Td>{formatCrmDateTime(refund.refunded_at)}</Td>
                  <Td>{formatMoney(refund.amount, refund.currency)}</Td>
                  <Td>{refund.reason}</Td>
                  <Td>{refund.recorded_by_user_id ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
      <input
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
      />
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
      <input
        name={name}
        type="number"
        min={min}
        step={step}
        required={required}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
      />
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
      <input
        name={name}
        type="datetime-local"
        required={required}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
      />
    </label>
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
  tone: "green" | "red" | "amber";
}) {
  const classes =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-md border px-4 py-2 text-sm ${classes}`}>{children}</div>;
}
