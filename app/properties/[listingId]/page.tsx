import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PublicHeader } from "@/app/components/public-chrome";
import { StructuredData } from "@/app/components/structured-data";
import { StatusMessage } from "@/app/components/status-message";
import { createInquiryAction } from "@/app/actions/inquiries";
import { publicPageMetadata, STEADFAST_SITE_URL } from "@/lib/seo/metadata";
import { CurrencyPrice } from "@/app/components/currency-price";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ listingId: string }>;
  searchParams?: Promise<{ error?: string; notice?: string; site?: string }>;
};

async function getPublicListing(listingId: string) {
  if (!z.string().uuid().safeParse(listingId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("public_listing_snapshots").select("listing_id,approved_version_id,lifecycle_state,purpose,property_type,property_subtype,currency,price,price_period,title,description,bedrooms,bathrooms,building_area,land_area,area_unit,administrative_area_name,public_location_label,public_location_precision,public_latitude,public_longitude,brokerage_name,brokerage_slug,assigned_agent_person_id,assigned_agent_name,assigned_agent_slug,ready_media_count,published_at,updated_at,is_demo,demo_notice,source_url").eq("listing_id", listingId).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const listing = await getPublicListing((await params).listingId);
  if (!listing) return { title: "Property not available", description: "This ProperAP property listing is not publicly available.", robots: { index: false, follow: false, noarchive: true } };
  return publicPageMetadata({
    title: listing.title,
    description: listing.description.slice(0, 155),
    path: `/properties/${listing.listing_id}`,
    keywords: [listing.property_subtype ?? listing.property_type, listing.administrative_area_name, "Jamaica property"],
  });
}

export default async function PublicListingPage({ params, searchParams }: RouteProps) {
  const listing = await getPublicListing((await params).listingId);
  if (!listing) notFound();
  const query = await searchParams;
  const location = listing.public_location_label ?? listing.administrative_area_name;
  const hasPublicMapPoint = listing.public_latitude !== null && listing.public_longitude !== null;
  const latitude = Number(listing.public_latitude);
  const longitude = Number(listing.public_longitude);
  const mapDelta = listing.public_location_precision === "exact" ? 0.012 : 0.035;
  const mapEmbedUrl = hasPublicMapPoint
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${longitude - mapDelta},${latitude - mapDelta},${longitude + mapDelta},${latitude + mapDelta}`)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`
    : null;
  const fullMapUrl = hasPublicMapPoint
    ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=14/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`
    : null;
  const formatListingDate = (value: string) => new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeZone: "America/Jamaica" }).format(new Date(value));
  const supabase = await createClient();
  const { data: gallery } = await supabase.from("public_listing_media")
    .select("id,variant,position,width,height")
    .eq("listing_id", listing.listing_id)
    .eq("approved_version_id", listing.approved_version_id)
    .eq("variant", "gallery")
    .order("position");
  const { data: exchangeRates } = await supabase.from("exchange_rate_snapshots")
    .select("jmd_per_usd,cad_per_usd,gbp_per_usd,provider_updated_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sourceSite: { id: string; site_type: string; owner_person_id: string | null; display_name: string } | null = null;
  let displayingAgent: { id: string; name: string } | null = null;
  if (query?.site && z.string().uuid().safeParse(query.site).success) {
    const { data } = await supabase.from("professional_sites").select("id,site_type,owner_person_id,display_name").eq("id", query.site).eq("status", "active").maybeSingle();
    sourceSite = data;
    if (data?.site_type === "agent" && data.owner_person_id && data.owner_person_id !== listing.assigned_agent_person_id) {
      const { data: share } = await supabase.from("listing_shares").select("id").eq("listing_id", listing.listing_id).eq("displaying_agent_person_id", data.owner_person_id).eq("status", "active").maybeSingle();
      if (share) displayingAgent = { id: data.owner_person_id, name: data.display_name };
      else sourceSite = null;
    }
  }

  return <main className="public-listing-page">
    <StructuredData value={{
      "@context": "https://schema.org",
      "@type": "Product",
      name: listing.title,
      description: listing.description,
      category: "Real estate listing",
      url: `${STEADFAST_SITE_URL}/properties/${listing.listing_id}`,
      offers: { "@type": "Offer", price: listing.price, priceCurrency: listing.currency, availability: "https://schema.org/InStock" },
      areaServed: { "@type": "AdministrativeArea", name: listing.administrative_area_name },
      ...(hasPublicMapPoint ? { geo: { "@type": "GeoCoordinates", latitude, longitude } } : {}),
      seller: { "@type": "RealEstateAgent", name: listing.brokerage_name },
    }} />
    <PublicHeader />
    <section className="public-listing-hero">
      <div><span>{listing.purpose === "sale" ? "For sale" : "Long-term rental"} · {listing.lifecycle_state.replaceAll("_", " ")}</span><h1>{listing.title}</h1><p>{location}</p><dl className="public-listing-dates"><div><dt>Published</dt><dd>{formatListingDate(listing.published_at)}</dd></div><div><dt>Last updated</dt><dd>{formatListingDate(listing.updated_at)}</dd></div></dl></div>
      {listing.currency === "JMD" ? <CurrencyPrice priceJmd={Number(listing.price)} pricePeriod={listing.price_period} rates={exchangeRates} /> : <strong>{new Intl.NumberFormat("en-JM", { style: "currency", currency: listing.currency, maximumFractionDigits: 0 }).format(listing.price)}{listing.price_period ? <small> / {listing.price_period}</small> : null}</strong>}
    </section>
    <div className="public-listing-layout">
      <div className="public-listing-main">
        {listing.is_demo ? <section className="demo-listing-notice"><strong>Demonstration listing</strong><p>{listing.demo_notice}</p>{listing.source_url ? <a href={listing.source_url} target="_blank" rel="noreferrer noopener">View the factual market source</a> : null}</section> : null}
        {gallery?.length ? <section className="public-media-gallery" aria-label="Property photographs">{gallery.map((photo, index) => <Image key={photo.id} src={`/media/listings/${photo.id}/gallery.webp`} alt={`${listing.title} photograph ${index + 1}`} width={photo.width} height={photo.height} sizes={index === 0 ? "(max-width: 900px) 100vw, 65vw" : "(max-width: 700px) 100vw, 32vw"} priority={index === 0} unoptimized />)}</section> : <section className="public-media-hold"><span>{listing.property_subtype ?? listing.property_type}</span><strong>Photographs are being prepared</strong><p>The listing remains protected until its privacy-safe public images are available.</p></section>}
        <section className="public-listing-facts"><div><span>Bedrooms</span><strong>{listing.bedrooms ?? "—"}</strong></div><div><span>Bathrooms</span><strong>{listing.bathrooms ?? "—"}</strong></div><div><span>Building</span><strong>{listing.building_area ? `${listing.building_area} ${listing.area_unit?.replace("_", " ") ?? ""}` : "—"}</strong></div><div><span>Land</span><strong>{listing.land_area ? `${listing.land_area} ${listing.area_unit?.replace("_", " ") ?? ""}` : "—"}</strong></div></section>
        <section className="public-description"><span>About this property</span><h2>Property details</h2><p>{listing.description}</p></section>
        {mapEmbedUrl && fullMapUrl ? <section className="public-property-map" aria-labelledby="property-map-title">
          <div><span>Location</span><h2 id="property-map-title">Explore {location}</h2><p>{listing.public_location_precision === "exact" ? "The approved listing location is marked on the map." : "The marker shows the approved general area to protect property privacy."}</p></div>
          <iframe title={`Map showing ${location}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer" />
          <a href={fullMapUrl} target="_blank" rel="noreferrer noopener">Open larger map</a>
        </section> : null}
      </div>
      <aside className="public-agent-card" id="contact-agent">
        <span>Contact the listing representative</span>
        <h2>{listing.assigned_agent_name}</h2>
        <p>{listing.brokerage_name}</p>
        <StatusMessage error={query?.error} notice={query?.notice} />
        <form action={createInquiryAction} className="public-inquiry-form" noValidate data-prompt-title="Send this property inquiry?" data-prompt-message="Your contact details and message will be shared privately with your selected agent so they can respond about this property." data-prompt-confirm="Send inquiry">
          <input type="hidden" name="requestId" value={randomUUID()} />
          <input type="hidden" name="listingId" value={listing.listing_id} />
          <input type="hidden" name="sourceSiteId" value={sourceSite?.id ?? ""} />
          {displayingAgent ? <fieldset className="contact-choice"><legend>Choose your main contact</legend><label><input type="radio" name="selectedAgentPersonId" value={displayingAgent.id} defaultChecked /><span>{displayingAgent.name}<small>Agent whose website you are visiting</small></span></label><label><input type="radio" name="selectedAgentPersonId" value={listing.assigned_agent_person_id} /><span>{listing.assigned_agent_name}<small>Listing owner representative</small></span></label></fieldset> : <input type="hidden" name="selectedAgentPersonId" value={listing.assigned_agent_person_id} />}
          <label><span>Your name</span><input name="requesterName" autoComplete="name" maxLength={120} /></label>
          <label><span>Email</span><input name="requesterEmail" type="email" inputMode="email" autoComplete="email" maxLength={320} /></label>
          <label><span>Phone <small>optional for email replies</small></span><input name="requesterPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} /></label>
          <label><span>How should the agent reply?</span><select name="contactPreference" defaultValue="email"><option value="email">Email</option><option value="phone">Phone</option><option value="either">Email or phone</option></select></label>
          <label><span>Your message</span><textarea name="message" maxLength={2000} rows={5} placeholder="Ask about availability, a viewing, or the property details." /></label>
          <label className="inquiry-consent"><input name="consentToContact" type="checkbox" /><span>I agree that this listing representative may contact me about this property.</span></label>
          <label className="inquiry-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
          <button className="solid-button" type="submit">Send secure inquiry</button>
          <small className="inquiry-privacy">Your details stay inside the professional inquiry workspace and are not displayed publicly.</small>
        </form>
        <Link className="outline-dark-button" href="/properties">Continue searching</Link>
      </aside>
    </div>
  </main>;
}
