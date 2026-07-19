import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ count: 0, latest: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const [{ count }, { data: latest }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).is("deleted_at", null),
    supabase.from("notifications").select("id,title,body_safe").is("read_at", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    count: count ?? 0,
    latest: latest ? { id: latest.id, title: latest.title, body: latest.body_safe } : null,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
