import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/app/components/brand-logo";
import { StructuredData } from "@/app/components/structured-data";
import { publicPageMetadata, STEADFAST_SITE_URL } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ listingId: string }> };

async function getPublicListing(listingId: string) {
  if (!z.string().uuid().safeParse(listingId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("public_listing_snapshots").select("listing_id,approved_version_id,lifecycle_state,purpose,property_type,property_subtype,currency,price,price_period,title,description,bedrooms,bathrooms,building_area,land_area,area_unit,administrative_area_name,public_location_label,public_location_precision,public_latitude,public_longitude,brokerage_name,brokerage_slug,assigned_agent_name,assigned_agent_slug,ready_media_count,published_at").eq("listing_id", listingId).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const listing = await getPublicListing((await params).listingId);
  if (!listing) return { title: "Property not available", description: "This SteadFast property listing is not publicly available.", robots: { index: false, follow: false, noarchive: true } };
  return publicPageMetadata({
    title: listing.title,
    description: listing.description.slice(0, 155),
    path: `/properties/${listing.listing_id}`,
    keywords: [listing.property_subtype ?? listing.property_type, listing.administrative_area_name, "Jamaica property"],
  });
}

export default async function PublicListingPage({ params }: RouteProps) {
  const listing = await getPublicListing((await params).listingId);
  if (!listing) notFound();
  const price = new Intl.NumberFormat("en-JM", { style: "currency", currency: listing.currency, maximumFractionDigits: 0 }).format(listing.price);
  const location = listing.public_location_label ?? listing.administrative_area_name;
  const supabase = await createClient();
  const { data: gallery } = await supabase.from("public_listing_media")
    .select("id,variant,position,width,height")
    .eq("listing_id", listing.listing_id)
    .eq("approved_version_id", listing.approved_version_id)
    .eq("variant", "gallery")
    .order("position");

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
      seller: { "@type": "RealEstateAgent", name: listing.brokerage_name },
    }} />
    <header className="site-header search-header"><BrandLogo /><Link className="outline-button" href="/properties">Back to search</Link></header>
    <section className="public-listing-hero">
      <div><span>{listing.purpose === "sale" ? "For sale" : "Long-term rental"} · {listing.lifecycle_state.replaceAll("_", " ")}</span><h1>{listing.title}</h1><p>{location}</p></div>
      <strong>{price}{listing.price_period ? <small> / {listing.price_period}</small> : null}</strong>
    </section>
    <div className="public-listing-layout">
      <div className="public-listing-main">
        {gallery?.length ? <section className="public-media-gallery" aria-label="Property photographs">{gallery.map((photo, index) => <Image key={photo.id} src={`/media/listings/${photo.id}/gallery.webp`} alt={`${listing.title} photograph ${index + 1}`} width={photo.width} height={photo.height} sizes={index === 0 ? "(max-width: 900px) 100vw, 65vw" : "(max-width: 700px) 100vw, 32vw"} priority={index === 0} unoptimized />)}</section> : <section className="public-media-hold"><span>{listing.property_subtype ?? listing.property_type}</span><strong>Photographs are being prepared</strong><p>The listing remains protected until its privacy-safe public images are available.</p></section>}
        <section className="public-listing-facts"><div><span>Bedrooms</span><strong>{listing.bedrooms ?? "—"}</strong></div><div><span>Bathrooms</span><strong>{listing.bathrooms ?? "—"}</strong></div><div><span>Building</span><strong>{listing.building_area ? `${listing.building_area} ${listing.area_unit?.replace("_", " ") ?? ""}` : "—"}</strong></div><div><span>Land</span><strong>{listing.land_area ? `${listing.land_area} ${listing.area_unit?.replace("_", " ") ?? ""}` : "—"}</strong></div></section>
        <section className="public-description"><span>About this property</span><h2>Property details</h2><p>{listing.description}</p></section>
      </div>
      <aside className="public-agent-card"><span>Listing representative</span><h2>{listing.assigned_agent_name}</h2><p>{listing.brokerage_name}</p><div><strong>Agent-led service</strong><p>The secure inquiry and contact-choice workflow will be connected next. SteadFast does not expose private agent contact details without an approved public preference.</p></div><Link className="outline-dark-button" href="/properties">Continue searching</Link></aside>
    </div>
  </main>;
}
