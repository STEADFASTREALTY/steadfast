import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getPublicSupabaseConfig } from "./config";

async function getSharedCookieDomain() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))
    ?.split(",")[0]
    ?.trim()
    .split(":")[0]
    ?.toLowerCase();

  return host === "canadasap.com" || host?.endsWith(".canadasap.com")
    ? ".canadasap.com"
    : undefined;
}

export async function createClient(options?: { persistentSession?: boolean; cookieDomain?: string }) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getPublicSupabaseConfig();
  const persistentSession = options?.persistentSession
    ?? cookieStore.get("sf_remember_device")?.value === "1";
  // All first-party public sites share one Supabase session.  Without this,
  // a server action can write a host-only cookie beside the shared cookie and
  // the browser may send the stale value on the next request.
  const cookieDomain = options?.cookieDomain ?? await getSharedCookieDomain();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _responseHeaders) {
        void _responseHeaders;
        try {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            if (cookieDomain) {
              const { domain: _domain, ...hostOnlyOptions } = cookieOptions;
              void _domain;
              cookieStore.set(name, "", {
                ...hostOnlyOptions,
                path: hostOnlyOptions.path ?? "/",
                maxAge: 0,
                expires: new Date(0),
              });
            }
            if (persistentSession) {
              cookieStore.set(name, value, { ...cookieOptions, ...(cookieDomain ? { domain: cookieDomain } : {}) });
              return;
            }
            const { maxAge: _maxAge, expires: _expires, ...sessionOptions } = cookieOptions;
            void _maxAge;
            void _expires;
            cookieStore.set(name, value, { ...sessionOptions, ...(cookieDomain ? { domain: cookieDomain } : {}) });
          });
        } catch {
          // Server Components cannot write cookies. Proxy-based session refresh
          // will own this responsibility when authentication is introduced.
        }
      },
    },
  });
}
