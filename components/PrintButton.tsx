"use client";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 print:hidden"
    >
      {label}
    </button>
  );
}
