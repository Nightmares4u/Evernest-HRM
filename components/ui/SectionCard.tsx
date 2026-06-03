export function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      {(title || description || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
