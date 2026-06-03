import { AlertCircle } from "lucide-react";

export function DangerZone({
  title,
  warningText,
  children,
}: {
  title: string;
  warningText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-red-600 flex-shrink-0" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-red-900">{title}</h2>
          <p className="mt-1 text-sm text-red-700">{warningText}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
