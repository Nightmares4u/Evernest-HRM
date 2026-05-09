import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { addHoliday, deleteHoliday } from "@/app/(dashboard)/admin/holidays/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { shortDatePKT, todayPKT } from "@/lib/attendance/format";
import { listBranches } from "@/lib/db/queries";
import { listHolidays } from "@/lib/db/payroll";

type Search = { error?: string; ok?: string };

function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 10);
}

export default async function AdminHolidaysPage({
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

  const today = todayPKT();
  const [branches, holidays] = await Promise.all([
    listBranches(),
    listHolidays(addMonths(today.slice(0, 7) + "-01", -2), addMonths(today.slice(0, 7) + "-01", 12)),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Paid holidays</h1>
          <p className="text-sm text-gray-500">
            Manual holiday control for payroll scheduled working days. Sundays are
            excluded automatically.
          </p>
        </div>
        <Link
          href="/admin/payroll"
          className="rounded-md bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Payroll preview
        </Link>
      </header>

      {sp.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {sp.error}
        </div>
      )}
      {sp.ok && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {sp.ok}
        </div>
      )}

      <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
        <h2 className="text-sm font-semibold text-gray-700">Add holiday</h2>
        <form action={addHoliday} className="mt-4 grid gap-3 lg:grid-cols-6">
          <label className="space-y-1 text-xs font-medium text-gray-600 lg:col-span-2">
            <span>Name</span>
            <input
              name="name"
              required
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              placeholder="Eid holiday"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Start date</span>
            <input
              type="date"
              name="start_date"
              required
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>End date optional</span>
            <input
              type="date"
              name="end_date"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span>Branch optional</span>
            <select
              name="branch_id"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">No branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} — {branch.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-4 text-xs text-gray-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="is_paid"
                defaultChecked
                className="rounded border-gray-300"
              />
              Paid holiday
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="company_wide"
                defaultChecked
                className="rounded border-gray-300"
              />
              Company-wide
            </label>
          </div>
          <p className="text-xs text-gray-500 lg:col-span-6">
            Leave end date blank for one day. If set, every date from start to end
            is added as a paid holiday entry.
          </p>
          <label className="space-y-1 text-xs font-medium text-gray-600 lg:col-span-5">
            <span>Notes</span>
            <input
              name="notes"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              placeholder="Optional admin note"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Add holiday
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Holiday list</h2>
        {holidays.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            No holidays recorded yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Name</Th>
                  <Th>Scope</Th>
                  <Th>Paid</Th>
                  <Th>Notes</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays.map((holiday) => (
                  <tr key={holiday.id} className="hover:bg-gray-50">
                    <Td className="font-medium text-gray-900">
                      {shortDatePKT(holiday.date)}
                    </Td>
                    <Td>{holiday.name}</Td>
                    <Td>
                      {holiday.company_wide ? (
                        <Chip label="company-wide" tone="green" />
                      ) : (
                        <Chip
                          label={holiday.branch_code ?? holiday.branch_name ?? "branch"}
                          tone="indigo"
                        />
                      )}
                    </Td>
                    <Td>
                      <Chip
                        label={holiday.is_paid ? "paid" : "unpaid"}
                        tone={holiday.is_paid ? "green" : "gray"}
                      />
                    </Td>
                    <Td className="max-w-xs truncate text-gray-500">
                      {holiday.notes ?? "—"}
                    </Td>
                    <Td className="text-right">
                      <form action={deleteHoliday}>
                        <input type="hidden" name="id" value={holiday.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-red-600 hover:text-red-500"
                        >
                          Remove
                        </button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
