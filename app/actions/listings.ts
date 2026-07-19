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
import {
  ensureApprovedVersionDerivatives,
  generateAndStoreMediaDerivatives,
} from "@/lib/media/publication-pipeline";

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

export type CreateListingDraftState = { error?: string; listingId?: string; returnTo?: string };

export async function createListingDraftAction(
  _previousState: CreateListingDraftState,
  formData: FormData,
): Promise<CreateListingDraftState> {
  const returnTo = readText(formData, "returnTo") === "/workspace/site" ? "/workspace/site" : "/workspace/listings";
  const context = await getActiveMembershipContext(returnTo);
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
  // Do not revalidate the website-builder route here. A create request may
  // carry selected File objects in its client component; refreshing that route
  // before its post-create upload effect runs would discard those files.
  return { listingId, returnTo };
}

export type SaveListingDraftResult =
  | { status: "saved"; lockVersion: number; savedAt: string }
  | { status: "conflict"; error: string }
  | { status: "error"; error: string };

export async function startActiveListingEditAction(formData: FormData) {
  const listingId = z.string().uuid().safeParse(readText(formData, "listingId"));
  if (!listingId.success) redirect("/workspace/listings?error=The+listing+reference+is+invalid.");

  const context = await getActiveMembershipContext(`/workspace/listings/${listingId.data}`);
  const canEdit = Boolean(context.membership) && (
    context.roles.includes("agent")
    || context.roles.includes("broker")
    || context.permissions.some((permission) => permission.permission_key === "listing.manage" && permission.effect === "allow")
  );
  if (!canEdit) redirect("/access-denied?reason=listing-edit");

  const { error } = await context.supabase.from("start_listing_edit_commands").insert({
    request_id: randomUUID(),
    listing_id: listingId.data,
  });
  if (error) {
    redirect(`/workspace/listings/${listingId.data}?error=${encodeURIComponent("This active listing could not be opened for editing.")}`);
  }

  revalidatePath("/properties");
  revalidatePath("/workspace/listings");
  revalidatePath(`/workspace/listings/${listingId.data}`);
  redirect(`/workspace/listings/${listingId.data}?notice=${encodeURIComponent("Editing is open. The listing is now private until the brokerage approves it again.")}`);
}

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

    await generateAndStoreMediaDerivatives(admin, {
      id: media.id,
      listing_id: media.listing_id,
      bucket_id: media.bucket_id,
      object_path: media.object_path,
    }, bytes);

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

const selectCoverMediaSchema = z.object({
  listingId: z.string().uuid(),
  mediaId: z.string().uuid(),
});

export type SelectListingCoverMediaState = {
  error?: string;
  coverMediaId?: string;
};

export async function selectListingCoverMediaAction(
  _previousState: SelectListingCoverMediaState,
  formData: FormData,
): Promise<SelectListingCoverMediaState> {
  const parsed = selectCoverMediaSchema.safeParse({
    listingId: readText(formData, "listingId"),
    mediaId: readText(formData, "mediaId"),
  });
  if (!parsed.success) return { error: "The selected cover image is invalid." };

  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  if (!context.membership) return { error: "You no longer have listing access." };

  const { error } = await context.supabase.from("select_listing_cover_media_commands").insert({
    request_id: randomUUID(),
    listing_id: parsed.data.listingId,
    media_id: parsed.data.mediaId,
  });
  if (error) return { error: "The cover photo could not be changed. Make sure this listing is still an editable draft." };

  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  return { coverMediaId: parsed.data.mediaId };
}

const removeListingMediaSchema = z.object({
  listingId: z.string().uuid(),
  mediaId: z.string().uuid(),
});

export type RemoveListingMediaState = { error?: string; removedMediaId?: string };

export async function removeListingMediaAction(
  _previousState: RemoveListingMediaState,
  formData: FormData,
): Promise<RemoveListingMediaState> {
  const parsed = removeListingMediaSchema.safeParse({
    listingId: readText(formData, "listingId"),
    mediaId: readText(formData, "mediaId"),
  });
  if (!parsed.success) return { error: "The selected image is invalid." };
  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  if (!context.membership) return { error: "You no longer have listing access." };
  const { error } = await context.supabase.from("remove_listing_media_commands").insert({
    request_id: randomUUID(), listing_id: parsed.data.listingId, media_id: parsed.data.mediaId,
  });
  if (error) return { error: "This image could not be removed. Only the current editable draft can be changed." };
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  return { removedMediaId: parsed.data.mediaId };
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

const submissionSchema = z.object({
  listingId: z.string().uuid(),
  listingVersionId: z.string().uuid(),
  expectedLockVersion: z.coerce.number().int().positive(),
});

export type SubmitListingState = { error?: string };

export async function submitListingForReviewAction(
  _previousState: SubmitListingState,
  formData: FormData,
): Promise<SubmitListingState> {
  const parsed = submissionSchema.safeParse({
    listingId: readText(formData, "listingId"),
    listingVersionId: readText(formData, "listingVersionId"),
    expectedLockVersion: readText(formData, "expectedLockVersion"),
  });
  if (!parsed.success) return { error: "The listing reference is invalid. Reload the draft and try again." };

  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  if (!context.membership) return { error: "You no longer have brokerage access." };
  const { error } = await context.supabase.from("submit_listing_version_commands").insert({
    request_id: randomUUID(),
    listing_id: parsed.data.listingId,
    listing_version_id: parsed.data.listingVersionId,
    expected_lock_version: parsed.data.expectedLockVersion,
  });
  if (error?.code === "40001") return { error: "This draft changed after the page opened. Reload it before submitting." };
  if (error) {
    if (error.message.includes("image checks")) return { error: "Wait for every image check to finish before submitting." };
    if (error.message.includes("validated property image")) return { error: "Add at least one valid property image before submitting." };
    return { error: "The listing could not be submitted. Confirm the details, images, and active representative." };
  }

  revalidatePath("/workspace");
  revalidatePath("/workspace/listings");
  revalidatePath("/workspace/reviews");
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  redirect(`/workspace/listings/${parsed.data.listingId}?notice=Submitted+to+your+brokerage+for+review.`);
}

const reviewDecisionSchema = z.object({
  listingId: z.string().uuid(),
  listingVersionId: z.string().uuid(),
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  comment: z.string().trim().max(4000),
  confirmDenial: z.string(),
}).superRefine((value, context) => {
  if (value.decision !== "approved" && !value.comment) {
    context.addIssue({ code: "custom", path: ["comment"], message: "Explain the required correction or rejection reason." });
  }
  if (value.decision === "rejected" && value.confirmDenial !== "yes") {
    context.addIssue({ code: "custom", path: ["confirmDenial"], message: "Confirm that you want to deny this listing." });
  }
});

export type ReviewListingState = { error?: string };

export async function decideListingReviewAction(
  _previousState: ReviewListingState,
  formData: FormData,
): Promise<ReviewListingState> {
  const parsed = reviewDecisionSchema.safeParse({
    listingId: readText(formData, "listingId"),
    listingVersionId: readText(formData, "listingVersionId"),
    decision: readText(formData, "decision"),
    comment: readText(formData, "comment"),
    confirmDenial: readText(formData, "confirmDenial"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the review decision." };

  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  const canReview = Boolean(context.membership) && (
    context.roles.includes("broker")
    || context.permissions.some((permission) => permission.permission_key === "listing.review" && permission.effect === "allow")
  );
  if (!canReview) return { error: "You do not have listing review authority." };

  const { error } = await context.supabase.from("decide_listing_review_commands").insert({
    request_id: randomUUID(),
    review_id: randomUUID(),
    listing_id: parsed.data.listingId,
    listing_version_id: parsed.data.listingVersionId,
    decision: parsed.data.decision,
    comment: parsed.data.comment || null,
  });
  if (error) return { error: "This submission could not be decided. It may already have been reviewed or its eligibility changed." };

  // A public submission is already broker-reviewed at this point. Complete the
  // same protected activation path automatically; private and agent-network
  // submissions intentionally remain off the public marketplace.
  let published = false;
  let activationNeedsAttention = false;
  if (parsed.data.decision === "approved") {
    const admin = createAdminClient();
    const { data: approvedListing } = await admin
      .from("listings")
      .select("id,lifecycle_state,current_approved_version_id,lock_version")
      .eq("id", parsed.data.listingId)
      .maybeSingle();
    const { data: approvedVersion } = approvedListing?.current_approved_version_id
      ? await admin.from("listing_versions").select("id,visibility").eq("id", approvedListing.current_approved_version_id).maybeSingle()
      : { data: null };

    if (approvedListing?.lifecycle_state === "approved_inactive" && approvedVersion?.visibility === "public") {
      try {
        await ensureApprovedVersionDerivatives(admin, approvedListing.id, approvedVersion.id);
        const { error: activationError } = await context.supabase.from("activate_public_listing_commands").insert({
          request_id: randomUUID(),
          listing_id: approvedListing.id,
          approved_version_id: approvedVersion.id,
          expected_lock_version: approvedListing.lock_version,
          confirm_publication: true,
        });
        published = !activationError;
        activationNeedsAttention = Boolean(activationError);
      } catch {
        activationNeedsAttention = true;
      }
    }
  }

  revalidatePath("/workspace");
  revalidatePath("/workspace/listings");
  revalidatePath("/workspace/reviews");
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  const notice = parsed.data.decision === "approved"
    ? published
      ? "Listing approved and published to the public marketplace."
      : activationNeedsAttention
        ? "Listing approved, but public publication needs attention. Open the listing to complete the safety checks."
        : "Listing approved. Its requested private or agents-only visibility has been retained."
    : parsed.data.decision === "changes_requested"
      ? "Changes requested. A new editable draft is ready for the agent."
      : "Submission rejected and retained in its review history.";
  redirect(`/workspace/reviews?notice=${encodeURIComponent(notice)}`);
}

const activatePublicListingSchema = z.object({
  listingId: z.string().uuid(),
  approvedVersionId: z.string().uuid(),
  expectedLockVersion: z.coerce.number().int().positive(),
  confirmPublication: z.literal("yes"),
});

export async function activatePublicListingAction(formData: FormData) {
  const parsed = activatePublicListingSchema.safeParse({
    listingId: readText(formData, "listingId"),
    approvedVersionId: readText(formData, "approvedVersionId"),
    expectedLockVersion: readText(formData, "expectedLockVersion"),
    confirmPublication: readText(formData, "confirmPublication"),
  });
  if (!parsed.success) redirect("/workspace/listings?error=Confirm+the+public+activation+request.");

  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  const canPublish = Boolean(context.membership) && (
    context.roles.includes("broker")
    || context.permissions.some((permission) => permission.permission_key === "listing.review" && permission.effect === "allow")
  );
  if (!canPublish) redirect(`/workspace/listings/${parsed.data.listingId}?error=You+do+not+have+listing+publication+authority.`);

  try {
    await ensureApprovedVersionDerivatives(
      createAdminClient(),
      parsed.data.listingId,
      parsed.data.approvedVersionId,
    );
  } catch {
    redirect(`/workspace/listings/${parsed.data.listingId}?error=Privacy-safe+photographs+could+not+be+prepared.+Please+try+activation+again.`);
  }

  const { error } = await context.supabase.from("activate_public_listing_commands").insert({
    request_id: randomUUID(),
    listing_id: parsed.data.listingId,
    approved_version_id: parsed.data.approvedVersionId,
    expected_lock_version: parsed.data.expectedLockVersion,
    confirm_publication: true,
  });
  if (error) {
    redirect(`/workspace/listings/${parsed.data.listingId}?error=Public+activation+failed.+Check+the+approved+visibility,+representative,+media,+and+brokerage+eligibility.`);
  }

  revalidatePath("/");
  revalidatePath("/properties");
  revalidatePath(`/properties/${parsed.data.listingId}`);
  revalidatePath("/workspace");
  revalidatePath("/workspace/listings");
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  redirect(`/workspace/listings/${parsed.data.listingId}?notice=Listing+is+now+active+in+the+public+marketplace.`);
}
