import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PublicHeader, PublicFooter } from "@/app/components/public-chrome";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { getPublicLocationOptions, parsePropertySearchParams, searchPublicListings } from "@/lib/public-property-search";
import { PropertySearchResults } from "./property-search-results";

export const metadata: Metadata = publicPageMetadata({
  title: "Property Search",
  description: "Search brokerage-approved property listings across Jamaica with SteadFast Realty.",
  path: "/properties",
  keywords: ["homes for sale Jamaica", "property for rent Jamaica", "Jamaica property search"],
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default async function Properties({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const filters = parsePropertySearchParams(params);
  const cardsPerRow = (Array.isArray(params.view) ? params.view[0] : params.view) === "4" ? 4 : 6;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const [{ listings, covers }, locationOptions] = await Promise.all([searchPublicListings(supabase, filters), getPublicLocationOptions(supabase, filters)]);

  return (
    <main className="search-page">
      <PublicHeader />

      <PropertySearchResults initialListings={listings} initialCovers={covers} initialFilters={filters} initialCardsPerRow={cardsPerRow} locationOptions={locationOptions} />
      <PublicFooter />
    </main>
  );
}
