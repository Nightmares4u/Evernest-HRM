// One-off cleanup for the 2026-07 direct-client-shell pivot.
//
// Deletes ALL CRM pipeline data (raw inbox, leads, clients and every
// dependent table) — it was all sample/test data from the WhatsApp
// intake era. Config tables (crm_whatsapp_numbers, crm_campaign_sources,
// crm_assignment_rules) and all HRM data are left untouched.
//
// Usage:  node scripts/cleanup-crm-test-data.mjs --confirm
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
// .env.local (or the environment).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local absent — rely on process env.
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!process.argv.includes("--confirm")) {
  console.error("Refusing to run without --confirm (this permanently deletes ALL CRM data).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// FK-safe order: invoice steps → invoices → client children → clients →
// lead children → leads → raw inbox. (Most children cascade, but explicit
// deletes make the run auditable and order-independent of cascade rules.)
const TABLES = [
  "crm_client_invoice_steps",
  "crm_client_invoices",
  "crm_client_refunds",
  "crm_client_visa_decisions",
  "crm_client_country_milestones",
  "crm_client_applications",
  "crm_client_documents",
  "crm_client_payments",
  "crm_client_activities",
  "crm_clients",
  "crm_lead_transfers",
  "crm_lead_activities",
  "crm_lead_assignments",
  "crm_lead_messages",
  "crm_leads",
  "crm_raw_inbox",
];

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

async function wipeTable(table) {
  const { count, error } = await admin
    .from(table)
    .delete({ count: "exact" })
    .neq("id", NIL_UUID);
  if (error) {
    // Tolerate tables that don't exist yet (e.g. 0026 not applied).
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      console.log(`~ ${table}: table not found, skipped`);
      return 0;
    }
    throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✓ ${table}: deleted ${count ?? 0} row(s)`);
  return count ?? 0;
}

async function emptyBucket(bucket) {
  let removed = 0;
  async function walk(prefix) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      console.log(`~ storage ${bucket}/${prefix || "(root)"}: ${error.message}`);
      return;
    }
    const files = [];
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders come back with a null id; files have ids.
      if (entry.id) files.push(path);
      else await walk(path);
    }
    if (files.length > 0) {
      const { error: rmError } = await admin.storage.from(bucket).remove(files);
      if (rmError) console.log(`~ storage remove failed under ${prefix}: ${rmError.message}`);
      else removed += files.length;
    }
  }
  await walk("");
  console.log(`✓ storage bucket ${bucket}: removed ${removed} file(s)`);
}

let total = 0;
for (const table of TABLES) {
  total += await wipeTable(table);
}
await emptyBucket("crm-client-docs");

console.log(`\nDone. ${total} database row(s) deleted across ${TABLES.length} tables.`);
