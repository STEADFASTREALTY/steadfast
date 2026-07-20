import Link from "next/link";
import { AccountHeader } from "@/app/components/account-header";
import { ConsumerAccountNav } from "@/app/components/consumer-account-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liked listings", robots: { index: false, follow: false } };

export default async function SavedListingsPage() {
  const context = await getActiveMembershipContext("/account/saved-listings");
  const admin = createAdminClient();
  const { data: saved } = await admin.from("consumer_saved_listings").select("listing_id,saved_at").eq("person_id", context.person.id).order("saved_at", { ascending: false });
  const ids = (saved ?? []).map((row) => row.listing_id);
  const { data: listings } = ids.length ? await admin.from("public_listing_snapshots").select("listing_id,title,price,currency,public_location_label,administrative_area_name,purpose").in("listing_id", ids) : { data: [] };
  const byId = new Map((listings ?? []).map((listing) => [listing.listing_id, listing]));
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} isConsumer={!context.membership} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Your property shortlist</span><h1>Liked listings</h1><p>Keep the homes and properties you want to revisit in one private place.</p></section>
    <div className="account-settings-layout consumer-account-layout"><ConsumerAccountNav active="saved" /><section className="consumer-account-shell"><div className="consumer-page-heading"><span>Saved properties</span><h2>{ids.length} {ids.length === 1 ? "listing" : "listings"}</h2></div>{ids.length ? <div className="saved-listing-list">{(saved ?? []).map((item) => { const listing = byId.get(item.listing_id); return listing ? <article key={item.listing_id}><div><span>{listing.purpose === "sale" ? "For sale" : "For rent"}</span><h2>{listing.title}</h2><p>{listing.public_location_label ?? listing.administrative_area_name}</p></div><strong>{listing.currency === "JMD" ? `J$${new Intl.NumberFormat("en-JM").format(Number(listing.price))}` : new Intl.NumberFormat("en-JM", { style: "currency", currency: listing.currency, maximumFractionDigits: 0 }).format(Number(listing.price))}</strong><Link className="outline-dark-button" href={`/properties/${listing.listing_id}`}>Open listing</Link></article> : null; })}</div> : <section className="account-card"><h2>No liked listings yet</h2><p>Use the heart on a property card to keep it here and receive alerts when its approved details change.</p><Link className="solid-button" href="/properties">Search properties</Link></section>}</section></div>
  </main>;
}
