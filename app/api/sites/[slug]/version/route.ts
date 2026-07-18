import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("professional_sites").select("updated_at").eq("slug", slug).eq("status", "active").maybeSingle();
  return NextResponse.json({ updatedAt: data?.updated_at ?? null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
