// Server-side helper to fetch the currently signed-in user along with their
// app_users row and employees row (if present). Used by pages to render
// role-aware UI and gate actions.
//
// Wrapped in React's cache() so multiple components within the same request
// (e.g. dashboard page + MyAttendanceCard) share one fetch.

import { cache } from "react";
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

export const getCurrentUser = cache(
  async (): Promise<CurrentUser | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Parallel — saves one full round-trip on every page load.
    const [appUserRes, empRes] = await Promise.all([
      supabase.from("app_users").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("employees").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    const appUserRow = appUserRes.data;
    if (!appUserRow) return null;

    return {
      authUserId: user.id,
      email: user.email ?? "",
      appUser: appUserRow as AppUser,
      employee: (empRes.data as Employee | null) ?? null,
    };
  }
);
