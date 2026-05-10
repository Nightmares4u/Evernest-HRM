import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

const ENDPOINTS = [
  {
    title: "Daily auto-absent close",
    path: "/api/cron/close-attendance-day",
    params: "?date=2026-05-09",
    schedule: "Daily after office close. Default target is yesterday in PKT.",
  },
  {
    title: "Monthly leave accrual",
    path: "/api/cron/accrue-monthly-leave",
    params: "?year=2026&month=5",
    schedule: "First day of each month, early morning PKT.",
  },
  {
    title: "Recurring task generation",
    path: "/api/cron/generate-recurring-tasks",
    params: "?date=2026-05-09",
    schedule: "Daily before office opens. Default target is today in PKT.",
  },
];

export default async function CronAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin access required");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500">
            <Link href="/admin" className="text-indigo-600 hover:text-indigo-500">
              Admin
            </Link>{" "}
            / Cron
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Scheduled maintenance
          </h1>
          <p className="text-sm text-gray-500">
            Manual test endpoints for HRM maintenance jobs. Requests require
            `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`.
          </p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {ENDPOINTS.map((endpoint) => (
          <article
            key={endpoint.path}
            className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5"
          >
            <h2 className="text-sm font-semibold text-gray-900">
              {endpoint.title}
            </h2>
            <p className="mt-2 text-xs text-gray-500">{endpoint.schedule}</p>
            <code className="mt-4 block rounded-md bg-gray-950 px-3 py-2 text-xs text-gray-100">
              curl -X POST &quot;http://localhost:3000{endpoint.path}
              {endpoint.params}&quot; -H &quot;Authorization: Bearer
              $CRON_SECRET&quot;
            </code>
          </article>
        ))}
      </section>
    </div>
  );
}
