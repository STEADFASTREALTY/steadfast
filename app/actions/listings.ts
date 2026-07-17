"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { createListingDraftSchema, updateListingDraftSchema } from "@/lib/listings/validation";

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
