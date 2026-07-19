import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Listings", description: "Manage private and approved brokerage property listings.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Version = { listing_id: string; version_number: number; title: string; purpose: string; price: number; currency: string; revision_state: string };

const LISTINGS_PER_PAGE = 5;
const LISTING_FILTERS = [
  { key: "all", label: "All listings", states: [] },
  { key: "drafts", label: "Drafts", states: ["draft"] },
  { key: "pending", label: "Pending approval", states: ["pending_initial_approval"] },
  { key: "approved", label: "Approved", states: ["approved_inactive"] },
  { key: "published", label: "Published", states: ["active", "under_offer"] },
  { key: "unassigned", label: "Unassigned", states: ["unassigned"] },
  { key: "closed", label: "Closed", states: ["withdrawn", "sold", "rented", "expired", "archived"] },
] as const;

type ListingFilterKey = (typeof LISTING_FILTERS)[number]["key"];

function listingFilterHref(filter: ListingFilterKey, page?: number) {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("status", filter);
  if (page && page > 1) query.set("page", String(page));
  const value = query.toString();
  return `/workspace/listings${value ? `?${value}` : ""}`;
}

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const context = await getActiveMembershipContext("/workspace/listings");
  if (!context.membership) redirect("/access-denied?reason=brokerage-membership");
  const access = deriveWorkspaceAccess({ hasMembership: true, roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.isAgent && !access.canReviewListings) redirect("/access-denied?reason=listing-workspace");

  // Listing drafts are intentionally protected from public/RLS projections. The
  // authenticated membership is verified above; this scoped server query then
  // returns only the current brokerage inventory (or the agent's own work).
  const admin = createAdminClient();
  let listingsQuery = admin.from("listings")
    .select("id, lifecycle_state, updated_at")
    .order("updated_at", { ascending: false });
  if (access.canReviewListings && context.membership.brokerage_id) {
    listingsQuery = listingsQuery.eq("brokerage_id", context.membership.brokerage_id);
  } else {
    listingsQuery = listingsQuery.eq("created_by_person_id", context.person.id);
  }
  const { data: listingRows } = await listingsQuery;
  const requestedFilter = LISTING_FILTERS.find((filter) => filter.key === params.status) ?? LISTING_FILTERS[0];
  const filterCounts = new Map<ListingFilterKey, number>();
  for (const filter of LISTING_FILTERS) {
    filterCounts.set(filter.key, filter.key === "all"
      ? (listingRows ?? []).length
      : (listingRows ?? []).filter((listing) => (filter.states as readonly string[]).includes(listing.lifecycle_state)).length);
  }
  const filteredRows = requestedFilter.key === "all"
    ? (listingRows ?? [])
    : (listingRows ?? []).filter((listing) => (requestedFilter.states as readonly string[]).includes(listing.lifecycle_state));
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / LISTINGS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), totalPages);
  const pageStart = (currentPage - 1) * LISTINGS_PER_PAGE;
  const paginatedRows = filteredRows.slice(pageStart, pageStart + LISTINGS_PER_PAGE);
  const listingIds = paginatedRows.map((listing) => listing.id);
  const { data: versionRows } = listingIds.length
    ? await admin
        .from("listing_versions")
        .select("listing_id,version_number,title,purpose,price,currency,revision_state")
        .in("listing_id", listingIds)
    : { data: [] as Version[] };
  const versionsByListing = new Map<string, Version[]>();
  for (const version of (versionRows ?? []) as Version[]) {
    versionsByListing.set(version.listing_id, [...(versionsByListing.get(version.listing_id) ?? []), version]);
  }
  const listings = paginatedRows.map((listing) => ({
    ...listing,
    listing_versions: versionsByListing.get(listing.id) ?? [],
  }));
  const brokerage = context.membership.brokerages as unknown as { display_name?: string } | null;

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings canReviewListings={access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Brokerage inventory</span><h1>Listings.</h1><p>{brokerage?.display_name ?? "Your brokerage"}</p></section>
    <div className="listing-index">
      <div className="listing-index-bar"><div><span>Your work</span><strong>{filterCounts.get("all") ?? 0} listings visible to you</strong></div>{access.isAgent ? <Link className="solid-button" href="/workspace/listings/new">Create listing</Link> : null}</div>
      <StatusMessage error={params.error} notice={params.notice} />
      <div className="listing-library-layout">
        <aside className="listing-status-nav" aria-label="Filter listings by status">
          <strong>Listing status</strong>
          <nav>{LISTING_FILTERS.map((filter) => <Link key={filter.key} href={listingFilterHref(filter.key)} className={requestedFilter.key === filter.key ? "active" : undefined} aria-current={requestedFilter.key === filter.key ? "page" : undefined}><span>{filter.label}</span><small>{filterCounts.get(filter.key) ?? 0}</small></Link>)}</nav>
        </aside>
        <section className="listing-library-results" aria-labelledby="listing-results-title">
          <header><div><span>Showing</span><h2 id="listing-results-title">{requestedFilter.label}</h2></div><p>{filteredRows.length} {filteredRows.length === 1 ? "listing" : "listings"}</p></header>
          <div className="listing-records">{listings.length ? listings.map((listing) => {
            const versions = (listing.listing_versions as unknown as Version[]).sort((a, b) => b.version_number - a.version_number);
            const version = versions[0];
            return <article key={listing.id} data-status={listing.lifecycle_state}><div className="listing-record-status"><span>{listing.lifecycle_state.replaceAll("_", " ")}</span><small>{version?.revision_state.replaceAll("_", " ") ?? "No version"}</small></div><div><h2>{version?.title ?? "Untitled listing"}</h2><p>{version ? `${version.purpose === "sale" ? "For sale" : version.purpose === "vacation_rental" ? "Vacation rental" : "Long-term rental"} · ${new Intl.NumberFormat("en-JM", { style: "currency", currency: version.currency, maximumFractionDigits: 0 }).format(version.price)}` : "Listing details unavailable"}</p></div><div className="listing-record-note">Brokerage listing record<br /><Link href={`/workspace/listings/${listing.id}`}>{listing.lifecycle_state === "draft" && version?.revision_state === "working_draft" ? "Continue editing" : ["active", "under_offer"].includes(listing.lifecycle_state) ? "View or edit listing" : "Open record"} →</Link></div></article>;
          }) : <section className="listing-empty"><span>{requestedFilter.label}</span><h2>No listings in this category.</h2><p>{requestedFilter.key === "drafts" ? "Drafts you create will remain private here until they are submitted to the brokerage." : `There are currently no ${requestedFilter.label.toLowerCase()} visible to you.`}</p>{requestedFilter.key === "all" && access.isAgent ? <Link className="solid-button" href="/workspace/listings/new">Create listing</Link> : null}</section>}</div>
          {totalPages > 1 ? <nav className="listing-pagination" aria-label="Listing pages">
            {currentPage > 1 ? <Link href={listingFilterHref(requestedFilter.key, currentPage - 1)}>← Previous</Link> : <span aria-disabled="true">← Previous</span>}
            <strong>Page {currentPage} of {totalPages}</strong>
            {currentPage < totalPages ? <Link href={listingFilterHref(requestedFilter.key, currentPage + 1)}>Next →</Link> : <span aria-disabled="true">Next →</span>}
          </nav> : null}
        </section>
      </div>
    </div>
  </main>;
}
