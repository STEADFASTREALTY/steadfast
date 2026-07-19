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

type Version = { version_number: number; title: string; purpose: string; price: number; currency: string; revision_state: string };

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
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
    .select("id, lifecycle_state, updated_at, listing_versions(version_number,title,purpose,price,currency,revision_state)")
    .order("updated_at", { ascending: false });
  if (access.canReviewListings && context.membership.brokerage_id) {
    listingsQuery = listingsQuery.eq("brokerage_id", context.membership.brokerage_id);
  } else {
    listingsQuery = listingsQuery.eq("created_by_person_id", context.person.id);
  }
  const { data: listings } = await listingsQuery;
  const brokerage = context.membership.brokerages as unknown as { display_name?: string } | null;

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings canReviewListings={access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Brokerage inventory</span><h1>Listings.</h1><p>{brokerage?.display_name ?? "Your brokerage"}</p></section>
    <div className="listing-index">
      <div className="listing-index-bar"><div><span>Your work</span><strong>{listings?.length ?? 0} visible to you</strong></div>{access.isAgent ? <Link className="solid-button" href="/workspace/listings/new">Create listing</Link> : null}</div>
      <StatusMessage error={params.error} notice={params.notice} />
      <div className="listing-records">{listings?.length ? listings.map((listing) => {
        const versions = (listing.listing_versions as unknown as Version[]).sort((a, b) => b.version_number - a.version_number);
        const version = versions[0];
        return <article key={listing.id}><div className="listing-record-status"><span>{listing.lifecycle_state.replaceAll("_", " ")}</span><small>{version?.revision_state.replaceAll("_", " ") ?? "No version"}</small></div><div><h2>{version?.title ?? "Untitled listing"}</h2><p>{version ? `${version.purpose === "sale" ? "For sale" : "Long-term rental"} · ${new Intl.NumberFormat("en-JM", { style: "currency", currency: version.currency, maximumFractionDigits: 0 }).format(version.price)}` : "Listing details unavailable"}</p></div><div className="listing-record-note">Private brokerage record<br /><Link href={`/workspace/listings/${listing.id}`}>{listing.lifecycle_state === "draft" && version?.revision_state === "working_draft" ? "Edit draft" : "Open record"} →</Link></div></article>;
      }) : <section className="listing-empty"><span>01</span><h2>Create your first private draft.</h2><p>Enter the property once. SteadFast will keep it private, assign you as the representative, and prepare it for brokerage review.</p>{access.isAgent ? <Link className="solid-button" href="/workspace/listings/new">Create listing</Link> : null}</section>}</div>
    </div>
  </main>;
}
