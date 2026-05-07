export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="truncate text-sm font-medium text-gray-500">Present Today</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">42</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="truncate text-sm font-medium text-gray-500">Late Today</p>
                <p className="mt-1 text-3xl font-semibold text-amber-600">3</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="truncate text-sm font-medium text-gray-500">Absent Today</p>
                <p className="mt-1 text-3xl font-semibold text-red-600">5</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="truncate text-sm font-medium text-gray-500">Remote Pending Review</p>
                <p className="mt-1 text-3xl font-semibold text-blue-600">7</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
