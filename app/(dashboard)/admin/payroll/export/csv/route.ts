import { NextResponse } from "next/server";
import { loadPayrollExportReport } from "@/lib/payroll/export-data";
import {
  parsePayrollExportFilters,
  payrollExportFilename,
  payrollReportToCsv,
} from "@/lib/payroll/export-ui";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parsePayrollExportFilters(url.searchParams);
  const { report } = await loadPayrollExportReport(filters);
  const csv = payrollReportToCsv(report);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${payrollExportFilename(report, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
}
