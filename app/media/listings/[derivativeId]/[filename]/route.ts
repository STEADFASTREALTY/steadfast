import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ derivativeId: string; filename: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return new NextResponse(null, { status: 403 });
  }
  const route = await params;
  if (!z.string().uuid().safeParse(route.derivativeId).success) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data: publicMedia } = await supabase
    .from("public_listing_media")
    .select("id,variant")
    .eq("id", route.derivativeId)
    .maybeSingle();
  if (!publicMedia) return siteAssetResponse(route.derivativeId, route.filename);
  if (route.filename !== `${publicMedia.variant}.webp`) return new NextResponse(null, { status: 404 });

  const admin = createAdminClient();
  const { data: projection } = await admin
    .from("public_listing_media")
    .select("derivative_id")
    .eq("id", route.derivativeId)
    .single();
  if (!projection) return new NextResponse(null, { status: 404 });

  const { data: derivative } = await admin
    .from("listing_media_derivatives")
    .select("bucket_id,object_path,content_hash")
    .eq("id", projection.derivative_id)
    .single();
  if (!derivative) return new NextResponse(null, { status: 404 });

  const etag = `"${derivative.content_hash}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: responseHeaders(etag) });
  }
  const { data: image, error } = await admin.storage
    .from(derivative.bucket_id)
    .download(derivative.object_path);
  if (error || !image) return new NextResponse(null, { status: 404 });

  return new NextResponse(await imageBytes(image), {
    status: 200,
    headers: responseHeaders(etag),
  });
}

async function siteAssetResponse(assetId: string, filename: string) {
  if (filename !== "card.webp") return new NextResponse(null, { status: 404 });
  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("site_assets")
    .select("bucket_id,object_path")
    .eq("id", assetId)
    .eq("status", "ready")
    .maybeSingle();
  if (!asset) return new NextResponse(null, { status: 404 });
  const { data: image, error } = await admin.storage.from(asset.bucket_id).download(asset.object_path);
  if (error || !image) return new NextResponse(null, { status: 404 });
  return new NextResponse(await imageBytes(image), { status: 200, headers: responseHeaders(`"${assetId}"`) });
}

async function imageBytes(image: Blob) {
  const bytes = new Uint8Array(await image.arrayBuffer());
  // Legacy prepared demo files can contain a UTF-8 BOM before the WebP RIFF header.
  // Strip it at delivery time so browsers receive a standards-compliant image.
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.slice(3) : bytes;
}

function responseHeaders(etag: string) {
  return {
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline; filename=steadfast-property.webp",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": "image/webp",
    "Cross-Origin-Resource-Policy": "same-site",
    ETag: etag,
    "X-Robots-Tag": "noimageindex, noarchive",
    "X-Content-Type-Options": "nosniff",
  };
}
