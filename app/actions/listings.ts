"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { createListingDraftSchema } from "@/lib/listings/validation";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
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

  const parsed = createListingDraftSchema.safeParse({
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
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the listing details." };
  }

  const listingId = randomUUID();
  const { error } = await context.supabase.from("create_listing_draft_commands").insert({
    listing_id: listingId,
    administrative_area_id: parsed.data.administrativeAreaId,
    address_line_1: parsed.data.addressLine1,
    address_line_2: parsed.data.addressLine2 || null,
    postal_code: parsed.data.postalCode || null,
    purpose: parsed.data.purpose,
    property_type: parsed.data.propertyType,
    property_subtype: parsed.data.propertySubtype || null,
    price: parsed.data.price,
    price_period: parsed.data.pricePeriod || null,
    title: parsed.data.title,
    description: parsed.data.description,
    bedrooms: parsed.data.bedrooms,
    bathrooms: parsed.data.bathrooms,
    building_area: parsed.data.buildingArea,
    land_area: parsed.data.landArea,
    area_unit: parsed.data.areaUnit || null,
    visibility: parsed.data.visibility,
    public_location_precision: parsed.data.publicLocationPrecision,
  });

  if (error) return { error: "The private draft could not be created. Please check the details and try again." };

  revalidatePath("/workspace");
  revalidatePath("/workspace/listings");
  redirect("/workspace/listings?notice=Private+draft+created.+Only+you+and+authorized+brokerage+reviewers+can+see+it.");
}
