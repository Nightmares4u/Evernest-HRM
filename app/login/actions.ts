"use server";

// Auth server actions. Imported by the login page form and the dashboard
// logout button. Both actions are env-safe — if Supabase isn't configured,
// they degrade to dev/mock behavior instead of throwing during build.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function loginRedirect(error: string): never {
  redirect(`/login?error=${encodeURIComponent(error)}`);
}

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    loginRedirect("Email and password are required.");
  }

  if (!isSupabaseConfigured()) {
    // Should not happen — login page hides the form in dev mode — but guard
    // anyway in case a request slips through.
    loginRedirect("Supabase is not configured. Set .env.local first.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginRedirect(error.message);
  }

  redirect("/dashboard");
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    // Dev/mock mode — no real session to invalidate. Just send the user back
    // to the login screen.
    redirect("/login");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
