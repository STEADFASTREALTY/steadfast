import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseConnectSources() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!configuredUrl) return "";

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      return "";
    }

    return ` ${url.origin} wss://${url.hostname}`;
  } catch {
    return "";
  }
}

function getSupabaseImageSource() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return "";
  try {
    const url = new URL(configuredUrl);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co") ? ` ${url.origin}` : "";
  } catch {
    return "";
  }
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const supabaseConnectSources = getSupabaseConnectSources();
  const supabaseImageSource = getSupabaseImageSource();
  const policy = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:${supabaseImageSource};
    font-src 'self';
    connect-src 'self'${supabaseConnectSources};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const hostname = request.nextUrl.hostname.toLowerCase();
  const cookieDomain = hostname === "canadasap.com" || hostname.endsWith(".canadasap.com")
    ? ".canadasap.com"
    : undefined;
  const subdomainMatch = hostname.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\.canadasap\.com$/);
  const rewriteUrl = subdomainMatch && request.nextUrl.pathname === "/"
    ? new URL(`/sites/${subdomainMatch[1]}`, request.url)
    : null;
  let response = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (configuredUrl && configuredKey) {
    const persistentSession = request.cookies.get("sf_remember_device")?.value === "1";
    const supabase = createServerClient(configuredUrl, configuredKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, responseHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = rewriteUrl
            ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
            : NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Remove any legacy host-only version before issuing the shared
            // domain cookie. This prevents conflicting tokens after a server
            // action or a visit to an agent/broker subdomain.
            if (cookieDomain) {
              const { domain: _domain, ...hostOnlyOptions } = options;
              void _domain;
              response.cookies.set(name, "", {
                ...hostOnlyOptions,
                path: hostOnlyOptions.path ?? "/",
                maxAge: 0,
                expires: new Date(0),
              });
            }
            if (persistentSession) {
              response.cookies.set(name, value, { ...options, ...(cookieDomain ? { domain: cookieDomain } : {}) });
              return;
            }
            const { maxAge: _maxAge, expires: _expires, ...sessionOptions } = options;
            void _maxAge;
            void _expires;
            response.cookies.set(name, value, { ...sessionOptions, ...(cookieDomain ? { domain: cookieDomain } : {}) });
          });
          Object.entries(responseHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    });

    await supabase.auth.getClaims();
  }

  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
