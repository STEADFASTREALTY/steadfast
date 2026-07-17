import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePropertySearchParams, searchPublicListings } from "@/lib/public-property-search";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parsePropertySearchParams(Object.fromEntries(url.searchParams));
  const supabase = await createClient();
  const results = await searchPublicListings(supabase, filters);
  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
