import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Search listings",
  description: "Search active, sold, rented, and closed listings available to your professional account.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const LISTINGS_PER_PAGE = 10;
const CLOSED_STATES = new Set(["withdrawn", "sold", "rented", "expired", "archived"]);
const LIVE_STATES = new Set(["active", "under_offer", "approved_inactive"]);

const FILTERS = [
  { key: "all", label: "All listings" },
  { key: "sale", label: "For sale" },
  { key: "rent", label: "For rent" },
  { key: "sold", label: "Sold" },
  { key: "rented", label: "Rented" },
  { key: "closed", label: "All closed" },
] as const;

type SearchFilter = (typeof FILTERS)[number]["key"];
type ListingRow = {
  id: string;
  lifecycle_state: string;
  updated_at: string;
  published_at: string | null;
  current_approved_version_id: string | null;
};
type Version = {
  id: string;
  listing_id: string;
  version_number: number;
  title: string;
  purpose: string;
  price: number;
  currency: string;
  revision_state: string;
};

function listingPurposeLabel(purpose: string) {
  if (purpose === "sale") return "For sale";
  if (purpose === "vacation_rental") return "Vacation rental";
  return "For rent";
}

function listingStatusLabel(state: string) {
  return state.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function listingMatchesFilter(listing: ListingRow, version: Version | undefined, filter: SearchFilter) {
  if (filter === "all") return true;
  if (filter === "sold") return listing.lifecycle_state === "sold";
  if (filter === "rented") return listing.lifecycle_state === "rented";
  if (filter === "closed") return CLOSED_STATES.has(listing.lifecycle_state);
  if (!LIVE_STATES.has(listing.lifecycle_state)) return false;
  if (filter === "sale") return version?.purpose === "sale";
  return version?.purpose === "long_term_rental" || version?.purpose === "vacation_rental";
}

function searchHref(filter: SearchFilter, query: string, page?: number) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (query) params.set("q", query);
  if (page && page > 1) params.set("page", String(page));
  const value = params.toString();
  return `/workspace/search${value ? `?${value}` : ""}`;
}

export default async function ProfessionalSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveMembershipContext("/workspace/search");
  if (!context.membership && !context.independentAgent) redirect("/access-denied?reason=listing-search");

  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
    isIndependentAgent: context.independentAgent,
  });
  if (!access.isAgent && !access.canReviewListings) redirect("/access-denied?reason=listing-search");

  const admin = createAdminClient();
  let listingsQuery = admin
    .from("listings")
    .select("id,lifecycle_state,updated_at,published_at,current_approved_version_id")
    .order("updated_at", { ascending: false });

  if (context.independentAgent) {
    listingsQuery = listingsQuery.eq("independent_owner_person_id", context.person.id);
  } else if (access.canReviewListings && context.membership?.brokerage_id) {
    listingsQuery = listingsQuery.eq("brokerage_id", context.membership.brokerage_id);
  } else {
    listingsQuery = listingsQuery.eq("created_by_person_id", context.person.id);
  }
  if (!context.roles.includes("broker")) listingsQuery = listingsQuery.neq("lifecycle_state", "unassigned");

  const { data: listingRows } = await listingsQuery;
  const rows = (listingRows ?? []) as ListingRow[];
  const listingIds = rows.map((listing) => listing.id);
  const { data: versionRows } = listingIds.length
    ? await admin
        .from("listing_versions")
        .select("id,listing_id,version_number,title,purpose,price,currency,revision_state")
        .in("listing_id", listingIds)
        .order("version_number", { ascending: false })
    : { data: [] as Version[] };

  const versionsByListing = new Map<string, Version[]>();
  for (const version of (versionRows ?? []) as Version[]) {
    versionsByListing.set(version.listing_id, [...(versionsByListing.get(version.listing_id) ?? []), version]);
  }
  const recordVersions = new Map<string, Version | undefined>();
  for (const listing of rows) {
    const versions = versionsByListing.get(listing.id) ?? [];
    recordVersions.set(
      listing.id,
      versions.find((version) => version.id === listing.current_approved_version_id) ?? versions[0],
    );
  }

  const requestedFilter = FILTERS.find((filter) => filter.key === params.status)?.key ?? "all";
  const query = (params.q ?? "").trim();
  const normalizedQuery = query.toLocaleLowerCase();
  const matchedRows = rows.filter((listing) => {
    const version = recordVersions.get(listing.id);
    if (!listingMatchesFilter(listing, version, requestedFilter)) return false;
    if (!normalizedQuery) return true;
    return [version?.title, version?.purpose, listing.lifecycle_state]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery));
  });
  const counts = new Map<SearchFilter, number>();
  for (const filter of FILTERS) {
    counts.set(filter.key, rows.filter((listing) => listingMatchesFilter(listing, recordVersions.get(listing.id), filter.key)).length);
  }

  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(matchedRows.length / LISTINGS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), totalPages);
  const displayedRows = matchedRows.slice((currentPage - 1) * LISTINGS_PER_PAGE, currentPage * LISTINGS_PER_PAGE);

  return (
    <main className="account-page">
      <AccountHeader
        displayName={context.person.display_name}
        hasWorkspace
        canManageAgents={access.canManageAgents}
        canManageListings
        canManageInquiries={access.canManageInquiries}
        canShareListings={access.canShareListings}
      />
      <section className="account-hero compact">
        <span className="eyebrow"><i /> Professional inventory</span>
        <h1>Search</h1>
        <p>Find active, sold, rented, and other closed listings available to you.</p>
      </section>
      <section className="listing-index professional-search-shell" aria-label="Search professional listings">
        <form className="professional-search-form" action="/workspace/search" method="get">
          <label>
            <span>Search title or status</span>
            <input name="q" type="search" defaultValue={query} placeholder="Search listings" />
          </label>
          <label>
            <span>Listing status</span>
            <select name="status" defaultValue={requestedFilter}>
              {FILTERS.map((filter) => <option key={filter.key} value={filter.key}>{filter.label}</option>)}
            </select>
          </label>
          <button className="solid-button" type="submit">Search</button>
        </form>
        <div className="listing-library-layout">
          <aside className="listing-status-nav" aria-label="Search listing categories">
            <strong>Search listings</strong>
            <nav>
              {FILTERS.map((filter) => (
                <Link key={filter.key} href={searchHref(filter.key, query)} className={requestedFilter === filter.key ? "active" : undefined} aria-current={requestedFilter === filter.key ? "page" : undefined}>
                  <span>{filter.label}</span><small>{counts.get(filter.key) ?? 0}</small>
                </Link>
              ))}
            </nav>
          </aside>
          <section className="listing-library-results" aria-labelledby="search-results-title">
            <header>
              <div><span>Results</span><h2 id="search-results-title">{FILTERS.find((filter) => filter.key === requestedFilter)?.label}</h2></div>
              <p>{matchedRows.length} {matchedRows.length === 1 ? "listing" : "listings"}</p>
            </header>
            <div className="listing-records">
              {displayedRows.length ? displayedRows.map((listing) => {
                const version = recordVersions.get(listing.id);
                const price = version ? new Intl.NumberFormat("en-JM", { style: "currency", currency: version.currency, maximumFractionDigits: 0 }).format(version.price) : null;
                return (
                  <article key={listing.id} data-status={listing.lifecycle_state}>
                    <div className="listing-record-status"><span>{listingStatusLabel(listing.lifecycle_state)}</span><small>{listing.published_at ? `Published ${new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(listing.published_at))}` : "Not publicly published"}</small></div>
                    <div><h2>{version?.title ?? "Untitled listing"}</h2><p>{version ? `${listingPurposeLabel(version.purpose)} · ${price}` : "Listing details unavailable"}</p></div>
                    <div className="listing-record-note"><span>Updated {new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(listing.updated_at))}</span><br /><Link href={`/workspace/listings/${listing.id}`}>Open listing →</Link></div>
                  </article>
                );
              }) : <section className="listing-empty"><span>Search results</span><h2>No listings found.</h2><p>Try another search phrase or choose a different listing status.</p></section>}
            </div>
            {totalPages > 1 ? <nav className="listing-pagination" aria-label="Search result pages">
              {currentPage > 1 ? <Link href={searchHref(requestedFilter, query, currentPage - 1)}>← Previous</Link> : <span aria-disabled="true">← Previous</span>}
              <strong>Page {currentPage} of {totalPages}</strong>
              {currentPage < totalPages ? <Link href={searchHref(requestedFilter, query, currentPage + 1)}>Next →</Link> : <span aria-disabled="true">Next →</span>}
            </nav> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
