import Link from "next/link";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { HomeSearch } from "@/app/components/home-search";
import { HomeAgentRotator, type HomeAgent } from "@/app/components/home-agent-rotator";
import { PublicFooter, PublicHeader } from "@/app/components/public-chrome";

export const metadata = publicPageMetadata({ title: "Jamaica Property Search", description: "Search Jamaica property listings and discover trusted real estate professionals through ProperAP.", path: "/", keywords: ["Jamaica property search", "Jamaica real estate", "Jamaica brokers"] });

export default async function Home() {
  await connection();
  const admin = createAdminClient();
  const [{ data: places }, { data: featured }, { data: memberships }, { data: rates }] = await Promise.all([
    admin.from("public_listing_snapshots").select("public_location_label,administrative_area_name").limit(1000),
    admin.from("platform_featured_brokerages").select("brokerage_id,display_rank").eq("is_active", true).order("display_rank").limit(4),
    admin.from("brokerage_memberships").select("person_id,brokerage_id,brokerages(display_name)").eq("status", "active"),
    admin.from("exchange_rate_snapshots").select("jmd_per_usd,cad_per_usd,gbp_per_usd,provider_updated_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const locationOptions = Array.from(new Set((places ?? []).flatMap((row) => [row.public_location_label, row.administrative_area_name]).filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))).sort((a, b) => a.localeCompare(b, "en-JM"));
  const featuredIds = (featured ?? []).map((row) => row.brokerage_id);
  const { data: brokerageSites } = featuredIds.length ? await admin.from("professional_sites").select("owner_brokerage_id,slug,display_name,headline,id").eq("site_type", "brokerage").eq("status", "active").in("owner_brokerage_id", featuredIds) : { data: [] };
  const { data: brokerAssets } = brokerageSites?.length ? await admin.from("site_assets").select("site_id,id").eq("placement", "brokerage_logo").eq("status", "ready").in("site_id", brokerageSites.map((site) => site.id)) : { data: [] };
  const people = [...new Set((memberships ?? []).map((membership) => membership.person_id))];
  const { data: agentSites } = people.length ? await admin.from("professional_sites").select("id,slug,display_name,owner_person_id").eq("site_type", "agent").eq("status", "active").in("owner_person_id", people) : { data: [] };
  const { data: agentAssets } = agentSites?.length ? await admin.from("site_assets").select("site_id,id").eq("placement", "profile_photo").eq("status", "ready").in("site_id", agentSites.map((site) => site.id)) : { data: [] };
  const brokerageNameByPerson = new Map((memberships ?? []).map((membership) => [membership.person_id, (membership.brokerages as unknown as { display_name?: string } | null)?.display_name ?? "ProperAP brokerage"]));
  const agentPhotoBySite = new Map((agentAssets ?? []).map((asset) => [asset.site_id, asset.id]));
  const shuffledAgents = (agentSites ?? []).map((site) => ({ id: site.id, slug: site.slug, name: site.display_name, brokerage: brokerageNameByPerson.get(site.owner_person_id) ?? "ProperAP brokerage", photoAssetId: agentPhotoBySite.get(site.id) ?? null }) satisfies HomeAgent).sort(() => Math.random() - .5).slice(0, 12);
  const brokerAssetsBySite = new Map((brokerAssets ?? []).map((asset) => [asset.site_id, asset.id]));
  const brokerages = (featured ?? []).flatMap((featuredBroker) => { const site = brokerageSites?.find((candidate) => candidate.owner_brokerage_id === featuredBroker.brokerage_id); return site ? [{ ...site, logoAssetId: brokerAssetsBySite.get(site.id) ?? null }] : []; });
  return <main className="home-page"><PublicHeader /><section className="home-search-hero"><span>Jamaica property search</span><h1>Find your next place.</h1><p>Search homes, land, rentals, and commercial opportunities across Jamaica.</p><HomeSearch locations={locationOptions} rates={rates} /></section><section className="home-recommendations"><div className="home-section-heading"><span>Recommended</span><h2>Brokerages to know.</h2></div><div className="home-recommendation-grid">{brokerages.map((broker) => <Link key={broker.id} href={`/brokerages/${broker.slug}`} className="home-recommendation-card broker"><div className="home-broker-logo">{broker.logoAssetId ? <img src={`/media/listings/${broker.logoAssetId}/card.webp?v=${broker.logoAssetId}`} alt={`${broker.display_name} logo`} /> : <span>{broker.display_name.slice(0, 1)}</span>}</div><strong>{broker.display_name}</strong><small>{broker.headline ?? "View brokerage profile"}</small></Link>)}</div>{!brokerages.length ? <p className="home-empty">Recommended brokerages will appear here.</p> : null}</section><section className="home-recommendations agents"><div className="home-section-heading"><span>Recommended</span><h2>Meet local agents.</h2></div><HomeAgentRotator agents={shuffledAgents} /></section><section className="home-final-call"><h2>Ready to search?</h2><Link className="solid-button" href="/properties">Browse all properties</Link></section><PublicFooter /></main>;
}
