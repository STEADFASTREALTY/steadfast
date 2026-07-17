import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/app/components/brand-logo";

export const metadata: Metadata = {
  title: "Property Search",
  description: "Search brokerage-approved property listings across Jamaica with SteadFast Realty.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type PublicListing = {
  listing_id: string;
  lifecycle_state: string;
  purpose: string;
  property_type: string;
  property_subtype: string | null;
  currency: string;
  price: number;
  price_period: string | null;
  title: string;
  description: string;
  bedrooms: number | null;
  bathrooms: number | null;
  administrative_area_name: string;
  public_location_label: string | null;
  brokerage_name: string;
  assigned_agent_name: string;
  ready_media_count: number;
};

function firstParameter(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function safeSearchWords(value: string | string[] | undefined) {
  return firstParameter(value).slice(0, 80).replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

function formatPrice(listing: PublicListing) {
  const amount = new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency: listing.currency,
    maximumFractionDigits: 0,
  }).format(listing.price);
  return listing.price_period ? `${amount} / ${listing.price_period}` : amount;
}

export default async function Properties({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const location = safeSearchWords(params.location);
  const requestedType = firstParameter(params.type).toLowerCase().slice(0, 30);
  const intent = firstParameter(params.intent) === "rent" ? "rent" : "buy";
  const supabase = await createClient();

  let listingsQuery = supabase
    .from("public_listing_snapshots")
    .select("listing_id,lifecycle_state,purpose,property_type,property_subtype,currency,price,price_period,title,description,bedrooms,bathrooms,administrative_area_name,public_location_label,brokerage_name,assigned_agent_name,ready_media_count")
    .eq("purpose", intent === "rent" ? "long_term_rent" : "sale")
    .order("published_at", { ascending: false })
    .limit(24);

  if (location) listingsQuery = listingsQuery.textSearch("search_document", location, { config: "simple", type: "websearch" });
  if (["commercial", "land", "development"].includes(requestedType)) {
    listingsQuery = listingsQuery.eq("property_type", requestedType);
  } else if (["house", "apartment", "townhouse"].includes(requestedType)) {
    listingsQuery = listingsQuery.eq("property_type", "residential").ilike("property_subtype", requestedType);
  }

  const { data } = await listingsQuery;
  const listings = (data ?? []) as PublicListing[];
  const listingIds = listings.map((listing) => listing.listing_id);
  const { data: covers } = listingIds.length
    ? await supabase.from("public_listing_media")
      .select("id,listing_id,variant,width,height")
      .in("listing_id", listingIds)
      .eq("variant", "card")
      .eq("position", 1)
    : { data: [] };
  const coverByListing = new Map((covers ?? []).map((cover) => [cover.listing_id, cover]));
  const areaCounts = Array.from(listings.reduce((areas, listing) => {
    areas.set(listing.administrative_area_name, (areas.get(listing.administrative_area_name) ?? 0) + 1);
    return areas;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);

  return (
    <main className="search-page">
      <header className="site-header search-header">
        <BrandLogo />
        <nav className="desktop-nav" aria-label="Property search navigation"><Link href="/properties">Buy</Link><Link href="/properties?intent=rent">Rent</Link></nav>
        <Link className="outline-button" href="/sign-in">Sign in</Link>
      </header>

      <section className="marketplace-heading">
        <div><span className="eyebrow dark"><i /> Brokerage-approved inventory</span><h1>{location ? `Property in ${location}` : `A place to ${intent}.`}</h1><p>{listings.length} active {listings.length === 1 ? "listing" : "listings"} from eligible Jamaican brokerages.</p></div>
        <form className="marketplace-filters" action="/properties" method="get">
          <input type="hidden" name="intent" value={intent === "rent" ? "rent" : "buy"} />
          <label><span>Location</span><input name="location" defaultValue={location} maxLength={80} placeholder="Parish or area" /></label>
          <label><span>Property type</span><select name="type" defaultValue={requestedType}><option value="">Any property</option><option value="house">House</option><option value="apartment">Apartment</option><option value="townhouse">Townhouse</option><option value="land">Land</option><option value="commercial">Commercial</option><option value="development">Development</option></select></label>
          <button className="solid-button" type="submit">Search</button>
        </form>
      </section>

      <div className="marketplace-layout">
        <section className="marketplace-results" aria-label="Property results">
          {listings.length ? listings.map((listing) => { const cover = coverByListing.get(listing.listing_id); return <article className="property-result-card" key={listing.listing_id}>
            <Link className="property-card-visual" href={`/properties/${listing.listing_id}`} aria-label={`View ${listing.title}`}>{cover ? <Image src={`/media/listings/${cover.id}/card.webp`} alt="" width={cover.width} height={cover.height} sizes="(max-width: 700px) 100vw, 42vw" unoptimized /> : null}<span>{listing.property_subtype ?? listing.property_type}</span><strong>{listing.administrative_area_name}</strong><small>{listing.ready_media_count} validated {listing.ready_media_count === 1 ? "photo" : "photos"}</small></Link>
            <div className="property-card-copy"><span>{listing.purpose === "sale" ? "For sale" : "Long-term rental"} · {listing.lifecycle_state.replaceAll("_", " ")}</span><h2><Link href={`/properties/${listing.listing_id}`}>{listing.title}</Link></h2><strong>{formatPrice(listing)}</strong><p>{listing.bedrooms === null ? "" : `${listing.bedrooms} bed · `}{listing.bathrooms === null ? "" : `${listing.bathrooms} bath · `}{listing.public_location_label ?? listing.administrative_area_name}</p><small>Represented by {listing.assigned_agent_name} · {listing.brokerage_name}</small></div>
          </article>; }) : <div className="listing-empty"><span>No matching inventory</span><h2>Try a broader search.</h2><p>Only active, brokerage-approved listings appear here. Change the location or property type to see other available properties.</p><Link className="solid-button" href={intent === "rent" ? "/properties?intent=rent" : "/properties"}>Clear filters</Link></div>}
        </section>

        <aside className="area-map-panel" aria-label="Listings grouped by area">
          <div className="area-map-grid" aria-hidden="true" />
          <span>Zoomed-out area view</span><h2>Jamaica by parish</h2><p>Results are grouped by approved public area. Exact map points will appear only when approved coordinates exist.</p>
          <div className="area-clusters">{areaCounts.length ? areaCounts.map(([area, count]) => <Link href={`/properties?intent=${intent === "rent" ? "rent" : "buy"}&location=${encodeURIComponent(area)}`} key={area}><span>{area}</span><strong>{count}</strong></Link>) : <small>No area groups match this search.</small>}</div>
        </aside>
      </div>
    </main>
  );
}
