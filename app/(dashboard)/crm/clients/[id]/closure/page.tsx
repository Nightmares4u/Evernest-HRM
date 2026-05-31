import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import { getCrmClientForClosurePage } from "@/lib/db/crm";
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

  const data = await getCrmClientForClosurePage(id);
  if (!data) notFound();

  const { client, visaDecisions, refunds } = data;
  const canWithdrawFromStatus =
    client.status !== "alumni" && client.status !== "withdrawn_refunded";
  const canRecordRefundForStatus =
    data.canRecordRefund && client.status === "withdrawn_refunded";

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
            <span className="text-sm text-gray-500">Closure</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Closure</h1>
          <p className="text-sm text-gray-500">
            {client.lead_customer_name || client.lead_customer_phone}
          </p>
        </div>
        <Chip label={formatLabel(client.status)} tone={CLIENT_STATUS_TONES[client.status]} />
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

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
        <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Closure status</h2>
          <p className="mt-2 text-sm text-gray-500">
            Closure controls become available after a granted visa decision moves the client to
            pre-departure. Withdrawals are still available to super admins before terminal closure.
          </p>
        </section>
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
    <section className="space-y-4">
      <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-900">Pre-departure details</h2>
        {flightDateIsPast ? (
          <Notice tone="amber">Flight date is in the past. This is a soft warning only.</Notice>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            Flight date should be in the future when submitted. This is a soft warning only.
          </p>
        )}
        {canTransitionStatus ? (
          <form action={updatePreDepartureFieldsAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="client_id" value={client.id} />
            <DateTimeInput name="flight_date" label="Flight date" value={client.flight_date} />
            <DateTimeInput
              name="briefing_completed_at"
              label="Briefing completed"
              value={client.briefing_completed_at}
            />
            <TextArea
              name="flight_details"
              label="Flight details"
              value={client.flight_details}
            />
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
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <div className="md:col-span-2">
              <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                Save pre-departure details
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            Only the assigned counselor or super admin can update pre-departure details.
          </p>
        )}
      </div>

      {canTransitionStatus && (
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Mark departed</h2>
          <form action={markDepartedAction} className="mt-4 grid gap-3 md:grid-cols-[14rem_1fr_auto]">
            <input type="hidden" name="client_id" value={client.id} />
            <DateInput name="departure_date" label="Departure date" required />
            <TextInput name="note" label="Note" />
            <div className="flex items-end">
              <button className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
                Mark departed
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
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
    <section className="space-y-4">
      <SummaryCard title="Departure summary" client={client} />
      {canTransitionStatus && (
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">Confirm arrival and mark alumni</h2>
          <form action={markAlumniAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="client_id" value={client.id} />
            <DateInput name="arrival_date" label="Arrival date" />
            <label className="space-y-1 text-xs font-medium text-gray-600 md:col-span-2">
              <span>Alumni notes</span>
              <textarea
                name="alumni_notes"
                rows={3}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <div className="md:col-span-2">
              <button className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
                Mark alumni
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function AlumniPanel({ client }: { client: CrmClientVM }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Alumni summary</h2>
        <Chip label="Closure complete" tone="green" />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Departed" value={formatCrmDateTime(client.departure_date)} />
        <Info label="Arrived" value={formatCrmDateTime(client.arrival_date)} />
        <Info label="Alumni started" value={formatCrmDateTime(client.alumni_started_at)} />
        <Info label="Alumni notes" value={client.alumni_notes ?? "-"} />
      </dl>
    </section>
  );
}

function WithdrawnPanel({ client }: { client: CrmClientVM }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Withdrawal summary</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Withdrawn at" value={formatCrmDateTime(client.withdrawn_at)} />
        <Info label="Reason" value={client.withdrawn_reason ?? "-"} />
      </dl>
    </section>
  );
}

function WithdrawPanel({ clientId }: { clientId: string }) {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-5">
      <h2 className="text-sm font-semibold text-red-900">Withdraw client</h2>
      <p className="mt-2 text-sm text-red-700">
        This is a one-way action for Stage 2. Re-opening withdrawn clients is out of scope.
      </p>
      <form action={withdrawClientAction} className="mt-4 grid gap-3 md:grid-cols-3">
        <input type="hidden" name="client_id" value={clientId} />
        <label className="space-y-1 text-xs font-medium text-red-900 md:col-span-3">
          <span>Reason</span>
          <textarea
            name="reason"
            required
            rows={3}
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <NumberInput name="refund_amount" label="Refund amount" min="0.01" step="0.01" />
        <TextInput name="refund_currency" label="Refund currency" defaultValue="PKR" />
        <div className="flex items-end">
          <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
            Withdraw client
          </button>
        </div>
      </form>
    </section>
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

      {canRecordRefund && (
        <form action={recordClientRefundAction} className="mt-5 grid gap-3 md:grid-cols-[12rem_10rem_1fr_auto]">
          <input type="hidden" name="client_id" value={clientId} />
          <NumberInput name="amount" label="Amount" min="0.01" step="0.01" required />
          <TextInput name="currency" label="Currency" defaultValue="PKR" />
          <TextInput name="reason" label="Reason" required />
          <div className="flex items-end">
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
              Record refund
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function VisaDecisionSummary({ decisions }: { decisions: CrmClientVisaDecision[] }) {
  if (decisions.length === 0) return null;
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">Visa decisions</h2>
      <ul className="mt-4 divide-y divide-gray-100">
        {decisions.map((decision) => (
          <li key={decision.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <div className="font-medium text-gray-900">
                {CRM_CLIENT_VISA_DECISION_LABELS[decision.outcome]}
              </div>
              <div className="text-xs text-gray-500">{formatCrmDateTime(decision.decided_at)}</div>
              {decision.note && <div className="mt-1 text-sm text-gray-600">{decision.note}</div>}
            </div>
            <Chip label={CRM_CLIENT_VISA_DECISION_LABELS[decision.outcome]} tone={visaDecisionTone(decision.outcome)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SummaryCard({ title, client }: { title: string; client: CrmClientVM }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Flight date" value={formatCrmDateTime(client.flight_date)} />
        <Info label="Flight details" value={client.flight_details ?? "-"} />
        <Info label="Accommodation" value={client.accommodation_details ?? "-"} />
        <Info label="Briefing completed" value={formatCrmDateTime(client.briefing_completed_at)} />
        <Info label="Briefing notes" value={client.briefing_notes ?? "-"} />
        <Info label="Departure date" value={formatCrmDateTime(client.departure_date)} />
      </dl>
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
      <textarea
        name={name}
        rows={3}
        defaultValue={value ?? ""}
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
      <input
        name={name}
        type="date"
        required={required}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
      />
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
      <input
        name={name}
        type="datetime-local"
        defaultValue={dateTimeInputValue(value)}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
      />
    </label>
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

function dateTimeInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function visaDecisionTone(
  outcome: CrmClientVisaDecisionOutcome
): "green" | "amber" | "red" | "blue" | "gray" | "indigo" | "yellow" | "teal" {
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
  return <div className={`rounded-md border px-4 py-2 text-sm ${classes}`}>{children}</div>;
}
