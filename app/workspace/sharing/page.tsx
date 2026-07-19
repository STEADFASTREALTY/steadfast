import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StatusMessage } from "@/app/components/status-message";
import { createListingShareAction, endListingShareAction } from "@/app/actions/shares";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = {
  title: "Listing sharing",
  description: "Manage display-only listing shares between ProperAP agents.",
  robots: { index: false, follow: false, noarchive: true },
};
export const dynamic = "force-dynamic";

type SharingView = "new" | "active";

function sharingHref(view: SharingView) {
  return view === "new" ? "/workspace/sharing" : "/workspace/sharing?view=active";
}

export default async function SharingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; view?: string }>;
}) {
  const query = await searchParams;
  const selectedView: SharingView = query.view === "active" ? "active" : "new";
  const context = await getActiveMembershipContext("/workspace/sharing");
  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
  });
  if (!access.canShareListings) redirect("/access-denied?reason=listing-sharing");

  const [{ data: listings }, { data: sites }, { data: shares }] = await Promise.all([
    context.supabase
      .from("public_listing_snapshots")
      .select("listing_id,title,public_location_label,administrative_area_name")
      .eq("assigned_agent_person_id", context.person.id),
    context.supabase
      .from("professional_sites")
      .select("owner_person_id,display_name,slug")
      .eq("site_type", "agent")
      .eq("status", "active")
      .neq("owner_person_id", context.person.id),
    context.supabase
      .from("listing_shares")
      .select("id,listing_id,owner_agent_person_id,displaying_agent_person_id,status,granted_at")
      .eq("status", "active"),
  ]);

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings canManageInquiries={access.canManageInquiries} canShareListings />
    <section className="account-hero compact"><span className="eyebrow"><i /> Display advertising</span><h1>Listing sharing.</h1><p>Share approved listings without changing ownership or editing rights.</p></section>
    <section className="sharing-shell">
      <StatusMessage error={query.error} notice={query.notice} />
      <div className="sharing-layout">
        <aside className="listing-status-nav sharing-nav" aria-label="Listing sharing sections">
          <strong>Sharing</strong>
          <nav>
            <Link href={sharingHref("new")} className={selectedView === "new" ? "active" : undefined} aria-current={selectedView === "new" ? "page" : undefined}><span>Share a listing</span></Link>
            <Link href={sharingHref("active")} className={selectedView === "active" ? "active" : undefined} aria-current={selectedView === "active" ? "page" : undefined}><span>Active shares</span><small>{shares?.length ?? 0}</small></Link>
          </nav>
        </aside>

        <div className="sharing-content">
          {selectedView === "new" ? <div className="account-card">
            <div className="card-heading"><span>New display share</span><h2>Choose a listing and agent</h2></div>
            <form action={createListingShareAction} className="stack-form" data-prompt-title="Share this listing for display?" data-prompt-message="The selected agent may advertise the approved listing on their website but cannot edit, approve, reassign, or own it." data-prompt-confirm="Share listing">
              <label><span>Your active listing</span><select name="listingId" defaultValue=""><option value="" disabled>Choose a listing</option>{listings?.map((listing) => <option value={listing.listing_id} key={listing.listing_id}>{listing.title}</option>)}</select></label>
              <label><span>Displaying agent</span><select name="displayingAgentPersonId" defaultValue=""><option value="" disabled>Choose an agent</option>{sites?.map((site) => <option value={site.owner_person_id!} key={site.owner_person_id!}>{site.display_name}</option>)}</select></label>
              <button className="solid-button" type="submit">Share for display</button>
            </form>
          </div> : <section className="sharing-records" aria-labelledby="active-shares-title">
            <header><div><span>Display permissions</span><h2 id="active-shares-title">Active shares</h2></div><p>{shares?.length ?? 0} active</p></header>
            <div className="inquiry-list">{shares?.length ? shares.map((share) => {
              const listing = listings?.find((item) => item.listing_id === share.listing_id);
              const mine = share.owner_agent_person_id === context.person.id;
              return <article key={share.id}>
                <header><div><span>Active share</span><h2>{listing?.title ?? "Shared listing"}</h2></div></header>
                <footer><span>Display permission only</span><form action={endListingShareAction} data-prompt-title={mine ? "Revoke this display share?" : "Remove this listing from your website?"} data-prompt-message={mine ? "The listing will disappear from the displaying agent’s website." : "The listing owner will be notified and the listing will leave your website."} data-prompt-confirm={mine ? "Revoke share" : "Remove display"} data-prompt-variant="danger"><input type="hidden" name="shareId" value={share.id} /><button className="outline-dark-button" name="operation" value={mine ? "revoke" : "remove"} type="submit">{mine ? "Revoke" : "Remove from my site"}</button></form></footer>
              </article>;
            }) : <section className="listing-empty"><span>Active shares</span><h2>No active shares.</h2><p>Listings shared by you or displayed on your website will appear here.</p></section>}</div>
          </section>}
        </div>
      </div>
    </section>
  </main>;
}
