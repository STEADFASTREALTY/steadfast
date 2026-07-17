import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Listing review", description: "Review submitted brokerage listings and record approval decisions.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type SubmittedVersion = {
  id: string;
  version_number: number;
  revision_state: string;
  title: string;
  purpose: string;
  price: number;
  currency: string;
  visibility: string;
  submitted_at: string;
};

export default async function ListingReviewsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const context = await getActiveMembershipContext("/workspace/reviews");
  if (!context.membership) redirect("/access-denied?reason=brokerage-membership");
  const access = deriveWorkspaceAccess({ hasMembership: true, roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.canReviewListings) redirect("/access-denied?reason=listing-review");

  const { data: listings } = await context.supabase.from("listings")
    .select("id,lifecycle_state,updated_at,listing_versions(id,version_number,revision_state,title,purpose,price,currency,visibility,submitted_at)")
    .eq("brokerage_id", context.membership.brokerage_id)
    .eq("lifecycle_state", "pending_initial_approval")
    .order("updated_at", { ascending: true });
  const queue = (listings ?? []).map((listing) => ({
    listing,
    version: (listing.listing_versions as unknown as SubmittedVersion[]).find((version) => version.revision_state === "submitted"),
  })).filter((item): item is typeof item & { version: SubmittedVersion } => Boolean(item.version));
  const brokerage = context.membership.brokerages as unknown as { display_name?: string } | null;

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings canReviewListings canManageInquiries={access.canManageInquiries} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Brokerage control</span><h1>Listing review.</h1><p>{brokerage?.display_name ?? "Your brokerage"}</p></section>
    <div className="listing-index review-queue">
      <div className="listing-index-bar"><div><span>Awaiting decision</span><strong>{queue.length} submission{queue.length === 1 ? "" : "s"}</strong></div><Link className="outline-dark-button review-back" href="/workspace/listings">All listings</Link></div>
      <StatusMessage notice={query.notice} error={query.error} />
      {queue.length ? <div className="listing-records">{queue.map(({ listing, version }) => <article key={listing.id}>
        <div className="listing-record-status"><span>Pending review</span><small>Version {version.version_number}</small></div>
        <div><h2>{version.title}</h2><p>{version.purpose === "sale" ? "For sale" : "Long-term rental"} · {new Intl.NumberFormat("en-JM", { style: "currency", currency: version.currency, maximumFractionDigits: 0 }).format(version.price)}</p></div>
        <div className="listing-record-note"><span>{version.visibility.replaceAll("_", " ")} visibility</span><br />Submitted {new Date(version.submitted_at).toLocaleDateString("en-JM", { dateStyle: "medium" })}<br /><Link href={`/workspace/listings/${listing.id}`}>Review submission →</Link></div>
      </article>)}</div> : <section className="listing-empty"><span>✓</span><h2>The review queue is clear.</h2><p>New agent submissions will appear here automatically. Decisions remain in each listing’s retained history.</p><Link className="solid-button" href="/workspace/listings">Open brokerage listings</Link></section>}
    </div>
  </main>;
}
