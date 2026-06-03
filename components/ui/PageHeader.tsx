import { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  action,
  status,
}: {
  title: string;
  description?: string;
  breadcrumbs?: ReactNode;
  action?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {breadcrumbs && <div className="mb-1">{breadcrumbs}</div>}
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        {status && <div>{status}</div>}
        {action && <div>{action}</div>}
      </div>
    </header>
  );
}
