import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const mediaValidationConfigured = Boolean(process.env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_"));

  return NextResponse.json(
    {
      service: "steadfast-web",
      status: "ok",
      integrations: {
        supabase: supabaseConfigured ? "configured" : "pending",
        mediaValidation: mediaValidationConfigured ? "configured" : "pending",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}
