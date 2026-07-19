import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

for (const file of [".env.local", ".env.production.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch { /* optional local environment file */ }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const variants = [
  { name: "thumbnail", width: 480, height: 360, quality: 76 },
  { name: "card", width: 960, height: 720, quality: 80 },
  { name: "gallery", width: 1920, height: 1440, quality: 84 },
];

const { data: publicMedia, error: publicMediaError } = await supabase
  .from("public_listing_media")
  .select("listing_id,media_id");
if (publicMediaError) throw publicMediaError;

const uniqueMedia = [...new Map((publicMedia ?? []).map((row) => [row.media_id, row])).values()];
let rebuilt = 0;
for (const media of uniqueMedia) {
  const { data: source, error: sourceError } = await supabase
    .from("listing_media")
    .select("id,listing_id,bucket_id,object_path")
    .eq("id", media.media_id)
    .single();
  if (sourceError || !source) throw sourceError ?? new Error("Missing source media.");
  const { data: sourceBlob, error: downloadError } = await supabase.storage.from(source.bucket_id).download(source.object_path);
  if (downloadError || !sourceBlob) throw downloadError ?? new Error("Missing source bytes.");
  const sourceBytes = Buffer.from(await sourceBlob.arrayBuffer());

  for (const variant of variants) {
    const bytes = await sharp(sourceBytes, { animated: false, failOn: "error", limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: variant.width, height: variant.height, fit: "inside", withoutEnlargement: true })
      .webp({ effort: 4, quality: variant.quality, smartSubsample: true })
      .toBuffer();
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== "webp") throw new Error("Generated image failed verification.");
    const objectPath = `${source.listing_id}/${source.id}/${variant.name}.webp`;
    const { error: uploadError } = await supabase.storage.from("listing-public-derivatives").upload(objectPath, bytes, {
      cacheControl: "31536000", contentType: "image/webp", upsert: true,
    });
    if (uploadError) throw uploadError;
    const { error: updateError } = await supabase.from("listing_media_derivatives").update({
      byte_size: bytes.byteLength,
      width: metadata.width,
      height: metadata.height,
      content_hash: createHash("sha256").update(bytes).digest("hex"),
      updated_at: new Date().toISOString(),
    }).eq("listing_id", source.listing_id).eq("media_id", source.id).eq("variant", variant.name);
    if (updateError) throw updateError;
    rebuilt += 1;
  }
}
console.log(`Rebuilt ${rebuilt} public image derivatives from ${uniqueMedia.length} validated source images.`);
