import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCrmClientFinancialsPage } from "@/lib/db/crm";
import { PrintButton } from "@/components/PrintButton";

export default async function ClientInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCrmClientFinancialsPage(id);
  if (!data?.invoice) notFound();

  const { client, invoice, invoiceSteps } = data;
  const paidSteps = invoiceSteps.filter((step) => step.status === "paid");
  const detailRows = paidSteps.length > 0 ? paidSteps : invoiceSteps;
  const blankMainRows = Math.max(0, 4 - invoiceSteps.length);
  const blankDetailRows = Math.max(0, 2 - detailRows.length);

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-4 print:min-h-0 print:bg-white print:p-0">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
      `}</style>
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between print:hidden">
        <Link
          href={`/crm/clients/${client.id}/financials`}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        >
          Back to financials
        </Link>
        <PrintButton />
      </div>

      <section className="mx-auto max-w-[210mm] bg-white px-10 py-8 text-[12px] leading-tight text-gray-800 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="grid grid-cols-2 gap-8">
          <div>
            <h1 className="text-2xl font-normal text-gray-700">{invoice.office_name}</h1>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-gray-700">
              {invoice.office_address}
            </p>
            <p className="mt-1 text-[13px] text-gray-700">{invoice.office_phone}</p>
            <div className="mt-4 space-y-0.5 text-[13px] text-blue-700 underline">
              <p>{invoice.office_email}</p>
              <p>{invoice.office_website}</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <Image src="/brand/en-logo.jpeg" alt="EN Evernest Consultants" width={160} height={84} priority />
            <h2 className="mt-8 text-3xl font-bold tracking-wide text-black">INVOICE</h2>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-right text-[13px]">
              <dt className="font-bold text-black">Invoice No:</dt>
              <dd>{invoice.invoice_number}</dd>
              <dt className="font-bold text-black">Invoice Date:</dt>
              <dd>{formatDate(invoice.invoice_date)}</dd>
              <dt className="font-bold text-black">Due Date:</dt>
              <dd>{invoice.due_label}</dd>
            </dl>
          </div>
        </header>

        <section className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <h3 className="border-b border-gray-400 pb-1 text-[12px] font-bold uppercase text-blue-950">
              Bill To
            </h3>
            <p className="mt-2 text-[13px] font-bold text-black">
              {invoice.bill_to_name || client.lead_customer_name || client.lead_customer_phone}
            </p>
            <p className="mt-2 text-[13px]">{invoice.bill_to_location || "Karachi - Pakistan"}</p>
          </div>
        </section>

        <section className="mt-5">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="border border-gray-400 bg-gray-50 px-1.5 py-1 text-center text-gray-700" colSpan={2}>
                  DESCRIPTION
                </th>
                <th className="border border-gray-400 bg-gray-50 px-1.5 py-1 text-right text-gray-700">UNIT PRICE</th>
                <th className="border border-gray-400 bg-gray-50 px-1.5 py-1 text-right text-gray-700">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 px-1.5 py-1 font-bold" colSpan={2}>
                  File no - {invoice.file_number || client.client_code}
                </td>
                <td className="border border-gray-400 px-1.5 py-1 text-right" />
                <td className="border border-gray-400 px-1.5 py-1 text-right" />
              </tr>
              <tr>
                <td className="border border-gray-400 px-1.5 py-1 font-bold" colSpan={2}>
                  {invoice.package_title}
                </td>
                <td className="border border-gray-400 px-1.5 py-1 text-right font-bold">{invoice.currency}</td>
                <td className="border border-gray-400 px-1.5 py-1 text-right font-bold">{invoice.currency}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-1.5 py-1 font-bold">Total Package</td>
                <td className="border border-gray-400 px-1.5 py-1 text-center">1</td>
                <td className="border border-gray-400 px-1.5 py-1 text-right font-bold">
                  {formatNumber(data.invoiceSubtotal)}
                </td>
                <td className="border border-gray-400 px-1.5 py-1 text-right font-bold">
                  {formatNumber(data.invoiceSubtotal)}
                </td>
              </tr>
              {invoiceSteps.map((step) => {
                const amount = Number(step.quantity) * Number(step.unit_price);
                return (
                  <tr key={step.id}>
                    <td className="border border-gray-400 px-1.5 py-1">{step.description}</td>
                    <td className="border border-gray-400 px-1.5 py-1 text-center">{formatNumber(Number(step.quantity))}</td>
                    <td className="border border-gray-400 px-1.5 py-1 text-right">{formatNumber(Number(step.unit_price))}</td>
                    <td className="border border-gray-400 px-1.5 py-1 text-right">
                      {step.status === "paid"
                        ? formatNumber(amount)
                        : step.status === "waived"
                          ? "Waived"
                          : "-"}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="h-7 border border-gray-400 px-1.5 py-1" colSpan={2}>Assessment Fees</td>
                <td className="border border-gray-400 px-1.5 py-1" />
                <td className="border border-gray-400 px-1.5 py-1 text-right">Free</td>
              </tr>
              {Array.from({ length: blankMainRows }).map((_, index) => (
                <tr key={index}>
                  <td className="h-6 border border-gray-400 px-1.5 py-1" colSpan={2} />
                  <td className="border border-gray-400 px-1.5 py-1" />
                  <td className="border border-gray-400 px-1.5 py-1" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-5 grid grid-cols-[1.5fr_0.8fr] gap-10">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="border border-black px-1 py-1 text-left font-normal">Invoice Details</th>
                <th className="border border-black px-1 py-1 text-center font-normal">Status</th>
                <th className="border border-black px-1 py-1 text-right font-normal">Amount in {invoice.currency}</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((step) => (
                <tr key={step.id}>
                  <td className="border border-black px-1 py-1">{step.detail_label || `${invoice.invoice_number}-${step.line_order}`}</td>
                  <td className="border border-black px-1 py-1 text-center">{step.detail_status || formatLabel(step.status)}</td>
                  <td className="border border-black px-1 py-1 text-right">
                    {step.status === "paid"
                      ? formatNumber(Number(step.quantity) * Number(step.unit_price))
                      : "-"}
                  </td>
                </tr>
              ))}
              {Array.from({ length: blankDetailRows }).map((_, index) => (
                <tr key={index}>
                  <td className="h-6 border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1" />
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-[12px]">
            <div className="grid grid-cols-2 border-b border-gray-400 pb-2">
              <span className="font-bold uppercase text-gray-700">Subtotal</span>
              <span className="text-right font-bold text-black">{formatNumber(data.invoicePaidTotal)}</span>
            </div>
            <div className="mt-10 grid grid-cols-[1fr_auto] items-end gap-3 border-y-2 border-black py-2">
              <span className="text-lg font-bold text-gray-700">Balance Due - {invoice.currency}</span>
              <span className="text-lg font-bold text-black">{formatNumber(data.invoiceBalanceDue)}</span>
            </div>
          </div>
        </section>

        <footer className="mt-8">
          <h3 className="inline-block border-b border-gray-400 pr-20 text-[12px] font-bold">Terms & Instructions</h3>
          <p className="mt-1 text-[12px] text-gray-700">{invoice.terms}</p>
          <p className="mt-6 text-center text-[12px] font-bold italic text-gray-700">{invoice.footer_note}</p>
        </footer>
      </section>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Karachi",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+05:00`));
}

function formatNumber(amount: number): string {
  return amount.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
