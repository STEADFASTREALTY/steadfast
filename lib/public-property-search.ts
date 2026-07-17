import type { SupabaseClient } from "@supabase/supabase-js";

export type PropertySearchParams = {
  location: string;
  requestedType: string;
  category: string;
  minPrice: number | null;
  maxPrice: number | null;
  minimumBeds: number | null;
  minimumSize: number | null;
  maximumSize: number | null;
  intent: "buy" | "rent";
  brokerageSlug: string;
  agentSlug: string;
};

export type PublicListing = {
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
  building_area: number | null;
  land_area: number | null;
  administrative_area_name: string;
  public_location_label: string | null;
  brokerage_name: string;
  assigned_agent_name: string;
  ready_media_count: number;
};

export type ListingCover = { id: string; listing_id: string; variant: string; width: number; height: number };

function firstParameter(value: string | string[] | null | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function safeSearchWords(value: string | string[] | null | undefined) {
  return firstParameter(value).slice(0, 80).replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

function wholeNumber(value: string | string[] | null | undefined, maximum = 1_000_000_000) {
  const raw = firstParameter(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? Math.floor(parsed) : null;
}

function maximumPrice(value: string | string[] | null | undefined) {
  return firstParameter(value) === "500000000+" ? null : wholeNumber(value);
}

function safeSlug(value: string | string[] | null | undefined) {
  return firstParameter(value).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 100);
}

export function parsePropertySearchParams(params: Record<string, string | string[] | undefined>): PropertySearchParams {
  return {
    location: safeSearchWords(params.location),
    requestedType: firstParameter(params.type).toLowerCase().slice(0, 30),
    category: firstParameter(params.category).toLowerCase(),
    minPrice: wholeNumber(params.minPrice),
    maxPrice: maximumPrice(params.maxPrice),
    minimumBeds: wholeNumber(params.beds, 20),
    minimumSize: wholeNumber(params.minSize, 10_000_000),
    maximumSize: wholeNumber(params.maxSize, 10_000_000),
    intent: firstParameter(params.intent) === "rent" ? "rent" : "buy",
    brokerageSlug: safeSlug(params.brokerage),
    agentSlug: safeSlug(params.agent),
  };
}

export async function searchPublicListings(supabase: SupabaseClient, filters: PropertySearchParams) {
  let query = supabase
    .from("public_listing_snapshots")
    .select("listing_id,lifecycle_state,purpose,property_type,property_subtype,currency,price,price_period,title,description,bedrooms,bathrooms,building_area,land_area,administrative_area_name,public_location_label,brokerage_name,assigned_agent_name,ready_media_count")
    .eq("purpose", filters.intent === "rent" ? "long_term_rent" : "sale")
    .order("published_at", { ascending: false })
    .limit(24);

  if (filters.location) query = query.textSearch("search_document", filters.location, { config: "simple", type: "websearch" });
  if (["commercial", "land", "development"].includes(filters.requestedType)) query = query.eq("property_type", filters.requestedType);
  else if (["house", "apartment", "townhouse"].includes(filters.requestedType)) query = query.eq("property_type", "residential").ilike("property_subtype", filters.requestedType);
  if (filters.category === "residential") query = query.eq("property_type", "residential");
  if (filters.category === "commercial") query = query.eq("property_type", "commercial");
  if (filters.minPrice !== null) query = query.gte("price", filters.minPrice);
  if (filters.maxPrice !== null) query = query.lte("price", filters.maxPrice);
  if (filters.minimumBeds !== null) query = query.gte("bedrooms", filters.minimumBeds);
  if (filters.minimumSize !== null) query = query.gte("building_area", filters.minimumSize);
  if (filters.maximumSize !== null) query = query.lte("building_area", filters.maximumSize);
  if (filters.brokerageSlug) query = query.eq("brokerage_slug", filters.brokerageSlug);
  if (filters.agentSlug) query = query.eq("assigned_agent_slug", filters.agentSlug);

  const { data } = await query;
  const listings = (data ?? []) as PublicListing[];
  const listingIds = listings.map((listing) => listing.listing_id);
  const { data: covers } = listingIds.length
    ? await supabase.from("public_listing_media").select("id,listing_id,variant,width,height").in("listing_id", listingIds).eq("variant", "card").eq("position", 1)
    : { data: [] };
  return { listings, covers: (covers ?? []) as ListingCover[] };
}

export async function getPublicLocationOptions(supabase: SupabaseClient, filters?: Pick<PropertySearchParams, "brokerageSlug" | "agentSlug">) {
  let query = supabase.from("public_listing_snapshots").select("public_location_label,administrative_area_name").limit(1000);
  if (filters?.brokerageSlug) query = query.eq("brokerage_slug", filters.brokerageSlug);
  if (filters?.agentSlug) query = query.eq("assigned_agent_slug", filters.agentSlug);
  const { data } = await query;
  return Array.from(new Set((data ?? []).flatMap((listing) => [listing.public_location_label, listing.administrative_area_name]).filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())))
    .sort((a, b) => a.localeCompare(b, "en-JM", { sensitivity: "base" }));
}
