import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "./config";

export async function createClient(options?: { persistentSession?: boolean }) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getPublicSupabaseConfig();
  const persistentSession = options?.persistentSession
    ?? cookieStore.get("sf_remember_device")?.value === "1";

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _responseHeaders) {
        void _responseHeaders;
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            if (persistentSession) {
              cookieStore.set(name, value, cookieOptions);
              return;
            }
            const { maxAge: _maxAge, expires: _expires, ...sessionOptions } = cookieOptions;
            void _maxAge;
            void _expires;
            cookieStore.set(name, value, sessionOptions);
          });
        } catch {
          // Server Components cannot write cookies. Proxy-based session refresh
          // will own this responsibility when authentication is introduced.
        }
      },
    },
  });
}
