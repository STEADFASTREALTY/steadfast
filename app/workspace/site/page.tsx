import type { Metadata } from "next";
import { AccountHeader } from "@/app/components/account-header";
import { SiteBuilderTabs } from "@/app/components/site-builder";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Website builder",
  description: "Customize your private professional website.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function SiteBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; tab?: string }>;
}) {
  const query = await searchParams;
  const context = await getActiveMembershipContext("/workspace/site");
  const admin = createAdminClient();
  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
  });
  const siteQuery = context.supabase
    .from("professional_sites")
    .select(
      "id,site_type,owner_person_id,owner_brokerage_id,display_name,headline,slug,theme,layout,content",
    )
    .eq("status", "active");
  const { data: allSites } = await siteQuery;
  const canEditBrokerageWebsite =
    context.roles.includes("broker") ||
    context.roles.includes("broker_staff") ||
    context.permissions.some(
      (permission) =>
        permission.permission_key === "brokerage.profile" &&
        permission.effect === "allow",
    );
  const sites = (allSites ?? []).filter(
    (site) =>
      site.owner_person_id === context.person.id ||
      (canEditBrokerageWebsite &&
        site.owner_brokerage_id === context.membership?.brokerage_id),
  );
  let privateListingsQuery = admin
    .from("listings")
    .select("id,brokerage_id,created_by_person_id,lifecycle_state,updated_at")
    .in("lifecycle_state", ["draft", "pending_initial_approval", "approved_inactive", "under_offer"])
    .order("updated_at", { ascending: false });
  if (context.membership?.brokerage_id) privateListingsQuery = privateListingsQuery.eq("brokerage_id", context.membership.brokerage_id);
  else privateListingsQuery = privateListingsQuery.eq("created_by_person_id", context.person.id);
  const [testimonialResult, assetResult, listingResult, privateListingResult, shareResult, parishResult] =
    sites.length
      ? await Promise.all([
          context.supabase
            .from("site_testimonials")
            .select(
              "id,site_id,author_name,author_context,quote,asset_id,position,created_at",
            )
            .in(
              "site_id",
              sites.map((site) => site.id),
            )
            .eq("is_active", true)
            .order("position"),
          context.supabase
            .from("site_assets")
            .select("id,site_id,placement")
            .in(
              "site_id",
              sites.map((site) => site.id),
            )
            .eq("status", "ready"),
          context.supabase
            .from("public_listing_snapshots")
            .select(
              "listing_id,title,purpose,price,currency,brokerage_id,assigned_agent_person_id,published_at",
            )
            .order("published_at", { ascending: false }),
          privateListingsQuery,
          admin
            .from("listing_shares")
            .select("listing_id,displaying_agent_person_id")
            .eq("status", "active"),
          context.supabase
            .from("administrative_areas")
            .select("id,name")
            .eq("area_type", "parish")
            .order("name"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const testimonials = testimonialResult.data ?? [];
  const assets = assetResult.data ?? [];
  const privateListingRows = privateListingResult.data ?? [];
  const privateListingIds = privateListingRows.map((listing) => listing.id);
  const { data: privateVersionRows } = privateListingIds.length
    ? await admin
        .from("listing_versions")
        .select("listing_id,version_number,revision_state,title,purpose,price,currency")
        .in("listing_id", privateListingIds)
    : { data: [] as Array<{ listing_id: string; version_number: number; revision_state: string; title: string; purpose: string; price: number; currency: string }> };
  const privateVersionsByListing = new Map<string, typeof privateVersionRows>();
  for (const version of privateVersionRows ?? []) {
    const versions = privateVersionsByListing.get(version.listing_id) ?? [];
    versions.push(version);
    privateVersionsByListing.set(version.listing_id, versions);
  }
  const privateListings = privateListingRows.flatMap((listing) => {
    const versions = privateVersionsByListing.get(listing.id) ?? [];
    const version = [...versions].sort((left, right) => right.version_number - left.version_number)[0];
    return version ? [{ listing_id: listing.id, title: version.title, purpose: version.purpose, price: version.price, currency: version.currency, brokerage_id: listing.brokerage_id, assigned_agent_person_id: listing.created_by_person_id, published_at: listing.updated_at, lifecycle_state: listing.lifecycle_state, revision_state: version.revision_state }] : [];
  });
  const publishedListings = (listingResult.data ?? []).map((listing) => ({ ...listing, lifecycle_state: "active", revision_state: "approved" }));
  const builderListings = [...privateListings, ...publishedListings].sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime());
  return (
    <main className="account-page">
      <StatusMessage error={query.error} notice={query.notice} />
      <AccountHeader
        displayName={context.person.display_name}
        hasWorkspace={access.hasWorkspace}
        canManageAgents={access.canManageAgents}
        canManageListings={access.isAgent}
        canManageInquiries={access.canManageInquiries}
        canShareListings={access.canShareListings}
      />
      <section className="account-hero compact site-builder-hero">
        <span className="eyebrow">
          <i /> Professional presence
        </span>
        <h1>Build Your Website</h1>
      </section>
      <div className="account-main settings-main">
        {sites.length ? (
          <SiteBuilderTabs
            sites={sites}
            testimonials={testimonials}
          assets={assets}
          listings={builderListings}
          shares={shareResult.data ?? []}
            parishes={parishResult.data ?? []}
            canCreateListings={access.isAgent}
            initialTab={query.tab}
          />
        ) : null}
        {!sites.length ? (
          <section className="account-card">
            <h2>Website unavailable</h2>
            <p>
              Only an active agent or principal broker can customize a
              professional site.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
