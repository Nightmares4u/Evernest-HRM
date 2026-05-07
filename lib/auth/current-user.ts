// Server-side helper to fetch the currently signed-in user along with their
// app_users row and employees row (if present). Used by pages to render
// role-aware UI and gate actions.

import { createClient } from "@/lib/supabase/server";
import type { AppUser, Employee } from "@/lib/types/hrm";

export type CurrentUser = {
  authUserId: string;
  email: string;
  appUser: AppUser;
  employee: Employee | null; // null for system admins (e.g. Sir Raza)
};

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUserRow } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUserRow) return null;

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    authUserId: user.id,
    email: user.email ?? "",
    appUser: appUserRow as AppUser,
    employee: (employeeRow as Employee | null) ?? null,
  };
}
