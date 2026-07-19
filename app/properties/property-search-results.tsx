"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ListingCover, PropertySearchParams, PublicListing } from "@/lib/public-property-search";
import { CurrencyPriceRangeFields } from "@/app/components/currency-price-range-fields";
import { convertJmdToCurrency, formatCurrencyAmount, type DisplayCurrency, type ExchangeRateSnapshot } from "@/lib/currency-conversions";

// Leaflet accesses `window` while it initializes. Load the map only in the
// browser so public property pages can always render their cards and images.
const JamaicaListingMap = dynamic(
  () => import("./jamaica-listing-map").then((module) => module.JamaicaListingMap),
  { ssr: false, loading: () => <div className="listing-map-loading">Loading map…</div> },
);

const PRICE_OPTIONS = [0, 1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000];
const SIZE_OPTIONS = [500, 1_000, 1_500, 2_000, 3_000, 5_000];

type Props = {
  initialListings: PublicListing[];
  initialCovers: ListingCover[];
  initialFilters: PropertySearchParams;
  initialCardsPerRow: 4 | 6;
  locationOptions: string[];
  rates: ExchangeRateSnapshot | null;
};

function formatPrice(listing: PublicListing, currency: DisplayCurrency, rates: ExchangeRateSnapshot | null) {
  const amount = listing.currency === "JMD"
    ? formatCurrencyAmount(convertJmdToCurrency(Number(listing.price), currency, rates), currency)
    : new Intl.NumberFormat("en-JM", { style: "currency", currency: listing.currency, maximumFractionDigits: 0 }).format(listing.price);
  return listing.price_period ? `${amount} / ${listing.price_period}` : amount;
}

function formatJmdCompact(amount: number) {
  return `J$${new Intl.NumberFormat("en-JM", { maximumFractionDigits: 0, notation: "compact" }).format(amount)}`;
}

function queryFromForm(form: HTMLFormElement, cardsPerRow: 4 | 6) {
  const query = new URLSearchParams();
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  query.set("view", String(cardsPerRow));
  return query;
}

function PropertyCard({ listing, cover, currency, rates }: { listing: PublicListing; cover?: ListingCover; currency: DisplayCurrency; rates: ExchangeRateSnapshot | null }) {
  const facts = [listing.bedrooms === null ? null : `${listing.bedrooms} bd`, listing.bathrooms === null ? null : `${listing.bathrooms} ba`, listing.building_area === null ? null : `${new Intl.NumberFormat("en-JM").format(listing.building_area)} sq ft`].filter(Boolean).join(" · ");
  return <article className="property-result-card" key={listing.listing_id}>
    <Link className="property-card-visual" href={`/properties/${listing.listing_id}`} aria-label={`View ${listing.title}`}>{cover ? <Image src={`/media/listings/${cover.id}/card.webp`} alt={`${listing.title} property view`} width={cover.width} height={cover.height} sizes="(max-width: 680px) 100vw, (max-width: 1050px) 33vw, 17vw" unoptimized /> : <span className="property-card-placeholder">Photo preparing</span>}<span className="property-card-badge">{listing.purpose === "sale" ? "For sale" : "For rent"}</span></Link>
    <div className="property-card-copy"><strong className="property-card-price">{formatPrice(listing, currency, rates)}</strong><h2><Link href={`/properties/${listing.listing_id}`}>{listing.title}</Link></h2>{facts ? <p className="property-card-facts">{facts}</p> : null}<p className="property-card-location">{listing.public_location_label ?? listing.administrative_area_name}</p></div>
  </article>;
}

export function PropertySearchResults({ initialListings, initialCovers, initialFilters, initialCardsPerRow, locationOptions, rates }: Props) {
  const [listings, setListings] = useState(initialListings);
  const [covers, setCovers] = useState(initialCovers);
  const [cardsPerRow, setCardsPerRow] = useState<4 | 6>(initialCardsPerRow);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMapListingIds, setSelectedMapListingIds] = useState<string[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(initialFilters.displayCurrency);
  useEffect(() => {
    const loadCurrency = () => {
      const saved = window.localStorage.getItem("canadasap-display-currency");
      if (saved === "JMD" || saved === "USD" || saved === "CAD" || saved === "GBP") setDisplayCurrency(saved);
      else {
        const cookie = document.cookie.split("; ").find((item) => item.startsWith("properap_display_currency="))?.split("=")[1];
        if (cookie === "JMD" || cookie === "USD" || cookie === "CAD" || cookie === "GBP") setDisplayCurrency(cookie);
        else setDisplayCurrency("USD");
      }
    };
    const handleChange = (event: Event) => setDisplayCurrency((event as CustomEvent<DisplayCurrency>).detail);
    loadCurrency();
    window.addEventListener("canadasap:currency-change", handleChange);
    return () => window.removeEventListener("canadasap:currency-change", handleChange);
  }, []);
  const coverByListing = useMemo(() => new Map(covers.map((cover) => [cover.listing_id, cover])), [covers]);
  const mapListings = selectedMapListingIds ? listings.filter((listing) => selectedMapListingIds.includes(listing.listing_id)) : [];
  const pageSize = cardsPerRow * 3;
  const totalPages = Math.max(1, Math.ceil(listings.length / pageSize));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageListings = listings.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);

  async function updateResults(query: URLSearchParams) {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/properties?${query.toString()}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Search could not be completed.");
      const data = await response.json() as { listings: PublicListing[]; covers: ListingCover[] };
      setListings(data.listings);
      setCovers(data.covers);
      setSelectedMapListingIds(null);
      setCurrentPage(1);
      window.history.replaceState(null, "", `/properties?${query.toString()}`);
    } catch {
      setError("We could not update the listings. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void updateResults(queryFromForm(event.currentTarget, cardsPerRow));
  }

  function changeView(nextView: 4 | 6) {
    setCardsPerRow(nextView);
    setCurrentPage(1);
    const form = document.querySelector<HTMLFormElement>(".marketplace-filters");
    if (!form) return;
    const query = queryFromForm(form, nextView);
    window.history.replaceState(null, "", `/properties?${query.toString()}`);
  }

  return <>
    <section className="marketplace-heading">
      <div><span className="eyebrow dark"><i /> Brokerage-approved inventory</span><h1>{initialFilters.location ? `Property in ${initialFilters.location}` : initialFilters.intent === "vacation" ? "Vacation rentals in Jamaica." : `A place to ${initialFilters.intent}.`}</h1><p aria-live="polite">{isLoading ? "Updating listings…" : `${listings.length} active ${listings.length === 1 ? "listing" : "listings"} from eligible Jamaican brokerages.`}</p></div>
      <form className="marketplace-filters" onSubmit={submitSearch}>
        {initialFilters.brokerageSlug ? <input type="hidden" name="brokerage" value={initialFilters.brokerageSlug} /> : null}
        {initialFilters.agentSlug ? <input type="hidden" name="agent" value={initialFilters.agentSlug} /> : null}
        <label><span>City or area</span><select name="location" defaultValue={initialFilters.location}><option value="">Any city or area</option>{locationOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Looking for</span><select name="intent" defaultValue={initialFilters.intent}><option value="buy">Buy</option><option value="rent">Rent</option><option value="vacation">Vacation rental</option></select></label>
        <label><span>Use</span><select name="category" defaultValue={initialFilters.category}><option value="">Any use</option><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
        <label><span>Property type</span><select name="type" defaultValue={initialFilters.requestedType}><option value="">Any property</option><option value="house">House</option><option value="apartment">Apartment</option><option value="townhouse">Townhouse</option><option value="land">Land</option><option value="commercial">Commercial</option><option value="development">Development</option></select></label>
        <CurrencyPriceRangeFields rates={rates} initialCurrency={initialFilters.displayCurrency} />
        <label><span>Bedrooms</span><select name="beds" defaultValue={initialFilters.minimumBeds ?? ""}><option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></label>
        <label><span>Building size</span><select name="minSize" defaultValue={initialFilters.minimumSize ?? ""}><option value="">Any building size</option>{SIZE_OPTIONS.map((size) => <option key={size} value={size}>{new Intl.NumberFormat("en-JM").format(size)}+ sq ft</option>)}</select></label>
        <button className="solid-button" type="submit" disabled={isLoading}>{isLoading ? "Searching…" : "Search"}</button>
      </form>
    </section>

    <section className="property-search-card-section" aria-label="Property results" aria-busy={isLoading}>
      <div className="property-results-toolbar"><p><strong>{listings.length}</strong> properties</p><div aria-label="Cards per row" className="property-grid-switch"><span>View</span><button type="button" onClick={() => changeView(4)} aria-pressed={cardsPerRow === 4}>4</button><button type="button" onClick={() => changeView(6)} aria-pressed={cardsPerRow === 6}>6</button></div></div>
      {error ? <p className="search-results-error" role="alert">{error}</p> : null}
      {listings.length ? <><div className={`property-card-grid cards-${cardsPerRow}`}>{pageListings.map((listing) => <PropertyCard key={listing.listing_id} listing={listing} cover={coverByListing.get(listing.listing_id)} currency={displayCurrency} rates={rates} />)}</div>{totalPages > 1 ? <nav className="property-pagination" aria-label="Property result pages"><button type="button" disabled={visiblePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {visiblePage} of {totalPages}</span><button type="button" disabled={visiblePage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</button></nav> : null}</> : <div className="listing-empty"><span>No matching inventory</span><h2>Try a broader search.</h2><p>Only active listings appear here. Change the location or property type to see other available properties.</p><button className="solid-button" type="button" onClick={() => { const form = document.querySelector<HTMLFormElement>(".marketplace-filters"); form?.reset(); if (form) void updateResults(queryFromForm(form, cardsPerRow)); }}>Clear filters</button></div>}
    </section>

    <div className="property-map-separator" aria-hidden="true"><span>Explore listings on the map</span></div>
    <div className="marketplace-layout map-results-layout">
      <JamaicaListingMap listings={listings} selectedIds={selectedMapListingIds} onSelect={setSelectedMapListingIds} />
      <section className="marketplace-results" aria-label="Property results" aria-busy={isLoading}>
        <div className="property-results-toolbar"><p>{selectedMapListingIds ? <><strong>{mapListings.length}</strong> homes in this map area</> : "Choose a number on the map"}</p></div>
        {mapListings.length ? <div className="property-card-grid cards-6">{mapListings.map((listing) => <PropertyCard key={listing.listing_id} listing={listing} cover={coverByListing.get(listing.listing_id)} currency={displayCurrency} rates={rates} />)}</div> : <div className="map-results-placeholder">Select a numbered location to see its listings here.</div>}
      </section>
    </div>
  </>;
}
