import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string; filename: string }> }) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 403 });
  const route = await params;
  if (!['display.webp', 'logo.webp'].includes(route.filename) || !z.string().uuid().safeParse(route.assetId).success) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: asset } = await supabase.from("site_assets").select("id").eq("id", route.assetId).eq("status", "ready").maybeSingle();
  if (!asset) return new NextResponse(null, { status: 404 });
  const admin = createAdminClient();
  const { data: protectedAsset } = await admin.from("site_assets").select("bucket_id,object_path,byte_size").eq("id", asset.id).single();
  if (!protectedAsset) return new NextResponse(null, { status: 404 });
  const { data: image, error } = await admin.storage.from(protectedAsset.bucket_id).download(protectedAsset.object_path);
  if (error || !image) return new NextResponse(null, { status: 404 });
  const bytes = new Uint8Array(await image.arrayBuffer());
  const safeImage = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.slice(3) : bytes;
  return new NextResponse(safeImage, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": "inline; filename=steadfast-profile.webp", "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-site", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noimageindex, noarchive" } });
}
