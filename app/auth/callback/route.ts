import { NextResponse } from "next/server";
import { getAppUrl, safeInternalPath } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeInternalPath(requestUrl.searchParams.get("next"));
  const verifyingEmail = requestUrl.searchParams.get("email_verification") === "1";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (verifyingEmail) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await createAdminClient().from("people").update({ email_verified_at: new Date().toISOString() }).eq("auth_user_id", userData.user.id);
        }
        return NextResponse.redirect(new URL("/account/security?notice=Email+verified.", getAppUrl()));
      }
      return NextResponse.redirect(new URL(next, getAppUrl()));
    }
  }

  return NextResponse.redirect(
    new URL("/sign-in?error=The+email+link+is+invalid+or+expired.", getAppUrl()),
  );
}
