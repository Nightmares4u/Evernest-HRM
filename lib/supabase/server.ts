// SERVER-ONLY MODULE.
//
// Exports two clients:
//   - createClient()      — anon-key client bound to the request's cookies
//                           (RLS enforced; safe for user-context queries).
//   - createAdminClient() — service-role client (BYPASSES RLS).
//
// Never import this module from a Client Component or any code that ends up
// in the browser bundle. The service-role key has no NEXT_PUBLIC_ prefix, so
// Next.js will refuse to bundle it client-side, but discipline at the call
// site is still required.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — middleware refreshes sessions instead.
          }
        },
      },
    }
  );
}

/**
 * Service-role admin client. Bypasses RLS.
 *
 * Use only in:
 *   - Server actions
 *   - Route handlers (app/api/*)
 *   - One-shot scripts (scripts/*)
 *
 * Throws clearly if required env vars are missing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "createAdminClient: missing env vars. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
