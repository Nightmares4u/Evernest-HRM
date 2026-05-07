/**
 * EN HRM — User seeder (one-shot script).
 *
 * Reads memory/projects/hrm/seed/users.csv and creates:
 *   - auth.users      (Supabase Auth, with hashed password)
 *   - app_users       (1:1 with auth.users, holds role + display name)
 *   - employees       (only for rows where account_type = 'employee')
 *
 * Two-pass: pass 1 creates everyone, pass 2 resolves manager_email -> manager_id.
 *
 * Idempotency: re-running skips users whose email already exists in auth.users.
 *
 * Usage:
 *   npm run seed:users
 *
 * Required env (in .env.local at repo root):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Prerequisites:
 *   - The Supabase project exists.
 *   - Migration supabase/migrations/0001_init.sql has been applied.
 *   - memory/projects/hrm/seed/users.csv exists with all required columns.
 *
 * SECURITY:
 *   users.csv contains plaintext initial passwords.
 *   It is in .gitignore. Never commit it. Never paste it into chat.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { parse } from "csv-parse/sync";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const CSV_PATH = resolve(REPO_ROOT, "memory/projects/hrm/seed/users.csv");
const ENV_PATH = resolve(REPO_ROOT, ".env.local");

const REQUIRED_COLUMNS = [
  "account_type",
  "full_name",
  "company_email",
  "initial_password",
  "user_role",
  "branch_code",
  "department",
  "shift_name",
  "monthly_salary",
  "attendance_exempt",
  "payroll_exempt",
  "remote_allowed",
  "remote_default_days",
  "manager_email",
  "hire_date",
  "role_description",
  "notes",
] as const;

type ColumnName = (typeof REQUIRED_COLUMNS)[number];
type Row = Record<ColumnName, string>;

function parseBool(s: string | undefined): boolean {
  return (s ?? "").trim().toLowerCase() === "true";
}

function parseIntArray(s: string | undefined): number[] {
  // "{1,2}" -> [1, 2]; "{}" or "" -> []
  const trimmed = (s ?? "").trim().replace(/^\{|\}$/g, "");
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

function fail(msg: string): never {
  console.error(`\n[seed-users] ${msg}\n`);
  process.exit(1);
}

async function listAllAuthEmails(admin: SupabaseClient): Promise<Set<string>> {
  const emails = new Set<string>();
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email) emails.add(u.email.toLowerCase());
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return emails;
}

async function main() {
  console.warn(
    "\n⚠  users.csv contains PLAINTEXT initial passwords. It is gitignored. Never commit it.\n"
  );

  // 1. Validate CSV exists.
  if (!existsSync(CSV_PATH)) {
    fail(
      `users.csv not found at ${CSV_PATH}.\n` +
        `Copy memory/projects/hrm/seed/users.csv.example and fill in real values.`
    );
  }

  // 2. Load env from .env.local.
  if (!existsSync(ENV_PATH)) {
    fail(
      `.env.local not found at ${ENV_PATH}.\n` +
        `Copy .env.local.example and fill in real Supabase keys.`
    );
  }
  loadEnv({ path: ENV_PATH });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail(
      "Missing env vars. Required:\n" +
        "  NEXT_PUBLIC_SUPABASE_URL\n" +
        "  SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  // 3. Parse CSV.
  const csv = readFileSync(CSV_PATH, "utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    comment: "#",
  }) as Row[];

  if (rows.length === 0) {
    fail("users.csv is empty.");
  }

  // 4. Validate columns.
  const headerKeys = Object.keys(rows[0]);
  const missing = REQUIRED_COLUMNS.filter((c) => !headerKeys.includes(c));
  if (missing.length > 0) {
    fail(`users.csv missing required columns: ${missing.join(", ")}`);
  }

  console.log(`[seed-users] Loaded ${rows.length} rows from users.csv.\n`);

  // 5. Connect to Supabase as service role.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 6. Resolve taxonomy tables.
  const [branchesRes, deptsRes, shiftsRes] = await Promise.all([
    admin.from("branches").select("id, code"),
    admin.from("departments").select("id, name"),
    admin.from("shifts").select("id, name"),
  ]);

  if (branchesRes.error || deptsRes.error || shiftsRes.error) {
    const err = branchesRes.error || deptsRes.error || shiftsRes.error;
    fail(
      `Failed to read taxonomy tables. Has 0001_init.sql been applied?\n${err?.message}`
    );
  }

  const branchByCode = new Map(
    (branchesRes.data ?? []).map((b) => [b.code, b.id])
  );
  const deptByName = new Map((deptsRes.data ?? []).map((d) => [d.name, d.id]));
  const shiftByName = new Map(
    (shiftsRes.data ?? []).map((s) => [s.name, s.id])
  );

  // 7. PASS 1 — create auth.users + app_users + employees (manager_id null).
  console.log("[seed-users] Pass 1: creating users\n");

  const existingEmails = await listAllAuthEmails(admin);
  let created = 0;
  let skipped = 0;
  let errored = 0;

  for (const row of rows) {
    const email = (row.company_email ?? "").trim().toLowerCase();
    if (!email) {
      console.warn(`  SKIP: row with empty email (${row.full_name})`);
      skipped += 1;
      continue;
    }

    if (existingEmails.has(email)) {
      console.log(`  SKIP: ${email} (already exists)`);
      skipped += 1;
      continue;
    }

    if (!row.initial_password) {
      console.error(`  ERR: ${email} missing initial_password`);
      errored += 1;
      continue;
    }

    // Create auth user.
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: row.initial_password,
      email_confirm: true,
    });
    if (authErr || !authUser?.user) {
      console.error(`  ERR creating auth user ${email}: ${authErr?.message}`);
      errored += 1;
      continue;
    }
    const userId = authUser.user.id;

    // Insert app_users.
    const { error: appUserErr } = await admin.from("app_users").insert({
      id: userId,
      display_name: row.full_name,
      email,
      role: row.user_role || "employee",
      is_active: true,
    });
    if (appUserErr) {
      console.error(`  ERR app_users for ${email}: ${appUserErr.message}`);
      errored += 1;
      continue;
    }

    // Insert employees if account_type = 'employee'.
    if (row.account_type === "employee") {
      const branchId = row.branch_code ? branchByCode.get(row.branch_code) : null;
      const deptId = row.department ? deptByName.get(row.department) : null;
      const shiftId = row.shift_name ? shiftByName.get(row.shift_name) : null;

      if (row.branch_code && !branchId) {
        console.error(
          `  ERR: branch code '${row.branch_code}' not found for ${email}`
        );
        errored += 1;
        continue;
      }
      if (row.department && !deptId) {
        console.error(
          `  ERR: department '${row.department}' not found for ${email}`
        );
        errored += 1;
        continue;
      }
      if (row.shift_name && !shiftId) {
        console.error(
          `  ERR: shift '${row.shift_name}' not found for ${email}`
        );
        errored += 1;
        continue;
      }

      const salary = Number.parseFloat(row.monthly_salary || "0");
      if (!Number.isFinite(salary) || salary < 0) {
        console.error(`  ERR: invalid monthly_salary for ${email}`);
        errored += 1;
        continue;
      }

      const { error: empErr } = await admin.from("employees").insert({
        user_id: userId,
        full_name: row.full_name,
        branch_id: branchId,
        department_id: deptId,
        shift_id: shiftId,
        monthly_salary: salary,
        role_description: row.role_description || null,
        attendance_exempt: parseBool(row.attendance_exempt),
        payroll_exempt: parseBool(row.payroll_exempt),
        remote_allowed: parseBool(row.remote_allowed),
        remote_default_days: parseIntArray(row.remote_default_days),
        hire_date: row.hire_date,
      });
      if (empErr) {
        console.error(`  ERR employees for ${email}: ${empErr.message}`);
        errored += 1;
        continue;
      }
    }

    console.log(`  OK : ${email} (${row.account_type})`);
    created += 1;
  }

  // 8. PASS 2 — resolve manager_email -> manager_id.
  console.log("\n[seed-users] Pass 2: resolving managers\n");

  // Re-fetch employees with email so we can map by email.
  const { data: empRows, error: empFetchErr } = await admin
    .from("employees")
    .select("id, user_id");
  if (empFetchErr) {
    fail(`Failed to fetch employees for manager resolution: ${empFetchErr.message}`);
  }

  const { data: appUserRows, error: appUserFetchErr } = await admin
    .from("app_users")
    .select("id, email");
  if (appUserFetchErr) {
    fail(`Failed to fetch app_users: ${appUserFetchErr.message}`);
  }

  const userIdByEmail = new Map(
    (appUserRows ?? []).map((u) => [u.email.toLowerCase(), u.id])
  );
  const empIdByUserId = new Map(
    (empRows ?? []).map((e) => [e.user_id, e.id])
  );
  const empIdByEmail = new Map<string, string>();
  for (const [email, userId] of userIdByEmail) {
    const empId = empIdByUserId.get(userId);
    if (empId) empIdByEmail.set(email, empId);
  }

  let managerSet = 0;
  let managerSkip = 0;
  for (const row of rows) {
    if (row.account_type !== "employee") continue;
    const managerEmail = (row.manager_email ?? "").trim().toLowerCase();
    if (!managerEmail) continue;

    const empEmail = (row.company_email ?? "").trim().toLowerCase();
    const empId = empIdByEmail.get(empEmail);
    const managerId = empIdByEmail.get(managerEmail);

    if (!empId) {
      console.warn(`  SKIP: ${empEmail} not in employees`);
      managerSkip += 1;
      continue;
    }
    if (!managerId) {
      console.warn(
        `  SKIP: manager ${managerEmail} for ${empEmail} not in employees`
      );
      managerSkip += 1;
      continue;
    }

    const { error } = await admin
      .from("employees")
      .update({ manager_id: managerId })
      .eq("id", empId);
    if (error) {
      console.error(`  ERR: ${empEmail} -> ${managerEmail}: ${error.message}`);
    } else {
      console.log(`  OK : ${empEmail} -> ${managerEmail}`);
      managerSet += 1;
    }
  }

  // 9. Summary.
  console.log("\n=== seed-users summary ===");
  console.log(`  created     : ${created}`);
  console.log(`  skipped     : ${skipped}`);
  console.log(`  errored     : ${errored}`);
  console.log(`  managers set: ${managerSet}`);
  console.log(`  manager skip: ${managerSkip}`);
  console.log("===========================\n");
}

main().catch((err) => {
  console.error("\n[seed-users] Fatal error:", err);
  process.exit(1);
});
