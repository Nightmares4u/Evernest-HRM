import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex-shrink-0">
        <div className="flex h-16 items-center justify-center border-b px-4">
          <h1 className="text-xl font-bold text-gray-800">EN HRM</h1>
        </div>
        <nav className="mt-6 flex flex-col space-y-1 px-4">
          <Link
            href="/dashboard"
            className="flex items-center rounded-md px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Dashboard
          </Link>
          <Link
            href="/attendance"
            className="flex items-center rounded-md px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Attendance
          </Link>
          <Link
            href="/employees"
            className="flex items-center rounded-md px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Employees
          </Link>
          <Link
            href="/admin"
            className="flex items-center rounded-md px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Admin
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white shadow-sm h-16 flex items-center px-8">
          <div className="ml-auto flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Mock User</span>
            <Link href="/login" className="text-sm text-red-600 hover:text-red-800">
              Logout
            </Link>
          </div>
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
