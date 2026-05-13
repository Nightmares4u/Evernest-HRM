import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listCrmCampaignSources,
  listCrmRawInbox,
  listCrmWhatsappNumbers,
} from "@/lib/db/crm";

type Search = { error?: string; ok?: string };

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin%20access%20required");
  }

  const [numbers, sources, inbox] = await Promise.all([
    listCrmWhatsappNumbers(),
    listCrmCampaignSources(),
    listCrmRawInbox(),
  ]);
  const activeNumbers = numbers.filter((number) => number.is_active).length;
  const activeSources = sources.filter((source) => source.is_active).length;
  const needsReview = inbox.filter((row) => row.needs_review).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">CRM admin</h1>
          <p className="text-sm text-gray-500">
            Stage 1 setup for source mapping and raw WhatsApp intake testing.
          </p>
        </div>
        <Link
          href="/crm/inbox"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open raw inbox
        </Link>
      </header>

      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {sp.ok && <Notice tone="green">{sp.ok}</Notice>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminCard
          title="WhatsApp Numbers"
          href="/admin/crm/whatsapp-numbers"
          value={`${activeNumbers}/${numbers.length}`}
          hint="Active mappings"
        />
        <AdminCard
          title="Campaign Sources"
          href="/admin/crm/campaign-sources"
          value={`${activeSources}/${sources.length}`}
          hint="Active source mappings"
        />
        <AdminCard
          title="Raw Inbox"
          href="/crm/inbox"
          value={inbox.length}
          hint={`${needsReview} need review`}
        />
        <AdminCard
          title="Assignment Rules later"
          href="/admin/crm"
          value="Pending"
          hint="Phase 2 does not assign leads"
          disabled
        />
      </section>

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Stage 1 status</h2>
            <p className="mt-1 text-sm text-gray-500">
              Phase 2 creates admin configuration screens, raw inbox visibility,
              and manual mock intake. Real WhatsApp API, parser, auto-assignment,
              and Gemini integration remain pending.
            </p>
          </div>
          <Chip label="Phase 2 foundation" tone="indigo" />
        </div>
      </section>
    </div>
  );
}

function AdminCard({
  title,
  href,
  value,
  hint,
  disabled = false,
}: {
  title: string;
  href: string;
  value: string | number;
  hint: string;
  disabled?: boolean;
}) {
  const content = (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {disabled && <Chip label="later" tone="gray" />}
      </div>
      <div className="mt-4 text-2xl font-semibold text-gray-900">{value}</div>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );

  if (disabled) return content;
  return (
    <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-sm">
      {content}
    </Link>
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
