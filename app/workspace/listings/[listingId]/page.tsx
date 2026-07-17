import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AccountHeader } from "@/app/components/account-header";
import { EditListingForm, type EditableListingDraft } from "@/app/components/edit-listing-form";
import { ListingMediaUploader } from "@/app/components/listing-media-uploader";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { LISTING_MEDIA_BUCKET } from "@/lib/media/constants";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Listing draft", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type DraftVersion = {
  id: string;
  version_number: number;
  revision_state: string;
  purpose: EditableListingDraft["purpose"];
  property_type: EditableListingDraft["propertyType"];
  property_subtype: string | null;
  price: number;
  price_period: EditableListingDraft["pricePeriod"] | null;
  title: string;
  description: string;
  bedrooms: number | null;
  bathrooms: number | null;
  building_area: number | null;
  land_area: number | null;
  area_unit: EditableListingDraft["areaUnit"] | null;
  visibility: EditableListingDraft["visibility"];
  public_location_precision: EditableListingDraft["publicLocationPrecision"];
};
type Address = { administrative_area_id: string; address_line_1: string; address_line_2: string | null; postal_code: string | null };
type Property = { property_addresses: Address | null };

export default async function ListingDraftPage({ params }: { params: Promise<{ listingId: string }> }) {
  const route = await params;
  if (!z.string().uuid().safeParse(route.listingId).success) redirect("/access-denied?reason=listing-record");
  const context = await getActiveMembershipContext(`/workspace/listings/${route.listingId}`);
  if (!context.membership) redirect("/access-denied?reason=brokerage-membership");
  const access = deriveWorkspaceAccess({ hasMembership: true, roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.isAgent && !access.canReviewListings) redirect("/access-denied?reason=listing-workspace");

  const [{ data: listing }, { data: parishes }] = await Promise.all([
    context.supabase.from("listings").select("id,lifecycle_state,lock_version,updated_at,properties(property_addresses(administrative_area_id,address_line_1,address_line_2,postal_code)),listing_versions(id,version_number,revision_state,purpose,property_type,property_subtype,price,price_period,title,description,bedrooms,bathrooms,building_area,land_area,area_unit,visibility,public_location_precision)").eq("id", route.listingId).single(),
    context.supabase.from("administrative_areas").select("id,name").eq("area_type", "parish").order("name"),
  ]);
  if (!listing) redirect("/access-denied?reason=listing-record");

  const versions = (listing.listing_versions as unknown as DraftVersion[]).sort((a, b) => b.version_number - a.version_number);
  const version = versions.find((item) => item.revision_state === "working_draft") ?? versions[0];
  const property = listing.properties as unknown as Property | null;
  const address = property?.property_addresses;
  const brokerage = context.membership.brokerages as unknown as { display_name?: string } | null;
  const editable = listing.lifecycle_state === "draft" && version?.revision_state === "working_draft" && address;

  const initial: EditableListingDraft | null = editable ? {
    listingId: listing.id,
    lockVersion: listing.lock_version,
    administrativeAreaId: address.administrative_area_id,
    addressLine1: address.address_line_1,
    addressLine2: address.address_line_2 ?? "",
    postalCode: address.postal_code ?? "",
    purpose: version.purpose,
    propertyType: version.property_type,
    propertySubtype: version.property_subtype ?? "",
    price: String(version.price),
    pricePeriod: version.price_period ?? "",
    title: version.title,
    description: version.description,
    bedrooms: version.bedrooms === null ? "" : String(version.bedrooms),
    bathrooms: version.bathrooms === null ? "" : String(version.bathrooms),
    buildingArea: version.building_area === null ? "" : String(version.building_area),
    landArea: version.land_area === null ? "" : String(version.land_area),
    areaUnit: version.area_unit ?? "",
    visibility: version.visibility,
    publicLocationPrecision: version.public_location_precision,
  } : null;

  const { data: mediaLinks } = version ? await context.supabase
    .from("listing_version_media")
    .select("position,listing_media(id,original_filename,object_path,status,width,height)")
    .eq("listing_version_id", version.id)
    .order("position") : { data: [] };
  const linkedMedia = (mediaLinks ?? []).map((link) => link.listing_media as unknown as {
    id: string;
    original_filename: string;
    object_path: string;
    status: string;
    width: number | null;
    height: number | null;
  } | null).filter((media): media is NonNullable<typeof media> => Boolean(media));
  const reservedCount = linkedMedia.filter((media) => !["rejected", "removed"].includes(media.status)).length;
  const admin = createAdminClient();
  const readyImages = (await Promise.all(linkedMedia.filter((media) => media.status === "ready" && media.width && media.height).map(async (media) => {
    const { data } = await admin.storage.from(LISTING_MEDIA_BUCKET).createSignedUrl(media.object_path, 15 * 60);
    return data?.signedUrl ? {
      id: media.id,
      url: data.signedUrl,
      width: media.width as number,
      height: media.height as number,
      originalFilename: media.original_filename,
    } : null;
  }))).filter((media): media is NonNullable<typeof media> => Boolean(media));

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings />
    <section className="account-hero compact"><span className="eyebrow"><i /> Private listing</span><h1>{version?.title ?? "Listing record"}</h1><p>{brokerage?.display_name ?? "Your brokerage"} · {listing.lifecycle_state.replaceAll("_", " ")}</p></section>
    <div className="listing-wizard-shell">
      <div className="wizard-topline"><Link href="/workspace/listings">← Back to listings</Link><span>{initial ? "Autosave on · private draft" : "Read only"}</span></div>
      {initial ? <><EditListingForm key={`${listing.id}:${listing.lock_version}`} initial={initial} parishes={parishes ?? []} /><ListingMediaUploader listingId={listing.id} images={readyImages} reservedCount={reservedCount} /></> : <section className="locked-listing-card"><span>Editing closed</span><h2>This version is no longer an editable working draft.</h2><p>Submitted and approved versions are retained exactly as reviewed. The next workflow step will provide the appropriate review or new-revision action.</p></section>}
    </div>
  </main>;
}
