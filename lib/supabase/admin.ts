import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const urlValue = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!urlValue || !secretKey) {
    throw new Error("Server-side Supabase media validation is not configured.");
  }

  const url = new URL(urlValue);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
    throw new Error("The configured Supabase project URL is invalid.");
  }
  if (!secretKey.startsWith("sb_secret_")) {
    throw new Error("The configured Supabase server key is not a secret key.");
  }

  return createSupabaseClient(url.origin, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
