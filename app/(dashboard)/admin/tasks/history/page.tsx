import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/StatusChip";
import { DoneTasksHeatmap } from "@/components/DoneTasksHeatmap";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  dateRangeToTimestamps,
  endOfMonth,
  shortDatePKT,
  startOfMonth,
  startOfWeek,
  todayPKT,
} from "@/lib/attendance/format";
import {
  isSupabaseConfigured,
  listBranches,
  listDepartments,
  listEmployees,
} from "@/lib/db/queries";
import {
  listCompanyDoneTasks,
  type TaskRowVM,
} from "@/lib/db/tasks";

type Range = "this_week" | "last_week" | "this_month" | "last_month" | "last_8_weeks" | "all";
type HistoryView = "list" | "grid";
type GroupMode = "employee" | "branch" | "department";
type FilterValue = string | "all";
type EmployeeMeta = Awaited<ReturnType<typeof listEmployees>>[number];
type EnrichedTask = TaskRowVM & {
  employeeMeta: EmployeeMeta | null;
  branchGroupId: string;
  branchLabel: string;
  departmentGroupId: string;
  departmentLabel: string;
};
type TaskStack = {
  id: string;
  name: string;
  sublabel?: string;
  tasks: EnrichedTask[];
};

const RANGES: Array<{ key: Range; label: string }> = [
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_8_weeks", label: "Last 8 weeks" },
  { key: "all", label: "All time" },
];

const GROUPS: Array<{ key: GroupMode; label: string }> = [
  { key: "employee", label: "By employee" },
  { key: "branch", label: "By branch" },
  { key: "department", label: "By department/category" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function isMonthKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number.parseInt(value.slice(5, 7), 10);
  return month >= 1 && month <= 12;
}

function monthLabel(monthKey: string): string {
  const year = monthKey.slice(0, 4);
  const monthIndex = Number.parseInt(monthKey.slice(5, 7), 10) - 1;
  return `${MONTHS[monthIndex]} ${year}`;
}

function cleanFilter(value: string | undefined): FilterValue {
  return value && value !== "all" ? value : "all";
}

function resolveWindow(
  range: Range,
  today: string,
  selectedMonth: string | null
): { startIso: string; endIso: string; label: string } {
  if (selectedMonth) {
    const startIso = `${selectedMonth}-01`;
    const endIso = selectedMonth === today.slice(0, 7) ? today : endOfMonth(startIso);
    return { startIso, endIso, label: monthLabel(selectedMonth) };
  }

  if (range === "this_week") {
    return { startIso: startOfWeek(today), endIso: today, label: "This week" };
  }
  if (range === "last_week") {
    const thisMon = startOfWeek(today);
    return { startIso: addDays(thisMon, -7), endIso: addDays(thisMon, -1), label: "Last week" };
  }
  if (range === "this_month") {
    return { startIso: startOfMonth(today), endIso: today, label: "This month" };
  }
  if (range === "last_month") {
    const [y, m] = today.split("-").map((p) => Number.parseInt(p, 10));
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const startIso = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    return { startIso, endIso: endOfMonth(startIso), label: "Last month" };
  }
  if (range === "last_8_weeks") {
    const thisMon = startOfWeek(today);
    return { startIso: addDays(thisMon, -7 * 7), endIso: today, label: "Last 8 weeks" };
  }
  return { startIso: "1970-01-01", endIso: today, label: "All time" };
}

function historyHref({
  view,
  group,
  range,
  month,
  branch,
  department,
  employee,
}: {
  view: HistoryView;
  group: GroupMode;
  range?: Range;
  month?: string | null;
  branch?: FilterValue;
  department?: FilterValue;
  employee?: FilterValue;
}) {
  const params = new URLSearchParams({ view, group });
  if (month) params.set("month", month);
  else params.set("range", range ?? "this_month");
  if (branch && branch !== "all") params.set("branch", branch);
  if (department && department !== "all") params.set("department", department);
  if (employee && employee !== "all") params.set("employee", employee);
  return `/admin/tasks/history?${params.toString()}`;
}

function branchTaskId(task: TaskRowVM, employee: EmployeeMeta | null): string {
  return task.branch_id ?? employee?.branch_id ?? "unassigned";
}

function departmentTaskId(task: TaskRowVM, employee: EmployeeMeta | null): string {
  return task.department_id ?? employee?.department_id ?? "unassigned";
}

function enrichTasks(
  tasks: TaskRowVM[],
  employees: EmployeeMeta[]
): EnrichedTask[] {
  const employeeByUserId = new Map(employees.map((e) => [e.user_id, e]));

  return tasks.map((task) => {
    const employee = employeeByUserId.get(task.assigned_to) ?? null;
    const branchGroupId = branchTaskId(task, employee);
    const departmentGroupId = departmentTaskId(task, employee);

    return {
      ...task,
      employeeMeta: employee,
      branchGroupId,
      branchLabel:
        task.branch_code ??
        employee?.branch_code ??
        employee?.branch_name ??
        "Unassigned branch",
      departmentGroupId,
      departmentLabel:
        task.department_name ??
        employee?.department_name ??
        "Unassigned department/category",
    };
  });
}

function applyFilters(
  tasks: EnrichedTask[],
  filters: { branch: FilterValue; department: FilterValue; employee: FilterValue }
) {
  return tasks.filter((task) => {
    if (filters.employee !== "all" && task.assigned_to !== filters.employee) return false;
    if (filters.branch !== "all" && task.branchGroupId !== filters.branch) return false;
    if (filters.department !== "all" && task.departmentGroupId !== filters.department) return false;
    return true;
  });
}

function groupTasks(tasks: EnrichedTask[], mode: GroupMode): TaskStack[] {
  const groups = new Map<string, TaskStack>();
  for (const task of tasks) {
    const key =
      mode === "employee"
        ? task.assigned_to
        : mode === "branch"
          ? task.branchGroupId
          : task.departmentGroupId;
    const name =
      mode === "employee"
        ? task.assignee_name
        : mode === "branch"
          ? task.branchLabel
          : task.departmentLabel;
    const sublabel =
      mode === "employee"
        ? [task.assignee_email, task.branchLabel, task.departmentLabel]
            .filter(Boolean)
            .join(" · ")
        : undefined;

    const current = groups.get(key);
    if (current) {
      current.tasks.push(task);
    } else {
      groups.set(key, { id: key, name, sublabel, tasks: [task] });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const countDiff = b.tasks.length - a.tasks.length;
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name);
  });
}

export default async function AdminTasksHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    view?: string;
    month?: string;
    group?: string;
    branch?: string;
    department?: string;
    employee?: string;
  }>;
}) {
  const sp = await searchParams;
  const live = isSupabaseConfigured();
  const me = await getCurrentUser();
  if (live && me?.appUser.role !== "super_admin") {
    redirect("/dashboard?error=Super-admin%20access%20required");
  }

  const selectedMonth = isMonthKey(sp.month) ? sp.month : null;
  const range = (RANGES.find((r) => r.key === sp.range)?.key) ?? "this_month";
  const view: HistoryView = sp.view === "grid" ? "grid" : "list";
  const group = (GROUPS.find((g) => g.key === sp.group)?.key) ?? "employee";
  const filters = {
    branch: cleanFilter(sp.branch),
    department: cleanFilter(sp.department),
    employee: cleanFilter(sp.employee),
  };
  const today = todayPKT();
  const { startIso, endIso, label } = resolveWindow(range, today, selectedMonth);
  const { since, until } = dateRangeToTimestamps(startIso, endIso);
  const thisMonthRange = dateRangeToTimestamps(startOfMonth(today), today);

  const [companyTasks, thisMonthTasks, employees, branches, departments] =
    await Promise.all([
      listCompanyDoneTasks(since, until),
      listCompanyDoneTasks(thisMonthRange.since, thisMonthRange.until),
      listEmployees(),
      listBranches(),
      listDepartments(),
    ]);

  const enrichedTasks = enrichTasks(companyTasks, employees);
  const filteredTasks = applyFilters(enrichedTasks, filters);
  const employeeStacks = groupTasks(filteredTasks, "employee");
  const branchStacks = groupTasks(filteredTasks, "branch");
  const departmentStacks = groupTasks(filteredTasks, "department");
  const visibleStacks =
    group === "branch"
      ? branchStacks
      : group === "department"
        ? departmentStacks
        : employeeStacks;
  const top = employeeStacks.slice(0, 5);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Company Completed Tasks
          </h1>
          <p className="text-sm text-gray-500">
            Root-level completed task dashboard for {label.toLowerCase()} across all
            employees, branches, and departments/categories.{" "}
            <Link href="/tasks/history" className="text-blue-600 hover:text-blue-500">
              My completed tasks
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ViewTabs
            current={view}
            group={group}
            range={range}
            month={selectedMonth}
            filters={filters}
          />
          <RangeTabs current={range} view={view} group={group} filters={filters} />
        </div>
      </header>

      {!live && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mock mode (no Supabase env).
        </div>
      )}

      <MonthSelector
        today={today}
        selectedMonth={selectedMonth}
        view={view}
        group={group}
        filters={filters}
      />

      <FilterBar
        view={view}
        group={group}
        range={range}
        selectedMonth={selectedMonth}
        filters={filters}
        employees={employees}
        branches={branches}
        departments={departments}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Company done this month" value={thisMonthTasks.length} />
        <Stat label={`${label} total`} value={filteredTasks.length} />
        <Stat label="Branches represented" value={branchStacks.length} />
        <Stat label="Employees represented" value={employeeStacks.length} />
      </div>

      <SummaryGrid title="Branch-wise completed count" groups={branchStacks} />
      <SummaryGrid title="Employee-wise completed count" groups={employeeStacks} />
      <SummaryGrid title="Department/category completed count" groups={departmentStacks} />

      <TopPerformers top={top} />

      <GroupTabs
        current={group}
        view={view}
        range={range}
        month={selectedMonth}
        filters={filters}
      />

      {view === "grid" ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Company heatmap — {label}
          </h2>
          <p className="text-xs text-gray-500">
            Cells count completed tasks by assignee per week using the current
            company-level filters.
          </p>
          <DoneTasksHeatmap tasks={filteredTasks} endDate={endIso} weeks={8} />
        </section>
      ) : (
        <DoneTaskStack
          groups={visibleStacks}
          total={filteredTasks.length}
          label={label}
          group={group}
        />
      )}
    </div>
  );
}

function ViewTabs({
  current,
  group,
  range,
  month,
  filters,
}: {
  current: HistoryView;
  group: GroupMode;
  range: Range;
  month: string | null;
  filters: { branch: FilterValue; department: FilterValue; employee: FilterValue };
}) {
  const cls = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs ring-1 ring-inset ${
      active
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
    }`;
  return (
    <nav className="flex gap-2">
      <Link
        href={historyHref({ view: "list", group, range, month, ...filters })}
        className={cls(current === "list")}
      >
        List
      </Link>
      <Link
        href={historyHref({ view: "grid", group, range, month, ...filters })}
        className={cls(current === "grid")}
      >
        Heatmap
      </Link>
    </nav>
  );
}

function RangeTabs({
  current,
  view,
  group,
  filters,
}: {
  current: Range;
  view: HistoryView;
  group: GroupMode;
  filters: { branch: FilterValue; department: FilterValue; employee: FilterValue };
}) {
  return (
    <nav className="flex flex-wrap justify-end gap-2 text-xs">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={historyHref({ view, group, range: r.key, ...filters })}
          className={`rounded-md px-3 py-1 ring-1 ring-inset ${
            current === r.key
              ? "bg-blue-50 text-blue-700 ring-blue-200"
              : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

function MonthSelector({
  today,
  selectedMonth,
  view,
  group,
  filters,
}: {
  today: string;
  selectedMonth: string | null;
  view: HistoryView;
  group: GroupMode;
  filters: { branch: FilterValue; department: FilterValue; employee: FilterValue };
}) {
  const year = Number.parseInt((selectedMonth ?? today).slice(0, 4), 10);
  const currentMonth = today.slice(0, 7);

  return (
    <section className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">
            Company monthly done-task stack
          </h2>
          <p className="text-xs text-gray-500">
            Pick a month to review all completed task volume across the company.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={historyHref({ view, group, month: `${year - 1}-12`, ...filters })}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {year - 1}
          </Link>
          <span className="font-semibold text-gray-700">{year}</span>
          <Link
            href={historyHref({ view, group, month: `${year + 1}-01`, ...filters })}
            className="rounded-md bg-white px-3 py-1 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          >
            {year + 1}
          </Link>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6 lg:grid-cols-12">
        {MONTHS.map((month, index) => {
          const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
          const active = selectedMonth === monthKey || (!selectedMonth && monthKey === currentMonth);
          return (
            <Link
              key={monthKey}
              href={historyHref({ view, group, month: monthKey, ...filters })}
              className={`rounded-md px-3 py-2 text-center ring-1 ring-inset ${
                active
                  ? "bg-green-50 font-semibold text-green-700 ring-green-200"
                  : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {month}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function FilterBar({
  view,
  group,
  range,
  selectedMonth,
  filters,
  employees,
  branches,
  departments,
}: {
  view: HistoryView;
  group: GroupMode;
  range: Range;
  selectedMonth: string | null;
  filters: { branch: FilterValue; department: FilterValue; employee: FilterValue };
  employees: EmployeeMeta[];
  branches: Awaited<ReturnType<typeof listBranches>>;
  departments: Awaited<ReturnType<typeof listDepartments>>;
}) {
  return (
    <form
      action="/admin/tasks/history"
      className="grid gap-3 rounded-lg bg-white p-4 shadow ring-1 ring-black/5 lg:grid-cols-5"
    >
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="group" value={group} />
      {selectedMonth ? (
        <input type="hidden" name="month" value={selectedMonth} />
      ) : (
        <input type="hidden" name="range" value={range} />
      )}

      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>Branch</span>
        <select
          name="branch"
          defaultValue={filters.branch}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
        >
          <option value="all">All branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.code} — {branch.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>Department/category</span>
        <select
          name="department"
          defaultValue={filters.department}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
        >
          <option value="all">All departments/categories</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs font-medium text-gray-600">
        <span>Employee</span>
        <select
          name="employee"
          defaultValue={filters.employee}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
        >
          <option value="all">All employees</option>
          {employees.map((employee) => (
            <option key={employee.user_id} value={employee.user_id}>
              {employee.full_name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-2 lg:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Apply filters
        </button>
        <Link
          href={historyHref({ view, group, range, month: selectedMonth })}
          className="rounded-md bg-white px-4 py-2 text-sm text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

function GroupTabs({
  current,
  view,
  range,
  month,
  filters,
}: {
  current: GroupMode;
  view: HistoryView;
  range: Range;
  month: string | null;
  filters: { branch: FilterValue; department: FilterValue; employee: FilterValue };
}) {
  return (
    <nav className="flex flex-wrap gap-2 text-xs">
      {GROUPS.map((group) => (
        <Link
          key={group.key}
          href={historyHref({ view, group: group.key, range, month, ...filters })}
          className={`rounded-md px-3 py-1 ring-1 ring-inset ${
            current === group.key
              ? "bg-green-50 text-green-700 ring-green-200"
              : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          {group.label}
        </Link>
      ))}
    </nav>
  );
}

function SummaryGrid({ title, groups }: { title: string; groups: TaskStack[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No completed tasks in the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {groups.slice(0, 12).map((group) => (
            <div
              key={group.id}
              className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {group.name}
                  </p>
                  {group.sublabel && (
                    <p className="truncate text-xs text-gray-500">{group.sublabel}</p>
                  )}
                </div>
                <Chip label={`${group.tasks.length} done`} tone="green" />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TopPerformers({ top }: { top: TaskStack[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-700">Top performers</h2>
      {top.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No top performers in this range yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {top.map((person, index) => (
            <Stat
              key={person.id}
              label={`#${index + 1} ${person.name.split(" ")[0]}`}
              value={person.tasks.length}
              sublabel={person.name}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DoneTaskStack({
  groups,
  total,
  label,
  group,
}: {
  groups: TaskStack[];
  total: number;
  label: string;
  group: GroupMode;
}) {
  if (groups.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Completed task list</h2>
        <p className="rounded-md border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          No tasks completed in this range.
        </p>
      </section>
    );
  }

  const groupLabel =
    group === "employee"
      ? "employee"
      : group === "branch"
        ? "branch"
        : "department/category";

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">
          Completed task list grouped by {groupLabel} ({total})
        </h2>
        <p className="text-xs text-gray-500">
          Company-wide stack for {label.toLowerCase()}.
        </p>
      </div>

      <div className="space-y-4">
        {groups.map((stack) => (
          <section key={stack.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{stack.name}</h3>
                {stack.sublabel && (
                  <p className="text-xs text-gray-500">{stack.sublabel}</p>
                )}
              </div>
              <span className="text-xs tabular-nums text-gray-500">
                {stack.tasks.length} completed
              </span>
            </div>
            <ol className="space-y-2">
              {stack.tasks.map((task) => (
                <DoneRow key={task.id} task={task} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-green-700">
        {value}
      </p>
      {sublabel && (
        <p className="mt-1 truncate text-xs text-gray-500">{sublabel}</p>
      )}
    </div>
  );
}

function priorityTone(priority: string) {
  if (priority === "urgent") return "red" as const;
  if (priority === "low") return "gray" as const;
  return "blue" as const;
}

function formatDue(task: EnrichedTask): string {
  if (!task.due_time) return shortDatePKT(task.due_date);
  return `${shortDatePKT(task.due_date)} ${task.due_time.slice(0, 5)}`;
}

function DoneRow({ task }: { task: EnrichedTask }) {
  const completedDay = task.completed_at?.slice(0, 10) ?? task.due_date;
  const completedTime = task.completed_at?.slice(11, 16);
  return (
    <li className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{task.title}</span>
            <Chip label={task.priority} tone={priorityTone(task.priority)} />
            <Chip label="done" tone="green" />
            {task.requires_approval && <Chip label="approval-required" tone="blue" />}
            {task.requires_approval && task.approved_by && (
              <Chip label="approved" tone="green" />
            )}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{task.assignee_name}</span>
            {" · "}
            {task.branchLabel}
            {" · "}
            {task.departmentLabel}
            {" · completed "}
            {shortDatePKT(completedDay)}
            {completedTime && ` ${completedTime}`}
            {" · due "}
            {formatDue(task)}
            {" · assigned by "}
            {task.assigner_name}
          </div>
          {task.description && (
            <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-gray-600">
              {task.description}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
