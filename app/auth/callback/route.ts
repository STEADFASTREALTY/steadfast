import { NextResponse } from "next/server";
import { getAppUrl, safeInternalPath } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeInternalPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, getAppUrl()));
  }

  return NextResponse.redirect(
    new URL("/sign-in?error=The+confirmation+link+is+invalid+or+expired.", getAppUrl()),
  );
}
