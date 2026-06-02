import { Chip } from "@/components/StatusChip";
import { redirect } from "next/navigation";
import {
  isSupabaseConfigured,
  listLeaveRequestsForAdmin,
  type LeaveRequestAdminRow,
} from "@/lib/db/queries";
import {
  approveLeaveRequest,
  rejectLeaveRequest,
} from "@/app/(dashboard)/leave/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isBranchManagerOrAboveRole } from "@/lib/auth/permissions";

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; filter?: string }>;
}) {
  const { error, ok, filter: filterParam } = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isBranchManagerOrAboveRole(me.appUser.role)) {
    redirect("/dashboard?error=Manager access required");
  }
  const filter = filterParam === "all" ? "all" : "pending";
  const live = isSupabaseConfigured();
  const requests = await listLeaveRequestsForAdmin(filter);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Leave admin</h1>
          <p className="text-sm text-gray-500">
            Review and act on leave requests. Each action writes to the audit log.
          </p>
        </div>
        <nav className="flex gap-2 text-xs">
          <a
            href="/admin/leave?filter=pending"
            className={`rounded-md px-3 py-1 ring-1 ring-inset ${
              filter === "pending"
                ? "bg-blue-50 text-blue-700 ring-blue-200"
                : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            Pending
          </a>
          <a
            href="/admin/leave?filter=all"
            className={`rounded-md px-3 py-1 ring-1 ring-inset ${
              filter === "all"
                ? "bg-blue-50 text-blue-700 ring-blue-200"
                : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            All
          </a>
        </nav>
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
          Mock mode (no Supabase env).
        </div>
      )}

      <div className="space-y-3">
        {requests.map((r) => (
          <RequestCard key={r.id} r={r} />
        ))}
        {requests.length === 0 && (
          <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            {filter === "pending"
              ? "No pending requests. Nothing to review."
              : "No leave requests on file."}
          </div>
        )}
      </div>
    </div>
  );
}

function RequestCard({ r }: { r: LeaveRequestAdminRow }) {
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
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-gray-900">
            {r.employee_full_name}{" "}
            <span className="ml-1 text-xs text-gray-500">
              {r.branch_code ?? "—"}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-700">
            {r.start_date} → {r.end_date}{" "}
            <span className="text-gray-500">
              ({r.days_count} working day{r.days_count === 1 ? "" : "s"})
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Submitted {new Date(r.created_at).toLocaleDateString("en-GB")}
            {r.reviewed_at && (
              <> &middot; reviewed {new Date(r.reviewed_at).toLocaleDateString("en-GB")}</>
            )}
          </div>
          {r.reason && (
            <div className="mt-2 rounded bg-gray-50 p-2 text-sm text-gray-700">
              {r.reason}
            </div>
          )}
          {r.review_note && (
            <div className="mt-2 text-xs text-gray-500">
              Review note: <span className="text-gray-700">{r.review_note}</span>
            </div>
          )}
        </div>
        <Chip label={status} tone={tone} />
      </div>

      {r.status === "pending" && (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <form action={approveLeaveRequest} className="rounded-md border border-green-200 bg-green-50/40 p-3">
            <input type="hidden" name="id" value={r.id} />
            <label className="block text-xs font-medium text-green-800">
              Approve note (optional)
            </label>
            <input
              type="text"
              name="note"
              className="mt-1 block w-full rounded-md border border-green-200 bg-white px-2 py-1 text-sm"
              placeholder="e.g. covered by Komal"
            />
            <button
              type="submit"
              className="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500"
            >
              Approve
            </button>
          </form>

          <form action={rejectLeaveRequest} className="rounded-md border border-red-200 bg-red-50/40 p-3">
            <input type="hidden" name="id" value={r.id} />
            <label className="block text-xs font-medium text-red-800">
              Reject reason (recommended)
            </label>
            <input
              type="text"
              name="note"
              className="mt-1 block w-full rounded-md border border-red-200 bg-white px-2 py-1 text-sm"
              placeholder="e.g. peak season — please rebook"
            />
            <button
              type="submit"
              className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
            >
              Reject
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
