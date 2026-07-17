"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type Listing = {
  listing_id: string; title: string; purpose: string; property_type: string; price: number; currency: string;
  bedrooms: number | null; bathrooms: number | null; public_location_label: string | null; administrative_area_name: string;
};
type Media = { id: string; listing_id: string; width: number; height: number };

export function ProfessionalListingGrid({ listings, media, siteId }: { listings: Listing[]; media: Media[]; siteId: string }) {
  const [cardsPerRow, setCardsPerRow] = useState<4 | 6>(6);
  const coverByListing = new Map(media.map((item) => [item.listing_id, item]));
  return <>
    <div className="professional-listing-toolbar"><p><strong>{listings.length}</strong> active properties</p><div className="property-grid-switch" aria-label="Cards per row"><span>View</span><button type="button" aria-pressed={cardsPerRow === 4} onClick={() => setCardsPerRow(4)}>4</button><button type="button" aria-pressed={cardsPerRow === 6} onClick={() => setCardsPerRow(6)}>6</button></div></div>
    <div className={`professional-card-grid cards-${cardsPerRow}`}>{listings.map((listing) => {
      const cover = coverByListing.get(listing.listing_id);
      const facts = [listing.bedrooms === null ? null : `${listing.bedrooms} bd`, listing.bathrooms === null ? null : `${listing.bathrooms} ba`].filter(Boolean).join(" · ");
      return <article className="property-result-card" key={listing.listing_id}>
        <Link className="property-card-visual" href={`/properties/${listing.listing_id}?site=${siteId}`} aria-label={`View ${listing.title}`}>{cover ? <Image src={`/media/listings/${cover.id}/card.webp`} alt={`${listing.title} property view`} width={cover.width} height={cover.height} sizes="(max-width: 680px) 100vw, (max-width: 1050px) 33vw, 17vw" unoptimized /> : <span className="property-card-placeholder">Photo preparing</span>}<span className="property-card-badge">{listing.purpose === "sale" ? "For sale" : "For rent"}</span></Link>
        <div className="property-card-copy"><strong className="property-card-price">{new Intl.NumberFormat("en-JM", { style: "currency", currency: listing.currency, maximumFractionDigits: 0 }).format(listing.price)}</strong><h2><Link href={`/properties/${listing.listing_id}?site=${siteId}`}>{listing.title}</Link></h2>{facts ? <p className="property-card-facts">{facts}</p> : null}<p className="property-card-location">{listing.public_location_label ?? listing.administrative_area_name}</p></div>
      </article>;
    })}</div>
  </>;
}
