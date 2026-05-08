// HTML email templates. Minimal inline-styled HTML — most email clients
// strip <style> blocks but respect inline style attributes.
//
// Server-side only (used inside server actions).

import { appBaseUrl } from "@/lib/email/send";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}

const FRAME_OPEN = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; max-width: 600px; margin: 0 auto; padding: 24px;">
`;
const FRAME_CLOSE = `
  <p style="margin-top: 32px; color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 12px;">
    EN Consultants HRM · automated notification
  </p>
</div>
`;

function dl(rows: Array<[string, string]>): string {
  return `
<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
  ${rows
    .map(
      ([k, v]) => `
    <tr>
      <td style="padding: 8px 12px; background: #f6f6f8; font-weight: 600; width: 32%; vertical-align: top;">${esc(k)}</td>
      <td style="padding: 8px 12px; background: #fff; border-left: 1px solid #f0f0f4; white-space: pre-wrap;">${v /* already escaped */}</td>
    </tr>
  `
    )
    .join("")}
</table>
`;
}

// ---------- task assigned ----------

export function taskAssignedEmail(args: {
  to_name: string;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  priority: string;
  assigner_name: string;
  requires_approval: boolean;
}): { html: string; text: string; subject: string } {
  const subject = `[EN HRM] New task: ${args.title}`;
  const link = `${appBaseUrl()}/tasks`;

  const dueText = args.due_time
    ? `${args.due_date} at ${args.due_time.slice(0, 5)}`
    : `${args.due_date} (EOD)`;

  const rows: Array<[string, string]> = [
    ["Title", esc(args.title)],
    ["Due", esc(dueText)],
    ["Priority", esc(args.priority)],
    ["Assigned by", esc(args.assigner_name)],
  ];
  if (args.requires_approval) {
    rows.push([
      "Approval",
      "<span style=\"color:#92400e\">Required — submit for super-admin approval, do not self-mark done.</span>",
    ]);
  }
  if (args.description) {
    rows.push(["Notes", esc(args.description)]);
  }

  const html = `${FRAME_OPEN}
  <h2 style="margin: 0 0 16px; font-size: 20px;">New task assigned</h2>
  <p style="margin: 0 0 12px;">Hi ${esc(args.to_name)},</p>
  <p style="margin: 0 0 12px;">${esc(args.assigner_name)} has assigned you a task.</p>
  ${dl(rows)}
  <p>
    <a href="${link}" style="display: inline-block; padding: 8px 14px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Open in EN HRM</a>
  </p>
${FRAME_CLOSE}`;

  const text = [
    `New task assigned`,
    ``,
    `Hi ${args.to_name},`,
    `${args.assigner_name} has assigned you a task.`,
    ``,
    `Title: ${args.title}`,
    `Due: ${dueText}`,
    `Priority: ${args.priority}`,
    args.requires_approval
      ? `Approval: required — submit for super-admin approval`
      : ``,
    args.description ? `Notes: ${args.description}` : ``,
    ``,
    `Open: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text, subject };
}

// ---------- check-in ----------

export function checkInEmail(args: {
  employee_name: string;
  time_pkt: string; // 'HH:MM'
  mode: string;
  is_late: boolean;
  late_minutes: number;
  requires_review: boolean;
  geo_status: string;
  ip: string | null;
  branch_code: string | null;
}): { html: string; text: string; subject: string } {
  const flags: string[] = [];
  if (args.is_late) flags.push(`late by ${args.late_minutes}m`);
  if (args.requires_review) flags.push("flagged for review");
  const subject =
    `[EN HRM] ${args.employee_name} checked in (${args.mode})` +
    (flags.length ? ` — ${flags.join(", ")}` : "");

  const link = `${appBaseUrl()}/attendance`;

  const rows: Array<[string, string]> = [
    ["Employee", esc(args.employee_name)],
    ["Time (PKT)", esc(args.time_pkt)],
    ["Mode", esc(args.mode)],
  ];
  if (args.branch_code) rows.push(["Branch", esc(args.branch_code)]);
  if (args.is_late)
    rows.push([
      "Late",
      `<span style="color:#b45309">+${args.late_minutes}m past shift start</span>`,
    ]);
  rows.push(["Geolocation", esc(args.geo_status)]);
  if (args.ip) rows.push(["IP", esc(args.ip)]);
  if (args.requires_review)
    rows.push([
      "Review",
      `<span style="color:#92400e">Needs admin review (IP off-network or location not granted)</span>`,
    ]);

  const html = `${FRAME_OPEN}
  <h2 style="margin: 0 0 16px; font-size: 20px;">${esc(args.employee_name)} checked in</h2>
  ${dl(rows)}
  <p>
    <a href="${link}" style="display: inline-block; padding: 8px 14px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Open Today panel</a>
  </p>
${FRAME_CLOSE}`;

  const text = [
    `${args.employee_name} checked in`,
    ``,
    `Time: ${args.time_pkt} PKT · mode: ${args.mode}` +
      (args.branch_code ? ` · ${args.branch_code}` : ""),
    args.is_late ? `Late: +${args.late_minutes}m` : "",
    `Geolocation: ${args.geo_status}`,
    args.ip ? `IP: ${args.ip}` : "",
    args.requires_review ? `⚠ Flagged for review` : "",
    ``,
    `Open: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text, subject };
}

// ---------- check-out ----------

export function checkOutEmail(args: {
  employee_name: string;
  time_pkt: string;
  worked_minutes: number;
  is_half_day: boolean;
  status: string;
  branch_code: string | null;
}): { html: string; text: string; subject: string } {
  const hours = Math.floor(args.worked_minutes / 60);
  const mins = args.worked_minutes % 60;
  const worked = `${hours}h ${mins}m`;
  const subject =
    `[EN HRM] ${args.employee_name} checked out` +
    (args.is_half_day ? " (half-day)" : "");
  const link = `${appBaseUrl()}/attendance`;

  const rows: Array<[string, string]> = [
    ["Employee", esc(args.employee_name)],
    ["Time (PKT)", esc(args.time_pkt)],
    ["Worked", esc(worked)],
    [
      "Status",
      args.is_half_day
        ? `<span style="color:#c2410c">${esc(args.status)} (half-day, < 4h)</span>`
        : esc(args.status),
    ],
  ];
  if (args.branch_code) rows.push(["Branch", esc(args.branch_code)]);

  const html = `${FRAME_OPEN}
  <h2 style="margin: 0 0 16px; font-size: 20px;">${esc(args.employee_name)} checked out</h2>
  ${dl(rows)}
  <p>
    <a href="${link}" style="display: inline-block; padding: 8px 14px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Open Today panel</a>
  </p>
${FRAME_CLOSE}`;

  const text = [
    `${args.employee_name} checked out`,
    ``,
    `Time: ${args.time_pkt} PKT · worked ${worked}`,
    `Status: ${args.status}` +
      (args.is_half_day ? ` (half-day, < 4h)` : "") +
      (args.branch_code ? ` · ${args.branch_code}` : ""),
    ``,
    `Open: ${link}`,
  ].join("\n");

  return { html, text, subject };
}
