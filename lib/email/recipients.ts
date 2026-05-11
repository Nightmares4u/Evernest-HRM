import { createAdminClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/email/send";
import type { UserRole } from "@/lib/types/hrm";

type AdminClient = ReturnType<typeof createAdminClient>;

type UserEmailRow = {
  display_name: string;
  email: string;
  employees:
    | { contact_email: string | null }
    | { contact_email: string | null }[]
    | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

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
  const { data } = await admin
    .from("app_users")
    .select(
      `
      display_name, email,
      employees!app_users_id_fkey ( contact_email )
      `
    )
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as UserEmailRow;
  const employee = pickOne(row.employees);
  return {
    name: row.display_name,
    email: preferredNotificationEmail({
      email: row.email,
      contact_email: employee?.contact_email ?? null,
    }),
  };
}

export async function listRoleNotificationEmails(
  admin: AdminClient,
  role: UserRole
): Promise<string[]> {
  const { data } = await admin
    .from("app_users")
    .select(
      `
      email,
      employees!app_users_id_fkey ( contact_email )
      `
    )
    .eq("role", role)
    .eq("is_active", true);

  return ((data ?? []) as unknown as Array<Omit<UserEmailRow, "display_name">>)
    .map((row) => {
      const employee = pickOne(row.employees);
      return preferredNotificationEmail({
        email: row.email,
        contact_email: employee?.contact_email ?? null,
      });
    })
    .filter((email): email is string => Boolean(email));
}
