"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActiveMembershipContext, requireAccount } from "@/lib/auth/session";
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
  const canCreate = (Boolean(context.membership)
    && (context.roles.includes("agent") || context.roles.includes("broker")))
    || (context.independentAgent && !context.membership);
  if (!canCreate) redirect("/access-denied?reason=listing-creation");

  const parsed = createListingDraftSchema.safeParse(readDraftInput(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the listing details." };
  }

  const listingId = randomUUID();
  if (context.independentAgent && !context.membership) {
    const admin = createAdminClient();
    const { data: jamaica } = await admin.from("countries").select("id").eq("code", "JM").maybeSingle();
    const { data: area } = jamaica ? await admin.from("administrative_areas").select("id,name").eq("id", parsed.data.administrativeAreaId).eq("country_id", jamaica.id).maybeSingle() : { data: null };
    if (!jamaica || !area) return { error: "Choose a valid Jamaican parish." };
    const normalizedAddress = `${parsed.data.addressLine1} ${parsed.data.addressLine2} ${parsed.data.postalCode} ${area.name} Jamaica`.trim().replace(/\s+/g, " ").toLowerCase();
    const fingerprint = createHash("sha256").update(`${context.person.id}|${parsed.data.propertyType}|${normalizedAddress}`).digest("hex");
    let propertyId: string;
    const { data: existing } = await admin.from("properties").select("id").is("created_by_brokerage_id", null).eq("created_by_person_id", context.person.id).eq("address_fingerprint", fingerprint).maybeSingle();
    if (existing) {
      propertyId = existing.id;
    } else {
      const { data: address, error: addressError } = await admin.from("property_addresses").insert({
        country_id: jamaica.id, administrative_area_id: area.id, address_line_1: parsed.data.addressLine1,
        address_line_2: parsed.data.addressLine2 || null, postal_code: parsed.data.postalCode || null,
        normalized_address: normalizedAddress, created_by_brokerage_id: null, created_by_person_id: context.person.id,
      }).select("id").single();
      if (addressError || !address) return { error: "The property address could not be saved. Please try again." };
      const { data: property, error: propertyError } = await admin.from("properties").insert({
        created_by_brokerage_id: null, created_by_person_id: context.person.id, property_type: parsed.data.propertyType,
        address_id: address.id, address_fingerprint: fingerprint,
      }).select("id").single();
      if (propertyError || !property) return { error: "The property record could not be saved. Please try again." };
      propertyId = property.id;
    }
    const publicLocationLabel = parsed.data.publicLocationPrecision === "hidden" ? null : parsed.data.publicLocationPrecision === "area" ? area.name : `${parsed.data.addressLine1}, ${area.name}`;
    const contentHash = createHash("sha256").update(JSON.stringify(toCommandPayload(parsed.data))).digest("hex");
    const { error: listingError } = await admin.from("listings").insert({ id: listingId, brokerage_id: null, independent_owner_person_id: context.person.id, property_id: propertyId, created_by_person_id: context.person.id });
    if (listingError) return { error: "The independent listing draft could not be created. Please try again." };
    const { data: version, error: versionError } = await admin.from("listing_versions").insert({
      listing_id: listingId, version_number: 1, purpose: parsed.data.purpose, property_type: parsed.data.propertyType,
      property_subtype: parsed.data.propertySubtype || null, currency: "JMD", price: parsed.data.price,
      price_period: parsed.data.pricePeriod || null, title: parsed.data.title, description: parsed.data.description,
      bedrooms: parsed.data.bedrooms, bathrooms: parsed.data.bathrooms, building_area: parsed.data.buildingArea,
      land_area: parsed.data.landArea, area_unit: parsed.data.areaUnit || null, visibility: parsed.data.visibility,
      public_location_precision: parsed.data.publicLocationPrecision, public_location_label: publicLocationLabel,
      content_hash: contentHash, created_by_person_id: context.person.id,
    }).select("id").single();
    if (versionError || !version) return { error: "The independent listing version could not be created. Please try again." };
    await admin.from("listing_state_events").insert({ listing_id: listingId, from_state: null, to_state: "draft", source_version_id: version.id, actor_person_id: context.person.id, reason: "Independent agent listing draft created" });
    await admin.from("audit_events").insert({ actor_person_id: context.person.id, effective_role_key: "agent", brokerage_id: null, action: "listing.draft_created", target_type: "listing", target_id: listingId, source: "web", correlation_id: randomUUID(), after_summary: { lifecycle_state: "draft", ownership: "independent" } });
    revalidatePath("/workspace/listings");
    return { listingId, returnTo };
  }
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

const transferOutSchema = z.object({
  listingId: z.string().uuid(),
  recipientPersonId: z.string().uuid(),
});

/** Starts an auditable handoff. The database command verifies broker authority
 * and that the receiving person is an active independent agent. */
export async function initiateListingTransferOutAction(formData: FormData) {
  const parsed = transferOutSchema.safeParse({
    listingId: readText(formData, "listingId"),
    recipientPersonId: readText(formData, "recipientPersonId"),
  });
  if (!parsed.success) redirect("/workspace/listings?error=Choose+an+eligible+independent+agent.");

  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  if (!context.membership || !context.roles.includes("broker")) {
    redirect(`/workspace/listings/${parsed.data.listingId}?error=Only+the+broker+can+transfer+a+listing+out.`);
  }
  const { error } = await context.supabase.from("initiate_listing_transfer_out_commands").insert({
    request_id: randomUUID(),
    listing_id: parsed.data.listingId,
    recipient_person_id: parsed.data.recipientPersonId,
  });
  if (error) {
    redirect(`/workspace/listings/${parsed.data.listingId}?error=${encodeURIComponent("The transfer could not be started. Confirm the recipient is an active independent agent and the listing is eligible.")}`);
  }
  revalidatePath("/workspace/listings");
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  revalidatePath("/account/notifications");
  redirect(`/workspace/listings?status=all&notice=${encodeURIComponent("Transfer request sent. The listing is now unpublished while the independent agent decides.")}`);
}

const transferResponseSchema = z.object({
  transferId: z.string().uuid(),
  decision: z.enum(["accept", "decline"]),
  reason: z.string().trim().max(1000),
});

export async function respondToListingTransferOutAction(formData: FormData) {
  const parsed = transferResponseSchema.safeParse({
    transferId: readText(formData, "transferId"),
    decision: readText(formData, "decision"),
    reason: readText(formData, "reason"),
  });
  if (!parsed.success) redirect("/account/transfers?error=The+transfer+response+is+invalid.");
  const account = await requireAccount("/account/transfers");
  const { error } = await account.supabase.from("respond_listing_transfer_out_commands").insert({
    request_id: parsed.data.transferId,
    decision: parsed.data.decision,
    response_reason: parsed.data.reason || null,
  });
  if (error) redirect(`/account/transfers?error=${encodeURIComponent("This transfer could not be completed. Its eligibility may have changed.")}`);
  revalidatePath("/account/transfers");
  revalidatePath("/account/notifications");
  revalidatePath("/workspace/listings");
  redirect(`/account/transfers?notice=${encodeURIComponent(parsed.data.decision === "accept" ? "Transfer accepted. The listing is now your private independent-agent draft." : "Transfer declined. The brokerage has been notified and the listing remains unpublished.")}`);
}

const listingClosureRequestSchema = z.object({
  listingId: z.string().uuid(),
  expectedLockVersion: z.coerce.number().int().positive(),
  requestedLifecycleState: z.enum(["active", "sold", "rented"]),
});

export async function requestListingClosureAction(formData: FormData) {
  const parsed = listingClosureRequestSchema.safeParse({
    listingId: readText(formData, "listingId"),
    expectedLockVersion: readText(formData, "expectedLockVersion"),
    requestedLifecycleState: readText(formData, "requestedLifecycleState"),
  });
  if (!parsed.success) redirect("/workspace/listings?error=Choose+a+valid+listing+outcome.");

  const context = await getActiveMembershipContext(`/workspace/listings/${parsed.data.listingId}`);
  const canEdit = Boolean(context.membership) && (
    context.roles.includes("agent")
    || context.roles.includes("broker")
    || context.permissions.some((permission) => permission.permission_key === "listing.manage" && permission.effect === "allow")
  );
  if (!canEdit) redirect(`/workspace/listings/${parsed.data.listingId}?error=You+do+not+have+permission+to+change+this+listing.`);

  const { error } = await context.supabase.from("request_listing_closure_commands").insert({
    request_id: randomUUID(),
    listing_id: parsed.data.listingId,
    expected_lock_version: parsed.data.expectedLockVersion,
    requested_lifecycle_state: parsed.data.requestedLifecycleState,
  });
  if (error?.code === "40001") {
    redirect(`/workspace/listings/${parsed.data.listingId}?error=${encodeURIComponent("This draft changed after the page opened. Reload it before changing the outcome.")}`);
  }
  if (error) {
    redirect(`/workspace/listings/${parsed.data.listingId}?error=${encodeURIComponent("The listing outcome could not be saved. Confirm that this is an active listing opened for editing.")}`);
  }

  revalidatePath("/workspace/listings");
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  const notice = parsed.data.requestedLifecycleState === "active"
    ? "This edit will keep the listing active after brokerage approval."
    : `Close as ${parsed.data.requestedLifecycleState} saved. Submit the edit for brokerage approval when ready.`;
  redirect(`/workspace/listings?status=edits&notice=${encodeURIComponent(notice)}`);
}

export async function saveListingDraftAction(formData: FormData): Promise<SaveListingDraftResult> {
  const context = await getActiveMembershipContext("/workspace/listings");
  const canWorkWithListings = Boolean(context.membership) && (
    context.roles.includes("agent")
    || context.roles.includes("broker")
    || context.permissions.some((permission) => permission.permission_key === "listing.manage" && permission.effect === "allow")
  );
  if (!canWorkWithListings && !context.independentAgent) return { status: "error", error: "You no longer have listing access." };

  const parsed = updateListingDraftSchema.safeParse({
    ...readDraftInput(formData),
    listingId: readText(formData, "listingId"),
    expectedLockVersion: readText(formData, "expectedLockVersion"),
    saveMode: readText(formData, "saveMode"),
  });
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0]?.message ?? "Check the draft details." };
  }

  if (context.independentAgent && !context.membership) {
    const admin = createAdminClient();
    const { data: listing } = await admin.from("listings")
      .select("id,lock_version,property_id,lifecycle_state,independent_owner_person_id")
      .eq("id", parsed.data.listingId).maybeSingle();
    if (!listing || listing.independent_owner_person_id !== context.person.id || listing.lifecycle_state !== "draft") {
      return { status: "error", error: "This independent listing is no longer editable." };
    }
    if (listing.lock_version !== parsed.data.expectedLockVersion) {
      return { status: "conflict", error: "A newer save exists. Reload the latest draft before continuing." };
    }
    const [{ data: version }, { data: property }] = await Promise.all([
      admin.from("listing_versions").select("id").eq("listing_id", listing.id).eq("revision_state", "working_draft").order("version_number", { ascending: false }).limit(1).maybeSingle(),
      admin.from("properties").select("address_id").eq("id", listing.property_id).maybeSingle(),
    ]);
    const { data: address } = property?.address_id
      ? await admin.from("property_addresses").select("administrative_area_id,address_line_1,address_line_2,postal_code").eq("id", property.address_id).maybeSingle()
      : { data: null };
    if (!version || !address || address.administrative_area_id !== parsed.data.administrativeAreaId || address.address_line_1 !== parsed.data.addressLine1 || (address.address_line_2 ?? "") !== parsed.data.addressLine2 || (address.postal_code ?? "") !== parsed.data.postalCode) {
      return { status: "error", error: "Transferred independent listings keep their verified address. You can edit the marketing details, price, audience, and photographs." };
    }
    const payload = toCommandPayload(parsed.data);
    const contentHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const { error: versionError } = await admin.from("listing_versions").update({
      purpose: payload.purpose, property_type: payload.property_type, property_subtype: payload.property_subtype,
      price: payload.price, price_period: payload.price_period, title: payload.title, description: payload.description,
      bedrooms: payload.bedrooms, bathrooms: payload.bathrooms, building_area: payload.building_area,
      land_area: payload.land_area, area_unit: payload.area_unit, visibility: payload.visibility,
      public_location_precision: payload.public_location_precision, content_hash: contentHash,
    }).eq("id", version.id);
    if (versionError) return { status: "error", error: "This draft could not be saved. Your entered details are still on this page." };
    const savedAt = new Date().toISOString();
    await admin.from("listings").update({ lock_version: listing.lock_version + 1, updated_at: savedAt }).eq("id", listing.id).eq("lock_version", listing.lock_version);
    revalidatePath("/workspace/listings");
    revalidatePath(`/workspace/listings/${listing.id}`);
    return { status: "saved", lockVersion: listing.lock_version + 1, savedAt };
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
  if (!context.membership && !context.independentAgent) return { status: "error", error: "You no longer have listing access." };

  const mediaId = randomUUID();
  const mimeType = parsed.data.mimeType as SupportedImageMime;
  const path = context.independentAgent && !context.membership
    ? `independent/${context.person.id}/${parsed.data.listingId}/${mediaId}/original.${extensionForMime(mimeType)}`
    : `${context.membership!.brokerage_id}/${parsed.data.listingId}/${mediaId}/original.${extensionForMime(mimeType)}`;
  if (context.independentAgent && !context.membership) {
    const admin = createAdminClient();
    const { data: listing } = await admin.from("listings").select("id,lifecycle_state,independent_owner_person_id").eq("id", parsed.data.listingId).maybeSingle();
    const { data: version } = listing ? await admin.from("listing_versions").select("id").eq("listing_id", listing.id).eq("revision_state", "working_draft").order("version_number", { ascending: false }).limit(1).maybeSingle() : { data: null };
    if (!listing || !version || listing.lifecycle_state !== "draft" || listing.independent_owner_person_id !== context.person.id) return { status: "error", error: "This independent listing is no longer editable." };
    const { count } = await admin.from("listing_media").select("id", { count: "exact", head: true }).eq("listing_id", listing.id).not("status", "in", "(rejected,removed)");
    if ((count ?? 0) >= 30) return { status: "error", error: "A listing can have no more than 30 images." };
    const { data: existing } = await admin.from("listing_version_media").select("position").eq("listing_version_id", version.id).order("position", { ascending: false }).limit(1);
    const nextPosition = (existing?.[0]?.position ?? 0) + 1;
    const { error: mediaError } = await admin.from("listing_media").insert({ id: mediaId, listing_id: listing.id, brokerage_id: null, object_path: path, original_filename: parsed.data.filename, declared_mime_type: mimeType, declared_byte_size: parsed.data.byteSize, uploaded_by_person_id: context.person.id });
    if (mediaError) return { status: "error", error: "This image could not be added to the private draft." };
    const { error: linkError } = await admin.from("listing_version_media").insert({ listing_version_id: version.id, listing_id: listing.id, media_id: mediaId, position: nextPosition });
    if (linkError) return { status: "error", error: "This image could not be attached to the draft." };
  } else {
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
  }

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
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  redirect("/workspace/listings?status=pending&notice=Submitted+to+your+brokerage+for+approval.");
}

/** Publishes a transferred independent-agent draft without brokerage review.
 * The server verifies independent status, ownership, public visibility and
 * validated media before exposing a sanitized marketplace snapshot. */
export async function publishIndependentListingAction(
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
  if (!context.independentAgent || context.membership) return { error: "Independent publishing is not available for this account." };
  const admin = createAdminClient();
  const { data: listing } = await admin.from("listings")
    .select("id,property_id,brokerage_id,independent_owner_person_id,lifecycle_state,lock_version")
    .eq("id", parsed.data.listingId).maybeSingle();
  if (!listing || listing.brokerage_id || listing.independent_owner_person_id !== context.person.id || listing.lifecycle_state !== "draft" || listing.lock_version !== parsed.data.expectedLockVersion) {
    return { error: "This independent draft changed or is no longer available. Reload it before publishing." };
  }
  const { data: version } = await admin.from("listing_versions")
    .select("id,purpose,property_type,property_subtype,currency,price,price_period,title,description,bedrooms,bathrooms,building_area,land_area,area_unit,visibility,public_location_precision,public_location_label,content_hash")
    .eq("id", parsed.data.listingVersionId).eq("listing_id", listing.id).eq("revision_state", "working_draft").maybeSingle();
  if (!version || version.visibility !== "public" || !version.content_hash) return { error: "Choose Public visibility and save the complete draft before publishing." };
  const { data: mediaLinks } = await admin.from("listing_version_media").select("media_id").eq("listing_version_id", version.id);
  const mediaIds = (mediaLinks ?? []).map((link) => link.media_id);
  const { count: readyMediaCount } = mediaIds.length ? await admin.from("listing_media").select("id", { count: "exact", head: true }).in("id", mediaIds).eq("status", "ready") : { count: 0 };
  if (!readyMediaCount) return { error: "Add at least one validated property image before publishing." };
  const [{ data: property }, { data: agentSite }] = await Promise.all([
    admin.from("properties").select("address_id").eq("id", listing.property_id).maybeSingle(),
    admin.from("professional_sites").select("slug").eq("owner_person_id", context.person.id).eq("site_type", "agent").maybeSingle(),
  ]);
  const { data: address } = property?.address_id ? await admin.from("property_addresses").select("administrative_area_id").eq("id", property.address_id).maybeSingle() : { data: null };
  const { data: area } = address ? await admin.from("administrative_areas").select("id,code,name").eq("id", address.administrative_area_id).maybeSingle() : { data: null };
  if (!area) return { error: "The property location is incomplete and cannot be published." };
  const now = new Date().toISOString();
  try {
    await ensureApprovedVersionDerivatives(admin, listing.id, version.id);
    const { error: approveError } = await admin.from("listing_versions").update({ revision_state: "approved", approved_at: now, approved_by_person_id: context.person.id }).eq("id", version.id);
    if (approveError) throw approveError;
    const { error: listingError } = await admin.from("listings").update({ lifecycle_state: "active", current_approved_version_id: version.id, published_at: now, unpublished_at: null, lock_version: listing.lock_version + 1, updated_at: now }).eq("id", listing.id).eq("lock_version", listing.lock_version);
    if (listingError) throw listingError;
    const { error: snapshotError } = await admin.from("public_listing_snapshots").upsert({
      listing_id: listing.id, approved_version_id: version.id, brokerage_id: null, brokerage_name: null, brokerage_slug: null,
      assigned_agent_person_id: context.person.id, assigned_agent_name: context.person.display_name, assigned_agent_slug: agentSite?.slug ?? null,
      lifecycle_state: "active", purpose: version.purpose, property_type: version.property_type, property_subtype: version.property_subtype,
      currency: version.currency, price: version.price, price_period: version.price_period, title: version.title, description: version.description,
      bedrooms: version.bedrooms, bathrooms: version.bathrooms, building_area: version.building_area, land_area: version.land_area, area_unit: version.area_unit,
      administrative_area_id: area.id, administrative_area_code: area.code, administrative_area_name: area.name,
      public_location_precision: version.public_location_precision, public_location_label: version.public_location_label,
      public_latitude: null, public_longitude: null, ready_media_count: readyMediaCount, published_at: now, updated_at: now,
    }, { onConflict: "listing_id" });
    if (snapshotError) throw snapshotError;
    await admin.from("publication_records").upsert({ listing_id: listing.id, surface: "marketplace", status: "active", approved_version_id: version.id, published_at: now, removed_at: null, removal_reason: null, updated_at: now }, { onConflict: "listing_id,surface" });
  } catch {
    return { error: "The listing could not be published. Its private draft is still available; please try again." };
  }
  revalidatePath("/properties");
  revalidatePath("/workspace/listings");
  revalidatePath(`/workspace/listings/${listing.id}`);
  redirect(`/workspace/listings?status=published&notice=${encodeURIComponent("Your independent listing is now published.")}`);
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
  let approvedOutcome: "sold" | "rented" | null = null;
  if (parsed.data.decision === "approved") {
    const admin = createAdminClient();
    const { data: approvedListing } = await admin
      .from("listings")
      .select("id,lifecycle_state,current_approved_version_id,lock_version")
      .eq("id", parsed.data.listingId)
      .maybeSingle();
    const { data: approvedVersion } = approvedListing?.current_approved_version_id
      ? await admin.from("listing_versions").select("id,visibility,requested_lifecycle_state").eq("id", approvedListing.current_approved_version_id).maybeSingle()
      : { data: null };
    approvedOutcome = approvedVersion?.requested_lifecycle_state === "sold" || approvedVersion?.requested_lifecycle_state === "rented"
      ? approvedVersion.requested_lifecycle_state
      : null;

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
  revalidatePath(`/workspace/listings/${parsed.data.listingId}`);
  const notice = parsed.data.decision === "approved"
    ? approvedOutcome === "sold"
      ? "Listing approved and closed as sold."
      : approvedOutcome === "rented"
        ? "Listing approved and closed as rented."
        : published
      ? "Listing approved and published to the public marketplace."
      : activationNeedsAttention
        ? "Listing approved, but public publication needs attention. Open the listing to complete the safety checks."
        : "Listing approved. Its requested private or agents-only visibility has been retained."
    : parsed.data.decision === "changes_requested"
      ? "Changes requested. A new editable draft is ready for the agent."
      : "Submission rejected and retained in its review history.";
  const destinationStatus = approvedOutcome
    ? "closed"
    : parsed.data.decision === "approved"
      ? published ? "published" : "all"
      : parsed.data.decision === "changes_requested"
        ? "edits"
        : "closed";
  redirect(`/workspace/listings?status=${destinationStatus}&notice=${encodeURIComponent(notice)}`);
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
  redirect("/workspace/listings?status=published&notice=Listing+is+now+active+in+the+public+marketplace.");
}
