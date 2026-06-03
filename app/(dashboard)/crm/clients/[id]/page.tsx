import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRightLeft,
  Circle,
  CheckCircle2,
  CreditCard,
  FileText,
  Flag,
  GraduationCap,
  Plane,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatCrmDateTime } from "@/lib/crm/format";
import {
  getCrmClientDetail,
  getCrmClientForVisaPage,
  listCrmClientApplications,
  listCrmClientDocuments,
} from "@/lib/db/crm";
import type {
  CrmClientPayment,
  CrmClientStatus,
} from "@/lib/types/crm";

import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, Td } from "@/components/ui/DataTable";
import { LifecycleTabs } from "@/components/ui/LifecycleTabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  ActivityTimeline,
  type TimelineItem,
  type TimelineTone,
} from "@/components/ui/ActivityTimeline";

type Search = { error?: string; ok?: string };

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

const NEXT_ACTION: Record<CrmClientStatus, string> = {
  onboarding: "Collect and verify the client's required documents.",
  doc_review: "Review the documents awaiting approval.",
  uni_selection: "Shortlist universities and open applications.",
  applying: "Submit applications and track decisions.",
  offer_in_hand: "Review offers with the client and accept one.",
  offer_accepted: "Begin visa preparation.",
  visa_prep: "Complete the required visa milestones, then submit the file.",
  visa_submitted: "Await the embassy decision.",
  visa_decision: "Record the embassy's visa decision.",
  pre_departure: "Finalise flight, accommodation and pre-departure briefing.",
  departed: "Confirm arrival and mark the client as alumni.",
  alumni: "Lifecycle complete — client is an alumnus.",
  withdrawn_refunded: "Client withdrawn and refunded — terminal state.",
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
  const visaMilestonesRemaining =
    visaData?.isBlockedFromVisaSubmitted.missing.length ?? 0;
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

  const isTerminal =
    client.status === "alumni" || client.status === "withdrawn_refunded";

  const timelineItems: TimelineItem[] = activities.map((activity) => {
    const visual = activityVisual(activity.activity_type);
    return {
      id: activity.id,
      title: formatLabel(activity.activity_type),
      description: activity.description,
      at: formatCrmDateTime(activity.created_at),
      icon: visual.icon,
      tone: visual.tone,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.client_code}
        description={client.lead_customer_name || client.lead_customer_phone}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "CRM clients", href: "/crm/clients" },
              { label: client.client_code },
            ]}
          />
        }
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`/crm/leads/${client.lead_id}`}
              className="text-sm font-medium text-blue-700 transition-colors hover:text-blue-900"
            >
              Back to lead
            </Link>
            <StatusBadge label={formatLabel(client.status)} tone={STATUS_TONES[client.status]} />
          </div>
        }
      />

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4 ${
          isTerminal ? "border-gray-200 bg-gray-50" : "border-blue-100 bg-blue-50/60"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
              isTerminal ? "bg-gray-200 text-gray-600" : "bg-blue-900 text-white"
            }`}
          >
            <Flag className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Next required action
            </p>
            <p className="text-sm font-medium text-gray-900">{NEXT_ACTION[client.status]}</p>
          </div>
        </div>
        <StatusBadge label={formatLabel(client.status)} tone={STATUS_TONES[client.status]} />
      </div>

      <LifecycleTabs tabs={tabs} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Client shell"
            description="Phase 2A read-only client record created from a converted lead."
          >
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </SectionCard>

          <Payments payments={payments} />
        </div>

        <div className="lg:col-span-1">
          <SectionCard
            title="Activity timeline"
            description={`${activities.length} event${activities.length === 1 ? "" : "s"}`}
          >
            <div className="mt-4">
              <ActivityTimeline items={timelineItems} />
            </div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}

function Payments({ payments }: { payments: CrmClientPayment[] }) {
  if (payments.length === 0) {
    return (
      <SectionCard title="Payments">
        <p className="mt-2 text-sm text-gray-500">No payments recorded yet.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Payments" description={`${payments.length} recorded`}>
      <div className="mt-4">
        <DataTable columns={["Paid at", "Amount", "Method", "Reference", "Notes"]}>
          {payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-gray-50">
              <Td>{formatCrmDateTime(payment.paid_at)}</Td>
              <Td className="font-medium text-gray-900">{formatMoney(payment.amount, payment.currency)}</Td>
              <Td>{payment.method ?? "-"}</Td>
              <Td>{payment.reference ?? "-"}</Td>
              <Td>{payment.notes ?? "-"}</Td>
            </tr>
          ))}
        </DataTable>
      </div>
    </SectionCard>
  );
}

function activityVisual(type: string): {
  icon: React.ReactNode;
  tone: TimelineTone;
} {
  const t = type.toLowerCase();
  if (t.includes("payment") || t.includes("refund"))
    return { icon: <CreditCard className="h-4 w-4" />, tone: "green" };
  if (t.includes("document") || t.includes("doc"))
    return { icon: <FileText className="h-4 w-4" />, tone: "blue" };
  if (t.includes("application") || t.includes("offer") || t.includes("uni"))
    return { icon: <GraduationCap className="h-4 w-4" />, tone: "amber" };
  if (t.includes("visa"))
    return { icon: <Plane className="h-4 w-4" />, tone: "teal" };
  if (t.includes("transfer") || t.includes("assign"))
    return { icon: <ArrowRightLeft className="h-4 w-4" />, tone: "amber" };
  if (t.includes("withdraw") || t.includes("alumni") || t.includes("depart") || t.includes("closure"))
    return { icon: <Flag className="h-4 w-4" />, tone: "gray" };
  if (t.includes("status") || t.includes("convert") || t.includes("created"))
    return { icon: <CheckCircle2 className="h-4 w-4" />, tone: "blue" };
  return { icon: <Circle className="h-3 w-3" />, tone: "gray" };
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-900">{value}</dd>
    </div>
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
  tone: "green" | "red";
}) {
  const classes =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-md border px-4 py-3 text-sm shadow-sm ${classes}`}>{children}</div>;
}
