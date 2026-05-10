// SERVER-ONLY. Resend API wrapper.
//
// Env-safe — when RESEND_API_KEY is missing, sendEmail() logs and returns
// without throwing. That lets dev environments run with email disabled and
// production environments add the key when ready, without code changes.
//
// Resend free tier:
//   - 100 emails/day, 3000/month — ample for a 12-employee internal HRM.
//   - With sender = "onboarding@resend.dev" (sandbox), emails ONLY deliver to
//     the email address verified on your Resend account.
//   - To send to anyone (the whole staff), verify a custom domain in Resend
//     and set EMAIL_FROM to e.g. "EN HRM <hrm@evernestconsultants.com>".

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "EN HRM <onboarding@resend.dev>";

  if (!apiKey) {
    // Dev/CI mode: log instead of failing so server actions stay green.
    console.log(
      `[email] RESEND_API_KEY missing — skipping send (to=${Array.isArray(args.to) ? args.to.join(",") : args.to}, subj=${args.subject})`
    );
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[email] send failed: ${res.status} ${body}`);
    }
  } catch (e) {
    console.warn("[email] send error:", e);
  }
}

/**
 * Run an email-sending function but never let it throw — server actions stay
 * green even if Resend is down. Returns a resolved promise either way.
 */
export async function sendEmailSafely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn("[email] safely-wrapped send threw:", e);
  }
}
