import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron/auth";
import { parseYearMonth, previousYearMonth } from "@/lib/cron/utils";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
};

type LeaveBalanceRow = {
  id: string;
  employee_id: string;
  accrued: number | string;
  carry_forward_in: number | string;
  balance: number | string;
};

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: Request) {
  return handle(request);
}

// Vercel scheduled cron triggers send GET. Same handler, same auth check.
export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const { year, month } = parseYearMonth(url.searchParams);
  const previous = previousYearMonth(year, month);

  const summary = {
    ok: true,
    year,
    month,
    employees_checked: 0,
    balances_created: 0,
    balances_updated: 0,
    already_accrued: 0,
    errors: [] as string[],
  };

  const admin = createAdminClient();
  const [employeesRes, currentRes, previousRes] = await Promise.all([
    admin
      .from("employees")
      .select("id")
      .eq("employment_status", "active")
      .eq("payroll_exempt", false),
    admin
      .from("leave_balances")
      .select("id, employee_id, accrued, carry_forward_in, balance")
      .eq("year", year)
      .eq("month", month),
    admin
      .from("leave_balances")
      .select("id, employee_id, accrued, carry_forward_in, balance")
      .eq("year", previous.year)
      .eq("month", previous.month),
  ]);

  if (employeesRes.error) {
    return NextResponse.json(
      { ok: false, error: `Could not load employees: ${employeesRes.error.message}` },
      { status: 500 }
    );
  }
  if (currentRes.error) summary.errors.push(`current balances: ${currentRes.error.message}`);
  if (previousRes.error) summary.errors.push(`previous balances: ${previousRes.error.message}`);

  const currentByEmployee = new Map(
    ((currentRes.data ?? []) as LeaveBalanceRow[]).map((row) => [
      row.employee_id,
      row,
    ])
  );
  const previousByEmployee = new Map(
    ((previousRes.data ?? []) as LeaveBalanceRow[]).map((row) => [
      row.employee_id,
      row,
    ])
  );

  for (const employee of (employeesRes.data ?? []) as EmployeeRow[]) {
    summary.employees_checked += 1;
    const existing = currentByEmployee.get(employee.id);
    const previousBalance = Math.max(
      0,
      toNum(previousByEmployee.get(employee.id)?.balance)
    );

    if (existing) {
      if (toNum(existing.accrued) >= 1) {
        summary.already_accrued += 1;
        continue;
      }

      const { error: updateError } = await admin
        .from("leave_balances")
        .update({
          accrued: 1.0,
          carry_forward_in: previousBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updateError) {
        summary.errors.push(`employee ${employee.id}: ${updateError.message}`);
        continue;
      }

      const { error: auditError } = await admin.from("audit_logs").insert({
        actor_id: null,
        target_type: "leave_balance",
        target_id: existing.id,
        action: "cron_monthly_leave_accrual_update",
        old_value: {
          accrued: existing.accrued,
          carry_forward_in: existing.carry_forward_in,
        },
        new_value: { year, month, accrued: 1.0, carry_forward_in: previousBalance },
        reason: "Monthly leave cron topped up accrual",
      });
      if (auditError) {
        summary.errors.push(`audit ${existing.id}: ${auditError.message}`);
      }
      summary.balances_updated += 1;
      continue;
    }

    const { data: created, error: insertError } = await admin
      .from("leave_balances")
      .insert({
        employee_id: employee.id,
        year,
        month,
        accrued: 1.0,
        used: 0.0,
        carry_forward_in: previousBalance,
      })
      .select("id")
      .single();
    if (insertError || !created) {
      if (insertError?.code === "23505") {
        summary.already_accrued += 1;
      } else {
        summary.errors.push(
          `employee ${employee.id}: ${insertError?.message ?? "insert failed"}`
        );
      }
      continue;
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: null,
      target_type: "leave_balance",
      target_id: created.id,
      action: "cron_monthly_leave_accrual_create",
      old_value: null,
      new_value: { employee_id: employee.id, year, month, accrued: 1.0, carry_forward_in: previousBalance },
      reason: "Monthly leave cron created balance",
    });
    if (auditError) {
      summary.errors.push(`audit ${created.id}: ${auditError.message}`);
    }
    summary.balances_created += 1;
  }

  return NextResponse.json(summary);
}
