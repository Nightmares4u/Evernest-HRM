import { createAdminClient } from "@/lib/supabase/server";
import { isValidEmail, maskEmail } from "@/lib/email/send";
import type { UserRole } from "@/lib/types/hrm";

type AdminClient = ReturnType<typeof createAdminClient>;

type UserEmailRow = {
  display_name: string;
  email: string;
};

export function preferredNotificationEmail(row: {
  email: string | null;
  contact_email?: string | null;
}): string | null {
  const contact = row.contact_email?.trim().toLowerCase() ?? "";
  if (isValidEmail(contact)) return contact;
  const login = row.email?.trim().toLowerCase() ?? "";
  return isValidEmail(login) ? login : null;
}

export async function getUserNotificationTarget(
  admin: AdminClient,
  userId: string
): Promise<{ name: string; email: string | null } | null> {
  const [{ data: userRow }, { data: employeeRow }] = await Promise.all([
    admin
      .from("app_users")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("employees")
      .select("contact_email")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!userRow) return null;

  const row = userRow as UserEmailRow;
  const employee = employeeRow as { contact_email: string | null } | null;
  const email = preferredNotificationEmail({
    email: row.email,
    contact_email: employee?.contact_email ?? null,
  });
  console.log(
    `[email] recipient resolved: ${email ? maskEmail(email) : "(none)"}`
  );
  return {
    name: row.display_name,
    email,
  };
}

export async function listRoleNotificationEmails(
  admin: AdminClient,
  role: UserRole
): Promise<string[]> {
  const { data: users } = await admin
    .from("app_users")
    .select("id, email")
    .eq("role", role)
    .eq("is_active", true);

  const userRows = (users ?? []) as Array<{ id: string; email: string }>;
  if (userRows.length === 0) return [];

  const { data: employees } = await admin
    .from("employees")
    .select("user_id, contact_email")
    .in(
      "user_id",
      userRows.map((user) => user.id)
    );
  const contactByUserId = new Map(
    ((employees ?? []) as Array<{ user_id: string; contact_email: string | null }>).map(
      (employee) => [employee.user_id, employee.contact_email]
    )
  );

  return userRows
    .map((row) =>
      preferredNotificationEmail({
        email: row.email,
        contact_email: contactByUserId.get(row.id) ?? null,
      })
    )
    .filter((email): email is string => Boolean(email));
}
