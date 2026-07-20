import Link from "next/link";
import { AccountHeader } from "@/app/components/account-header";
import { ConsumerAccountNav } from "@/app/components/consumer-account-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "My watch", robots: { index: false, follow: false } };

type WatchView = "active" | "closed";

function href(view: WatchView) { return `/account/saved-listings?view=${view}`; }
function money(amount: number, currency: string) { return currency === "JMD" ? `J$${new Intl.NumberFormat("en-JM").format(amount)}` : new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }

export default async function SavedListingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const query = await searchParams;
  const view: WatchView = query.view === "closed" ? "closed" : "active";
  const context = await getActiveMembershipContext("/account/saved-listings");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const admin = createAdminClient();
  const { data: saved } = await admin.from("consumer_saved_listings").select("listing_id,saved_at").eq("person_id", context.person.id).order("saved_at", { ascending: false });
  const ids = (saved ?? []).map((row) => row.listing_id);
  const { data: listingRows } = ids.length ? await admin.from("listings").select("id,lifecycle_state,current_approved_version_id,published_at,updated_at").in("id", ids) : { data: [] };
  const versionIds = (listingRows ?? []).flatMap((listing) => listing.current_approved_version_id ? [listing.current_approved_version_id] : []);
  const { data: versions } = versionIds.length ? await admin.from("listing_versions").select("id,title,price,currency,public_location_label,purpose").in("id", versionIds) : { data: [] };
  const versionsById = new Map((versions ?? []).map((version) => [version.id, version]));
  const activeStates = new Set(["active", "under_offer"]);
  const watched = (saved ?? []).flatMap((item) => { const listing = (listingRows ?? []).find((row) => row.id === item.listing_id); const version = listing?.current_approved_version_id ? versionsById.get(listing.current_approved_version_id) : null; return listing && version ? [{ ...item, listing, version }] : []; });
  const activeWatched = watched.filter((item) => activeStates.has(item.listing.lifecycle_state));
  const closedWatched = watched.filter((item) => !activeStates.has(item.listing.lifecycle_state));
  const displayed = view === "active" ? activeWatched : closedWatched;
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} isConsumer={!context.membership} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Your property shortlist</span><h1>My watch</h1><p>Keep track of properties you liked, including listings that are no longer active.</p></section>
    <div className="account-settings-layout consumer-account-layout"><ConsumerAccountNav active="watch" /><section className="consumer-account-shell"><nav className="watch-status-tabs" aria-label="My watch status"><Link className={view === "active" ? "active" : ""} href={href("active")}>Active <small>{activeWatched.length}</small></Link><Link className={view === "closed" ? "active" : ""} href={href("closed")}>Closed <small>{closedWatched.length}</small></Link></nav><div className="consumer-page-heading"><span>{view === "active" ? "Available now" : "No longer active"}</span><h2>{displayed.length} {displayed.length === 1 ? "listing" : "listings"}</h2></div>{displayed.length ? <div className="saved-listing-list">{displayed.map((item) => <article key={item.listing.id}><div><span>{view === "closed" ? item.listing.lifecycle_state.replaceAll("_", " ") : item.version.purpose === "sale" ? "For sale" : "For rent"}</span><h2>{item.version.title}</h2><p>Saved {new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(item.saved_at))}</p></div><strong>{money(Number(item.version.price), item.version.currency)}</strong>{view === "active" ? <Link className="outline-dark-button" href={`/properties/${item.listing.id}`}>Open listing</Link> : <span className="watch-closed-note">Closed</span>}</article>)}</div> : <section className="account-card"><h2>{view === "active" ? "No active watched listings" : "No closed watched listings"}</h2><p>{view === "active" ? "Use the heart on a property card to add it here and receive updates when approved details change." : "Listings you liked will stay here after they are sold, rented, withdrawn, or otherwise closed."}</p>{view === "active" ? <Link className="solid-button" href="/properties">Search properties</Link> : null}</section>}</section></div>
  </main>;
}
