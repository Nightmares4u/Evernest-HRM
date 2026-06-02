import { Chip, StatusChip } from "@/components/StatusChip";
import { isSupabaseConfigured } from "@/lib/db/queries";
import {
  getMyLeaveBalanceThisMonth,
  listMyLeaveRequests,
  type MyLeaveRequestRow,
} from "@/lib/db/queries";
import { submitLeaveRequest } from "./actions";
import { todayPKT } from "@/lib/attendance/format";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const live = isSupabaseConfigured();
  const [balance, requests] = await Promise.all([
    getMyLeaveBalanceThisMonth(),
    listMyLeaveRequests(),
  ]);

  const today = todayPKT();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Leave</h1>
        <p className="text-sm text-gray-500">
          Request paid leave and review your history.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {ok}
        </div>
      )}

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock mode (no Supabase env). Submitting a request won't persist.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-700">
            This month's balance
          </h2>
          {balance ? (
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-gray-500">Accrued</dt>
              <dd className="text-right font-medium tabular-nums">{balance.accrued}</dd>
              <dt className="text-gray-500">Carry-forward in</dt>
              <dd className="text-right font-medium tabular-nums">
                {balance.carry_forward_in}
              </dd>
              <dt className="text-gray-500">Used</dt>
              <dd className="text-right font-medium tabular-nums">{balance.used}</dd>
              <dt className="border-t pt-1 text-gray-700">Balance</dt>
              <dd className="border-t pt-1 text-right text-lg font-semibold tabular-nums text-gray-900">
                {balance.balance}
              </dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              No balance row this month yet — accrual cron hasn't created one,
              and you have no approved leave so far.
            </p>
          )}
        </section>

        <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700">Request leave</h2>
          <form action={submitLeaveRequest} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Start date">
              <input
                type="date"
                name="start_date"
                min={today}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                name="end_date"
                min={today}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Reason (optional)">
                <textarea
                  name="reason"
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Family event, medical, …"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                Submit request
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Sundays don't count toward the day total. Admin will review.
              </p>
            </div>
          </form>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Your requests</h2>
        <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Submitted</Th>
                <Th>Range</Th>
                <Th className="text-right">Days</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th>Review</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {requests.map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                    No requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RequestRow({ r }: { r: MyLeaveRequestRow }) {
  const status = r.status;
  const tone =
    status === "approved"
      ? "green"
      : status === "rejected"
        ? "red"
        : status === "cancelled"
          ? "gray"
          : "yellow";
  return (
    <tr className="hover:bg-gray-50">
      <Td className="text-xs text-gray-500">
        {new Date(r.created_at).toLocaleDateString("en-GB")}
      </Td>
      <Td>
        {r.start_date} → {r.end_date}
      </Td>
      <Td className="text-right tabular-nums">{r.days_count}</Td>
      <Td className="text-xs text-gray-600">{r.reason ?? "—"}</Td>
      <Td>
        <Chip label={status} tone={tone} />
      </Td>
      <Td className="text-xs text-gray-600">
        {r.review_note ?? (r.reviewed_at ? "—" : "(not reviewed)")}
      </Td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm text-gray-700 ${className}`}>{children}</td>;
}

// Hint to suppress "unused StatusChip import" if linter complains; keep available.
void StatusChip;
