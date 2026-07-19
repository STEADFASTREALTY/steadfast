import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AccountHeader } from "@/app/components/account-header";
import { EditListingForm, type EditableListingDraft } from "@/app/components/edit-listing-form";
import { ListingMediaUploader } from "@/app/components/listing-media-uploader";
import { ListingSubmissionPanel } from "@/app/components/listing-submission-panel";
import { ReviewDecisionForm } from "@/app/components/review-decision-form";
import { StatusMessage } from "@/app/components/status-message";
import { activatePublicListingAction } from "@/app/actions/listings";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { LISTING_MEDIA_BUCKET } from "@/lib/media/constants";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Listing draft", description: "Edit, review, and publish a private brokerage listing record.", robots: { index: false, follow: false } };
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
type ReviewRecord = { listing_version_id: string; reviewer_person_id: string; decision: string; comment: string | null; is_self_approval: boolean; decided_at: string };
type ListingActivity = { action: string; actor_person_id: string | null; reason: string | null; after_summary: Record<string, unknown> | null; occurred_at: string };

function activityLabel(activity: ListingActivity) {
  if (activity.action === "listing.draft_created") return "Listing draft created";
  if (activity.action === "listing.submitted") return "Submitted for brokerage approval";
  if (activity.action === "listing.reviewed") {
    const decision = typeof activity.after_summary?.decision === "string" ? activity.after_summary.decision : "reviewed";
    return decision === "approved" ? "Listing approved" : decision === "rejected" ? "Listing denied" : "Changes requested";
  }
  return activity.action.replace("listing.", "Listing ").replaceAll("_", " ");
}

export default async function ListingDraftPage({ params, searchParams }: { params: Promise<{ listingId: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const route = await params;
  const query = await searchParams;
  if (!z.string().uuid().safeParse(route.listingId).success) redirect("/access-denied?reason=listing-record");
  const context = await getActiveMembershipContext(`/workspace/listings/${route.listingId}`);
  if (!context.membership) redirect("/access-denied?reason=brokerage-membership");
  const access = deriveWorkspaceAccess({ hasMembership: true, roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.isAgent && !access.canReviewListings) redirect("/access-denied?reason=listing-workspace");

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("listings")
    .select("id,brokerage_id,created_by_person_id,property_id,lifecycle_state,lock_version,current_approved_version_id,updated_at")
    .eq("id", route.listingId)
    .maybeSingle();
  const isAuthorized = listing && (
    (access.canReviewListings && listing.brokerage_id === context.membership.brokerage_id) ||
    (!access.canReviewListings && listing.created_by_person_id === context.person.id)
  );
  if (!isAuthorized || !listing) redirect("/access-denied?reason=listing-record");

  const [{ data: versionRows }, { data: property }, { data: parishes }] = await Promise.all([
    admin.from("listing_versions").select("id,version_number,revision_state,purpose,property_type,property_subtype,price,price_period,title,description,bedrooms,bathrooms,building_area,land_area,area_unit,visibility,public_location_precision").eq("listing_id", listing.id),
    admin.from("properties").select("address_id").eq("id", listing.property_id).maybeSingle(),
    context.supabase.from("administrative_areas").select("id,name").eq("area_type", "parish").order("name"),
  ]);

  const versions = ((versionRows ?? []) as DraftVersion[]).sort((a, b) => b.version_number - a.version_number);
  const version = versions.find((item) => item.revision_state === "working_draft") ?? versions[0];
  const { data: address } = property?.address_id
    ? await admin.from("property_addresses").select("administrative_area_id,address_line_1,address_line_2,postal_code").eq("id", property.address_id).maybeSingle()
    : { data: null as Address | null };
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

  const { data: reviewRows } = await admin.from("listing_reviews")
    .select("listing_version_id,reviewer_person_id,decision,comment,is_self_approval,decided_at")
    .in("listing_version_id", versions.map((item) => item.id))
    .order("decided_at", { ascending: false });
  const reviews = (reviewRows ?? []) as ReviewRecord[];
  const { data: activityRows } = await admin.from("audit_events")
    .select("action,actor_person_id,reason,after_summary,occurred_at")
    .eq("target_type", "listing")
    .eq("target_id", listing.id)
    .order("occurred_at", { ascending: false });
  const activities = (activityRows ?? []) as ListingActivity[];
  const relatedPersonIds = [...new Set([
    ...reviews.map((review) => review.reviewer_person_id),
    ...activities.flatMap((activity) => activity.actor_person_id ? [activity.actor_person_id] : []),
  ])];
  const { data: relatedPeople } = relatedPersonIds.length
    ? await admin.from("people").select("id,display_name").in("id", relatedPersonIds)
    : { data: [] as Array<{ id: string; display_name: string }> };
  const namesByPersonId = new Map((relatedPeople ?? []).map((person) => [person.id, person.display_name]));

  const { data: mediaLinks } = version ? await admin
    .from("listing_version_media")
    .select("position,media_id")
    .eq("listing_version_id", version.id)
    .order("position") : { data: [] };
  const mediaIds = (mediaLinks ?? []).map((link) => link.media_id);
  const { data: mediaRows } = mediaIds.length
    ? await admin.from("listing_media").select("id,original_filename,object_path,status,width,height").in("id", mediaIds)
    : { data: [] };
  const mediaById = new Map((mediaRows ?? []).map((media) => [media.id, media]));
  const linkedMedia = (mediaLinks ?? []).map((link) => mediaById.get(link.media_id) as {
    id: string;
    original_filename: string;
    object_path: string;
    status: string;
    width: number | null;
    height: number | null;
  } | undefined).filter((media): media is NonNullable<typeof media> => Boolean(media));
  const reservedCount = linkedMedia.filter((media) => !["rejected", "removed"].includes(media.status)).length;
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
  const coverMediaId = mediaLinks?.find((link) => link.position === 1)?.media_id;
  const listingAudience = listing.lifecycle_state === "active" || listing.lifecycle_state === "under_offer"
    ? "Public listing"
    : version?.visibility === "professional_network"
      ? "Agents-only listing"
      : version?.visibility === "public"
        ? "Public listing"
        : "Private listing";

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings canReviewListings={access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} />
    <section className="account-hero compact"><span className="eyebrow"><i /> {listingAudience}</span><h1>{version?.title ?? "Listing record"}</h1><p>{brokerage?.display_name ?? "Your brokerage"} · {listing.lifecycle_state.replaceAll("_", " ")}</p></section>
    <div className="listing-wizard-shell">
      <div className="wizard-topline"><Link href="/workspace/listings">← Back to listings</Link><span>{initial ? "Autosave on · private draft" : "Read only"}</span></div>
      <StatusMessage notice={query.notice} error={query.error} />
      {initial ? <><EditListingForm key={`${listing.id}:${listing.lock_version}`} initial={initial} parishes={parishes ?? []} /><ListingMediaUploader listingId={listing.id} images={readyImages} reservedCount={reservedCount} coverMediaId={coverMediaId} /><ListingSubmissionPanel listingId={listing.id} listingVersionId={version.id} lockVersion={listing.lock_version} readyImageCount={readyImages.length} /></> : <>
        <section className="submitted-listing-summary">
          <div className="submitted-listing-heading"><span>Version {version?.version_number}</span><h2>{version?.revision_state === "submitted" ? "Submitted snapshot" : "Retained listing snapshot"}</h2><p>This content is immutable and shown exactly as it was submitted or decided.</p></div>
          <dl>
            <div><dt>Purpose</dt><dd>{version?.purpose === "sale" ? "For sale" : "Long-term rental"}</dd></div>
            <div><dt>Price</dt><dd>{version ? new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(version.price) : "—"}</dd></div>
            <div><dt>Property type</dt><dd>{version?.property_type.replaceAll("_", " ")}</dd></div>
            <div><dt>Visibility request</dt><dd>{version?.visibility.replaceAll("_", " ")}</dd></div>
            <div><dt>Bedrooms</dt><dd>{version?.bedrooms ?? "—"}</dd></div>
            <div><dt>Bathrooms</dt><dd>{version?.bathrooms ?? "—"}</dd></div>
          </dl>
          <article><h3>{version?.title}</h3><p>{version?.description}</p></article>
        </section>
        {readyImages.length ? <section className="submitted-media"><div><span>Validated media</span><h2>{readyImages.length} property image{readyImages.length === 1 ? "" : "s"}</h2></div><div className="approval-image-previews">{readyImages.map((image, index) => <figure key={image.id}>
          {/* Signed, short-lived private URL; optimization proxies must not persist the original. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={`Submitted property image ${index + 1}`} width={image.width} height={image.height} />
          <figcaption><span>Image {index + 1}</span><small>{image.width} × {image.height}</small></figcaption>
        </figure>)}</div></section> : null}
        {listing.lifecycle_state === "pending_initial_approval" && access.canReviewListings ? <ReviewDecisionForm listingId={listing.id} listingVersionId={version.id} /> : <section className="locked-listing-card"><span>{listing.lifecycle_state === "pending_initial_approval" ? "Brokerage review pending" : version?.revision_state.replaceAll("_", " ")}</span><h2>{listing.lifecycle_state === "pending_initial_approval" ? "This version is awaiting a brokerage decision." : "This listing version is retained as reviewed."}</h2><p>{listing.lifecycle_state === "pending_initial_approval" ? "The assigned agent cannot change the submitted snapshot. An authorized reviewer can approve it, request corrections, or reject it." : "Approved, returned, and rejected submissions remain immutable for a complete brokerage history."}</p></section>}
      </>}
      {reviews.length ? <section className="listing-review-history"><div><span>Decision history</span><h2>Brokerage reviews</h2></div>{reviews.map((review) => <article key={`${review.listing_version_id}:${review.decided_at}`}><strong>{review.decision.replaceAll("_", " ")}</strong><small>{new Date(review.decided_at).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" })} · by {namesByPersonId.get(review.reviewer_person_id) ?? "Brokerage reviewer"}{review.is_self_approval ? " · authorized self-approval" : ""}</small>{review.comment ? <p>{review.comment}</p> : null}</article>)}</section> : null}
      {activities.length ? <section className="listing-review-history activity-log"><div><span>Activity log</span><h2>Listing record</h2></div>{activities.map((activity) => <article key={`${activity.action}:${activity.occurred_at}`}><strong>{activityLabel(activity)}</strong><small>{new Date(activity.occurred_at).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" })} · by {activity.actor_person_id ? namesByPersonId.get(activity.actor_person_id) ?? "Brokerage member" : "SteadFast"}</small>{activity.reason ? <p>{activity.reason}</p> : null}</article>)}</section> : null}
      {listing.lifecycle_state === "approved_inactive" && listing.current_approved_version_id && access.canReviewListings ? <section className="activation-panel">
        <div><span>Final publication check</span><h2>Activate in the public marketplace</h2><p>This separately verifies the approved public visibility, active brokerage, active agent representative, cleared property record, validated media, and current listing version.</p></div>
        <form action={activatePublicListingAction} data-prompt-title="Activate this listing publicly?" data-prompt-message="The approved listing and its privacy-safe photographs will become searchable on the SteadFast marketplace." data-prompt-confirm="Activate listing">
          <input type="hidden" name="listingId" value={listing.id} />
          <input type="hidden" name="approvedVersionId" value={listing.current_approved_version_id} />
          <input type="hidden" name="expectedLockVersion" value={listing.lock_version} />
          <label><input type="checkbox" name="confirmPublication" value="yes" required /><span>I confirm this approved listing should be publicly searchable.</span></label>
          <button className="solid-button" type="submit">Activate public listing</button>
        </form>
      </section> : null}
      {listing.lifecycle_state === "active" ? <section className="activation-panel active-publication"><div><span>Public marketplace</span><h2>This listing is active.</h2><p>The public page is generated only from the approved safe projection. Private addresses, drafts, review comments, audit records, and source media paths remain excluded.</p></div><Link className="solid-button" href={`/properties/${listing.id}`}>View public listing</Link></section> : null}
    </div>
  </main>;
}
