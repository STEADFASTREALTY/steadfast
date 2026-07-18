"use client";

import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { PublicListing } from "@/lib/public-property-search";
import "leaflet/dist/leaflet.css";

type Cluster = { id: string; latitude: number; longitude: number; listings: PublicListing[] };
function clustersFor(listings: PublicListing[]) {
  const groups = new Map<string, PublicListing[]>();
  for (const listing of listings) {
    if (listing.public_latitude === null || listing.public_longitude === null) continue;
    const key = `${Math.round(listing.public_latitude * 8) / 8}:${Math.round(listing.public_longitude * 8) / 8}`;
    groups.set(key, [...(groups.get(key) ?? []), listing]);
  }
  return Array.from(groups.entries()).map(([id, grouped]) => ({ id, latitude: grouped.reduce((sum, listing) => sum + listing.public_latitude!, 0) / grouped.length, longitude: grouped.reduce((sum, listing) => sum + listing.public_longitude!, 0) / grouped.length, listings: grouped })) as Cluster[];
}
export function JamaicaListingMap({ listings, selectedIds, onSelect }: { listings: PublicListing[]; selectedIds: string[] | null; onSelect: (ids: string[] | null) => void }) {
  const clusters = clustersFor(listings);
  return <section className="listing-map" aria-label="Map of property listings"><div className="listing-map-toolbar"><strong>{listings.length} listings found</strong>{selectedIds ? <button type="button" onClick={() => onSelect(null)}>Show all</button> : <span>Choose a number to view homes</span>}</div><MapContainer center={[18.24, -77.33]} zoom={9} minZoom={9} maxZoom={14} maxBounds={[[16.8, -80.5], [19.3, -75.5]]} scrollWheelZoom className="jamaica-map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="/api/map-tiles/{z}/{x}/{y}" />{clusters.map((cluster) => { const active = selectedIds?.some((id) => cluster.listings.some((listing) => listing.listing_id === id)); return <CircleMarker key={cluster.id} center={[cluster.latitude, cluster.longitude]} radius={cluster.listings.length > 1 ? 21 : 15} pathOptions={{ color: "#8a3f17", fillColor: active ? "#168c91" : "#d96b52", fillOpacity: .95, weight: 1 }} eventHandlers={{ click: () => onSelect(cluster.listings.map((listing) => listing.listing_id)) }}><Tooltip permanent direction="center" className="listing-cluster-label">{cluster.listings.length}</Tooltip></CircleMarker>; })}</MapContainer></section>;
}
