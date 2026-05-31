import { createAdminClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/db/queries";
import type { CrmClientPayment, CrmClientRefund } from "@/lib/types/crm";

// PKR-only MVP. Currency support is deferred — if non-PKR rows appear we
// surface a warning and skip them from totals (rather than silently
// summing mixed currencies). See memory/projects/crm/CRM_BOARD.md.
export const ADMIN_FINANCIALS_BASE_CURRENCY = "PKR";

export type AdminPaymentRow = CrmClientPayment & {
  client_code: string;
  customer_name: string | null;
  branch_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
  assigned_agent_id: string | null;
  agent_name: string | null;
  recorder_name: string | null;
};

export type AdminRefundRow = CrmClientRefund & {
  client_code: string;
  customer_name: string | null;
  branch_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
  assigned_agent_id: string | null;
  agent_name: string | null;
  recorder_name: string | null;
};

export type AdminFinancialsMonthly = {
  monthKey: string;
  monthStartUtc: string;
  monthEndUtc: string;
  payments: AdminPaymentRow[];
  refunds: AdminRefundRow[];
  pkrReceived: number;
  pkrRefunded: number;
  pkrNetInflow: number;
  skippedNonPkrPayments: number;
  skippedNonPkrRefunds: number;
  nonPkrCurrencies: string[];
};

export type AdminFinancialsAllTime = {
  pkrReceived: number;
  pkrRefunded: number;
  pkrNetInflow: number;
  skippedNonPkrPayments: number;
  skippedNonPkrRefunds: number;
  nonPkrCurrencies: string[];
};

type PaymentJoinedRow = CrmClientPayment & {
  client:
    | {
        client_code: string;
        branch_id: string | null;
        assigned_agent_id: string | null;
        lead: { customer_name: string | null } | { customer_name: string | null }[] | null;
        assigned_agent:
          | { full_name: string | null }
          | { full_name: string | null }[]
          | null;
        branch:
          | { code: string | null; name: string | null }
          | { code: string | null; name: string | null }[]
          | null;
      }
    | {
        client_code: string;
        branch_id: string | null;
        assigned_agent_id: string | null;
        lead: { customer_name: string | null } | { customer_name: string | null }[] | null;
        assigned_agent:
          | { full_name: string | null }
          | { full_name: string | null }[]
          | null;
        branch:
          | { code: string | null; name: string | null }
          | { code: string | null; name: string | null }[]
          | null;
      }[]
    | null;
  recorder:
    | { display_name: string | null; email: string | null }
    | { display_name: string | null; email: string | null }[]
    | null;
};

// Refund joined shape is structurally identical to payment except for the
// row fields themselves, which come from CrmClientRefund.
type RefundJoinedRow = CrmClientRefund & Omit<PaymentJoinedRow, keyof CrmClientPayment>;

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function paymentJoinedRowToVM(row: PaymentJoinedRow): AdminPaymentRow {
  const client = pickOne(row.client);
  const lead = pickOne(client?.lead ?? null);
  const agent = pickOne(client?.assigned_agent ?? null);
  const branch = pickOne(client?.branch ?? null);
  const recorder = pickOne(row.recorder);
  return {
    id: row.id,
    client_id: row.client_id,
    amount: Number(row.amount),
    currency: row.currency,
    paid_at: row.paid_at,
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    recorded_by_user_id: row.recorded_by_user_id,
    created_at: row.created_at,
    client_code: client?.client_code ?? "",
    customer_name: lead?.customer_name ?? null,
    branch_id: client?.branch_id ?? null,
    branch_code: branch?.code ?? null,
    branch_name: branch?.name ?? null,
    assigned_agent_id: client?.assigned_agent_id ?? null,
    agent_name: agent?.full_name ?? null,
    recorder_name: recorder?.display_name ?? recorder?.email ?? null,
  };
}

function refundJoinedRowToVM(row: RefundJoinedRow): AdminRefundRow {
  const client = pickOne(row.client);
  const lead = pickOne(client?.lead ?? null);
  const agent = pickOne(client?.assigned_agent ?? null);
  const branch = pickOne(client?.branch ?? null);
  const recorder = pickOne(row.recorder);
  return {
    id: row.id,
    client_id: row.client_id,
    amount: Number(row.amount),
    currency: row.currency,
    refunded_at: row.refunded_at,
    reason: row.reason,
    recorded_by_user_id: row.recorded_by_user_id,
    created_at: row.created_at,
    client_code: client?.client_code ?? "",
    customer_name: lead?.customer_name ?? null,
    branch_id: client?.branch_id ?? null,
    branch_code: branch?.code ?? null,
    branch_name: branch?.name ?? null,
    assigned_agent_id: client?.assigned_agent_id ?? null,
    agent_name: agent?.full_name ?? null,
    recorder_name: recorder?.display_name ?? recorder?.email ?? null,
  };
}

const PAYMENT_SELECT = `
  *,
  client:crm_clients!crm_client_payments_client_id_fkey(
    client_code,
    branch_id,
    assigned_agent_id,
    lead:crm_leads!crm_clients_lead_id_fkey(customer_name),
    assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
    branch:branches!crm_clients_branch_id_fkey(code, name)
  ),
  recorder:app_users!crm_client_payments_recorded_by_user_id_fkey(display_name, email)
`;

const REFUND_SELECT = `
  *,
  client:crm_clients!crm_client_refunds_client_id_fkey(
    client_code,
    branch_id,
    assigned_agent_id,
    lead:crm_leads!crm_clients_lead_id_fkey(customer_name),
    assigned_agent:employees!crm_clients_assigned_agent_id_fkey(full_name),
    branch:branches!crm_clients_branch_id_fkey(code, name)
  ),
  recorder:app_users!crm_client_refunds_recorded_by_user_id_fkey(display_name, email)
`;

function monthBoundsUtc(monthKey: string): { startUtc: string; endUtc: string } {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const startUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
  const endUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString();
  return { startUtc, endUtc };
}

export async function getAdminFinancialsMonthly(
  monthKey: string
): Promise<AdminFinancialsMonthly> {
  const { startUtc, endUtc } = monthBoundsUtc(monthKey);

  const empty: AdminFinancialsMonthly = {
    monthKey,
    monthStartUtc: startUtc,
    monthEndUtc: endUtc,
    payments: [],
    refunds: [],
    pkrReceived: 0,
    pkrRefunded: 0,
    pkrNetInflow: 0,
    skippedNonPkrPayments: 0,
    skippedNonPkrRefunds: 0,
    nonPkrCurrencies: [],
  };
  if (!isSupabaseConfigured()) return empty;

  const admin = createAdminClient();

  const [paymentsRes, refundsRes] = await Promise.all([
    admin
      .from("crm_client_payments")
      .select(PAYMENT_SELECT)
      .gte("paid_at", startUtc)
      .lt("paid_at", endUtc)
      .order("paid_at", { ascending: false }),
    admin
      .from("crm_client_refunds")
      .select(REFUND_SELECT)
      .gte("refunded_at", startUtc)
      .lt("refunded_at", endUtc)
      .order("refunded_at", { ascending: false }),
  ]);

  if (paymentsRes.error) {
    throw new Error(`getAdminFinancialsMonthly payments: ${paymentsRes.error.message}`);
  }
  if (refundsRes.error) {
    throw new Error(`getAdminFinancialsMonthly refunds: ${refundsRes.error.message}`);
  }

  const payments = ((paymentsRes.data ?? []) as unknown as PaymentJoinedRow[]).map(
    paymentJoinedRowToVM
  );
  const refunds = ((refundsRes.data ?? []) as unknown as RefundJoinedRow[]).map(
    refundJoinedRowToVM
  );

  let pkrReceived = 0;
  let pkrRefunded = 0;
  let skippedNonPkrPayments = 0;
  let skippedNonPkrRefunds = 0;
  const nonPkr = new Set<string>();
  for (const row of payments) {
    if (row.currency === ADMIN_FINANCIALS_BASE_CURRENCY) pkrReceived += row.amount;
    else {
      skippedNonPkrPayments += 1;
      nonPkr.add(row.currency);
    }
  }
  for (const row of refunds) {
    if (row.currency === ADMIN_FINANCIALS_BASE_CURRENCY) pkrRefunded += row.amount;
    else {
      skippedNonPkrRefunds += 1;
      nonPkr.add(row.currency);
    }
  }

  return {
    monthKey,
    monthStartUtc: startUtc,
    monthEndUtc: endUtc,
    payments,
    refunds,
    pkrReceived,
    pkrRefunded,
    pkrNetInflow: pkrReceived - pkrRefunded,
    skippedNonPkrPayments,
    skippedNonPkrRefunds,
    nonPkrCurrencies: [...nonPkr].sort(),
  };
}

export async function getAdminFinancialsAllTime(): Promise<AdminFinancialsAllTime> {
  const empty: AdminFinancialsAllTime = {
    pkrReceived: 0,
    pkrRefunded: 0,
    pkrNetInflow: 0,
    skippedNonPkrPayments: 0,
    skippedNonPkrRefunds: 0,
    nonPkrCurrencies: [],
  };
  if (!isSupabaseConfigured()) return empty;

  const admin = createAdminClient();
  const [paymentsRes, refundsRes] = await Promise.all([
    admin.from("crm_client_payments").select("amount, currency"),
    admin.from("crm_client_refunds").select("amount, currency"),
  ]);

  if (paymentsRes.error) {
    throw new Error(`getAdminFinancialsAllTime payments: ${paymentsRes.error.message}`);
  }
  if (refundsRes.error) {
    throw new Error(`getAdminFinancialsAllTime refunds: ${refundsRes.error.message}`);
  }

  let pkrReceived = 0;
  let pkrRefunded = 0;
  let skippedNonPkrPayments = 0;
  let skippedNonPkrRefunds = 0;
  const nonPkr = new Set<string>();
  for (const row of (paymentsRes.data ?? []) as { amount: number; currency: string }[]) {
    if (row.currency === ADMIN_FINANCIALS_BASE_CURRENCY) pkrReceived += Number(row.amount);
    else {
      skippedNonPkrPayments += 1;
      nonPkr.add(row.currency);
    }
  }
  for (const row of (refundsRes.data ?? []) as { amount: number; currency: string }[]) {
    if (row.currency === ADMIN_FINANCIALS_BASE_CURRENCY) pkrRefunded += Number(row.amount);
    else {
      skippedNonPkrRefunds += 1;
      nonPkr.add(row.currency);
    }
  }

  return {
    pkrReceived,
    pkrRefunded,
    pkrNetInflow: pkrReceived - pkrRefunded,
    skippedNonPkrPayments,
    skippedNonPkrRefunds,
    nonPkrCurrencies: [...nonPkr].sort(),
  };
}
