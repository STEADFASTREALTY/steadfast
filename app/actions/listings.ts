"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { createListingDraftSchema, updateListingDraftSchema } from "@/lib/listings/validation";
import {
  extensionForMime,
  LISTING_MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  type ImageRejectionCode,
  type SupportedImageMime,
  validateImageBytes,
} from "@/lib/media/image-validation";
import { createAdminClient } from "@/lib/supabase/admin";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readDraftInput(formData: FormData) {
  return {
    administrativeAreaId: readText(formData, "administrativeAreaId"),
    addressLine1: readText(formData, "addressLine1"),
    addressLine2: readText(formData, "addressLine2"),
    postalCode: readText(formData, "postalCode"),
    purpose: readText(formData, "purpose"),
    propertyType: readText(formData, "propertyType"),
    propertySubtype: readText(formData, "propertySubtype"),
    price: readText(formData, "price"),
    pricePeriod: readText(formData, "pricePeriod"),
    title: readText(formData, "title"),
    description: readText(formData, "description"),
    bedrooms: readText(formData, "bedrooms"),
    bathrooms: readText(formData, "bathrooms"),
    buildingArea: readText(formData, "buildingArea"),
    landArea: readText(formData, "landArea"),
    areaUnit: readText(formData, "areaUnit"),
    visibility: readText(formData, "visibility"),
    publicLocationPrecision: readText(formData, "publicLocationPrecision"),
  };
}

function toCommandPayload(data: z.infer<typeof createListingDraftSchema>) {
  return {
    administrative_area_id: data.administrativeAreaId,
    address_line_1: data.addressLine1,
    address_line_2: data.addressLine2 || null,
    postal_code: data.postalCode || null,
    purpose: data.purpose,
    property_type: data.propertyType,
    property_subtype: data.propertySubtype || null,
    price: data.price,
    price_period: data.pricePeriod || null,
    title: data.title,
    description: data.description,
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    building_area: data.buildingArea,
    land_area: data.landArea,
    area_unit: data.areaUnit || null,
    visibility: data.visibility,
    public_location_precision: data.publicLocationPrecision,
  };
}

export type CreateListingDraftState = { error?: string };

export async function createListingDraftAction(
  _previousState: CreateListingDraftState,
  formData: FormData,
): Promise<CreateListingDraftState> {
  const context = await getActiveMembershipContext("/workspace/listings/new");
  const canCreate = Boolean(context.membership)
    && (context.roles.includes("agent") || context.roles.includes("broker"));
  if (!canCreate) redirect("/access-denied?reason=listing-creation");

  const parsed = createListingDraftSchema.safeParse(readDraftInput(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the listing details." };
  }

  const listingId = randomUUID();
  const { error } = await context.supabase.from("create_listing_draft_commands").insert({
    listing_id: listingId,
    ...toCommandPayload(parsed.data),
  });

  if (error) return { error: "The private draft could not be created. Please check the details and try again." };

  revalidatePath("/workspace");
  revalidatePath("/workspace/listings");
  redirect("/workspace/listings?notice=Private+draft+created.+Only+you+and+authorized+brokerage+reviewers+can+see+it.");
}

export type SaveListingDraftResult =
  | { status: "saved"; lockVersion: number; savedAt: string }
  | { status: "conflict"; error: string }
  | { status: "error"; error: string };

export async function saveListingDraftAction(formData: FormData): Promise<SaveListingDraftResult> {
  const context = await getActiveMembershipContext("/workspace/listings");
  const canWorkWithListings = Boolean(context.membership) && (
    context.roles.includes("agent")
    || context.roles.includes("broker")
    || context.permissions.some((permission) => permission.permission_key === "listing.manage" && permission.effect === "allow")
  );
  if (!canWorkWithListings) return { status: "error", error: "You no longer have listing access." };

  const parsed = updateListingDraftSchema.safeParse({
    ...readDraftInput(formData),
    listingId: readText(formData, "listingId"),
    expectedLockVersion: readText(formData, "expectedLockVersion"),
    saveMode: readText(formData, "saveMode"),
  });
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0]?.message ?? "Check the draft details." };
  }

  const { error } = await context.supabase.from("update_listing_draft_commands").insert({
    listing_id: parsed.data.listingId,
    expected_lock_version: parsed.data.expectedLockVersion,
    save_mode: parsed.data.saveMode,
    ...toCommandPayload(parsed.data),
  });
  if (error?.code === "40001") {
    return { status: "conflict", error: "A newer save exists. Reload the latest draft before continuing." };
  }
  if (error) return { status: "error", error: "This draft could not be saved. Your entered details are still on this page." };

  const { data: listing, error: readError } = await context.supabase
    .from("listings")
    .select("lock_version")
    .eq("id", parsed.data.listingId)
    .single();
  if (readError || !listing) return { status: "error", error: "The draft was saved, but its current version could not be confirmed. Reload before editing again." };

  revalidatePath("/workspace/listings");
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  return { status: "saved", lockVersion: listing.lock_version, savedAt: new Date().toISOString() };
}

const mediaAuthorizationSchema = z.object({
  listingId: z.string().uuid(),
  filename: z.string().trim().min(1).max(180).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Invalid file name."),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().min(1).max(MAX_IMAGE_BYTES),
});

export type AuthorizeMediaUploadResult =
  | { status: "authorized"; mediaId: string; path: string; token: string }
  | { status: "error"; error: string };

export async function authorizeListingMediaUploadAction(
  input: unknown,
): Promise<AuthorizeMediaUploadResult> {
  const parsed = mediaAuthorizationSchema.safeParse(input);
  if (!parsed.success) return { status: "error", error: "Choose a JPEG, PNG, or WebP image no larger than 15 MB." };

  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  if (!context.membership) return { status: "error", error: "You no longer have listing access." };

  const mediaId = randomUUID();
  const mimeType = parsed.data.mimeType as SupportedImageMime;
  const path = `${context.membership.brokerage_id}/${parsed.data.listingId}/${mediaId}/original.${extensionForMime(mimeType)}`;
  const { error: commandError } = await context.supabase
    .from("authorize_listing_media_upload_commands")
    .insert({
      media_id: mediaId,
      listing_id: parsed.data.listingId,
      original_filename: parsed.data.filename,
      declared_mime_type: mimeType,
      declared_byte_size: parsed.data.byteSize,
      object_path: path,
    });
  if (commandError) return { status: "error", error: "This image could not be added to the private draft." };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(LISTING_MEDIA_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) throw error ?? new Error("Upload token missing");
    return { status: "authorized", mediaId, path, token: data.token };
  } catch {
    const admin = createAdminClient();
    await admin.from("listing_media").update({
      status: "rejected",
      rejection_code: "validation_failed",
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", mediaId).eq("status", "awaiting_upload");
    return { status: "error", error: "Secure image uploads are temporarily unavailable." };
  }
}

export type FinalizeMediaUploadResult =
  | { status: "ready" }
  | { status: "rejected"; error: string }
  | { status: "error"; error: string };

export async function finalizeListingMediaUploadAction(mediaIdInput: unknown): Promise<FinalizeMediaUploadResult> {
  const mediaId = z.string().uuid().safeParse(mediaIdInput);
  if (!mediaId.success) return { status: "error", error: "The image reference is invalid." };

  const context = await getActiveMembershipContext("/workspace/listings");
  const { data: media, error: mediaError } = await context.supabase
    .from("listing_media")
    .select("id,listing_id,bucket_id,object_path,declared_mime_type,declared_byte_size,status,upload_expires_at")
    .eq("id", mediaId.data)
    .single();
  if (mediaError || !media || media.status !== "awaiting_upload") {
    return { status: "error", error: "This private upload is no longer available." };
  }

  const admin = createAdminClient();
  const now = new Date();
  if (new Date(media.upload_expires_at) < now) {
    await admin.storage.from(media.bucket_id).remove([media.object_path]);
    await admin.from("listing_media").update({ status: "removed", removed_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", media.id).eq("status", "awaiting_upload");
    return { status: "error", error: "The upload permission expired. Choose the image again." };
  }

  const { data: claimed } = await admin.from("listing_media")
    .update({ status: "validating", updated_at: now.toISOString() })
    .eq("id", media.id).eq("status", "awaiting_upload")
    .select("id").maybeSingle();
  if (!claimed) return { status: "error", error: "This image is already being checked." };

  try {
    const { data: object, error: downloadError } = await admin.storage.from(media.bucket_id).download(media.object_path);
    if (downloadError || !object) {
      await rejectMedia(admin, media.id, media.bucket_id, media.object_path, "missing_object");
      return { status: "rejected", error: "The image upload did not complete. Choose the file again." };
    }

    const bytes = new Uint8Array(await object.arrayBuffer());
    const result = validateImageBytes(
      bytes,
      media.declared_mime_type as SupportedImageMime,
      Number(media.declared_byte_size),
    );
    if (!result.valid) {
      await rejectMedia(admin, media.id, media.bucket_id, media.object_path, result.code);
      return { status: "rejected", error: rejectionMessage(result.code) };
    }

    const validatedAt = new Date().toISOString();
    const { error: readyError } = await admin.from("listing_media").update({
      status: "ready",
      detected_mime_type: result.mimeType,
      actual_byte_size: result.byteSize,
      width: result.width,
      height: result.height,
      validated_at: validatedAt,
      updated_at: validatedAt,
    }).eq("id", media.id).eq("status", "validating");
    if (readyError) throw readyError;

    revalidatePath(`/workspace/listings/${media.listing_id}`);
    return { status: "ready" };
  } catch {
    await admin.from("listing_media").update({ status: "awaiting_upload", updated_at: new Date().toISOString() })
      .eq("id", media.id).eq("status", "validating");
    return { status: "error", error: "The image could not be checked right now. Please try again." };
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function rejectMedia(
  admin: AdminClient,
  mediaId: string,
  bucketId: string,
  objectPath: string,
  code: ImageRejectionCode | "missing_object",
) {
  await admin.storage.from(bucketId).remove([objectPath]);
  const rejectedAt = new Date().toISOString();
  await admin.from("listing_media").update({
    status: "rejected",
    rejection_code: code,
    rejected_at: rejectedAt,
    updated_at: rejectedAt,
  }).eq("id", mediaId).eq("status", "validating");
}

function rejectionMessage(code: ImageRejectionCode) {
  if (code === "animated_image") return "Animated images are not accepted. Choose a still JPEG, PNG, or WebP image.";
  if (code === "dimensions_out_of_range" || code === "too_many_pixels") return "The image dimensions are outside the supported range.";
  if (code === "size_mismatch") return "The uploaded file did not match the selected image.";
  return "This file is not a valid JPEG, PNG, or WebP image.";
}
