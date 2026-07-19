import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPublicImageDerivatives,
  PUBLIC_IMAGE_VARIANTS,
  type PublicImageVariant,
} from "./public-image-derivatives";

export const PUBLIC_DERIVATIVE_BUCKET = "listing-public-derivatives";

type AdminClient = ReturnType<typeof createAdminClient>;
type SourceMedia = {
  id: string;
  listing_id: string;
  bucket_id: string;
  object_path: string;
};

export async function generateAndStoreMediaDerivatives(
  admin: AdminClient,
  media: SourceMedia,
  suppliedSource?: Uint8Array,
) {
  let source = suppliedSource;
  if (!source) {
    const { data, error } = await admin.storage.from(media.bucket_id).download(media.object_path);
    if (error || !data) throw new Error("The validated source image is unavailable.");
    source = new Uint8Array(await data.arrayBuffer());
  }

  const derivatives = await createPublicImageDerivatives(source);
  for (const derivative of derivatives) {
    const objectPath = `${media.listing_id}/${media.id}/${derivative.variant}.webp`;
    const contentHash = createHash("sha256").update(derivative.bytes).digest("hex");
    const { error: uploadError } = await admin.storage
      .from(PUBLIC_DERIVATIVE_BUCKET)
      // Supabase Storage treats a plain Uint8Array inconsistently in the
      // Node runtime. A Buffer keeps the WebP bytes binary end-to-end.
      .upload(objectPath, Buffer.from(derivative.bytes), {
        cacheControl: "31536000",
        contentType: "image/webp",
        upsert: true,
      });
    if (uploadError) throw new Error("A public image derivative could not be stored.");

    const { error: recordError } = await admin.from("listing_media_derivatives").upsert({
      listing_id: media.listing_id,
      media_id: media.id,
      variant: derivative.variant,
      bucket_id: PUBLIC_DERIVATIVE_BUCKET,
      object_path: objectPath,
      mime_type: "image/webp",
      byte_size: derivative.bytes.byteLength,
      width: derivative.width,
      height: derivative.height,
      content_hash: contentHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: "media_id,variant" });
    if (recordError) throw new Error("A public image derivative could not be recorded.");
  }
}

export async function ensureApprovedVersionDerivatives(
  admin: AdminClient,
  listingId: string,
  approvedVersionId: string,
) {
  const { data: links, error: linkError } = await admin
    .from("listing_version_media")
    .select("media_id")
    .eq("listing_id", listingId)
    .eq("listing_version_id", approvedVersionId);
  if (linkError || !links?.length) throw new Error("The approved listing has no validated photographs.");

  const mediaIds = links.map((link) => link.media_id);
  const [{ data: mediaRows, error: mediaError }, { data: existing, error: derivativeError }] = await Promise.all([
    admin.from("listing_media")
      .select("id,listing_id,bucket_id,object_path,status")
      .eq("listing_id", listingId)
      .eq("status", "ready")
      .in("id", mediaIds),
    admin.from("listing_media_derivatives")
      .select("media_id,variant")
      .eq("listing_id", listingId)
      .in("media_id", mediaIds),
  ]);
  if (mediaError || derivativeError || !mediaRows || mediaRows.length !== mediaIds.length) {
    throw new Error("Every approved photograph must be validated before publication.");
  }

  const completeVariants = new Map<string, Set<PublicImageVariant>>();
  for (const row of existing ?? []) {
    const variants = completeVariants.get(row.media_id) ?? new Set<PublicImageVariant>();
    variants.add(row.variant as PublicImageVariant);
    completeVariants.set(row.media_id, variants);
  }
  for (const media of mediaRows) {
    const variants = completeVariants.get(media.id);
    const complete = PUBLIC_IMAGE_VARIANTS.every((variant) => variants?.has(variant.name));
    if (!complete) await generateAndStoreMediaDerivatives(admin, media);
  }
}
