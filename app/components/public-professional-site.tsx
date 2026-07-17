import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/app/components/brand-logo";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSiteRichText } from "@/lib/sites/rich-text";
import { TestimonialRotator, type Testimonial } from "@/app/components/testimonial-rotator";

type SiteListing = {
  listing_id: string; title: string; purpose: string; property_type: string;
  price: number; currency: string; bedrooms: number | null; bathrooms: number | null;
  public_location_label: string | null; administrative_area_name: string;
  public_latitude: number | null; public_longitude: number | null;
  assigned_agent_name: string; brokerage_name: string; is_demo: boolean;
  demo_notice: string | null; source_url: string | null;
};
type SiteMedia = { id: string; listing_id: string; position: number; width: number; height: number };

export async function getProfessionalSite(slug: string, expectedType?: "agent" | "brokerage") {
  const supabase = await createClient();
  let query = supabase.from("professional_sites").select("id,site_type,owner_person_id,owner_brokerage_id,slug,display_name,headline,bio,theme,layout,content,status").eq("slug", slug).eq("status", "active");
  if (expectedType) query = query.eq("site_type", expectedType);
  const { data } = await query.maybeSingle();
  return data;
}

export async function PublicProfessionalSite({ slug, expectedType }: { slug: string; expectedType?: "agent" | "brokerage" }) {
  const site = await getProfessionalSite(slug, expectedType);
  if (!site) notFound();
  const supabase = await createClient();
  let listingIds: string[] = [];
  const [{ data: assets }, { data: testimonials }] = await Promise.all([
    supabase.from("site_assets").select("id,placement").eq("site_id", site.id).eq("status", "ready"),
    supabase.from("site_testimonials").select("id,author_name,author_context,quote,asset_id,position").eq("site_id", site.id).eq("is_active", true).order("position").limit(10),
  ]);
  if (site.site_type === "agent" && site.owner_person_id) {
    const [{ data: owned }, { data: shared }] = await Promise.all([
      supabase.from("public_listing_snapshots").select("listing_id").eq("assigned_agent_person_id", site.owner_person_id),
      supabase.from("listing_shares").select("listing_id").eq("displaying_agent_person_id", site.owner_person_id).eq("status", "active"),
    ]);
    listingIds = [...new Set([...(owned ?? []), ...(shared ?? [])].map((row) => row.listing_id))];
  }
  let listingsQuery = supabase.from("public_listing_snapshots").select("listing_id,title,purpose,property_type,price,currency,bedrooms,bathrooms,public_location_label,administrative_area_name,public_latitude,public_longitude,assigned_agent_name,brokerage_name,is_demo,demo_notice,source_url").order("published_at", { ascending: false });
  if (site.site_type === "brokerage") listingsQuery = listingsQuery.eq("brokerage_id", site.owner_brokerage_id!);
  else if (listingIds.length) listingsQuery = listingsQuery.in("listing_id", listingIds);
  else return <SiteShell site={site} listings={[]} media={[]} assets={assets ?? []} testimonials={(testimonials ?? []) as Testimonial[]} />;
  const { data: listings } = await listingsQuery.limit(100);
  const ids = listings?.map((listing) => listing.listing_id) ?? [];
  const { data: media } = ids.length ? await supabase.from("public_listing_media").select("id,listing_id,position,width,height").in("listing_id", ids).eq("variant", "card").order("position") : { data: [] };
  return <SiteShell site={site} listings={listings ?? []} media={media ?? []} assets={assets ?? []} testimonials={(testimonials ?? []) as Testimonial[]} />;
}

function SiteShell({ site, listings, media, assets, testimonials }: { site: NonNullable<Awaited<ReturnType<typeof getProfessionalSite>>>; listings: SiteListing[]; media: SiteMedia[]; assets: {id:string;placement:string}[]; testimonials: Testimonial[] }) {
  const sourceQuery = `?site=${site.id}`;
  const theme = site.theme ?? {}; const style = { "--site-primary": safeColor(theme.primary, "#102C2A"), "--site-accent": safeColor(theme.accent, "#D8A72E"), "--site-background": safeColor(theme.background, "#FBFAF6"), "--site-text": safeColor(theme.text, "#17201C") } as CSSProperties;
  const rawOrder: unknown[] = Array.isArray(site.layout?.sectionOrder) ? site.layout.sectionOrder as unknown[] : [];
  const order: string[] = rawOrder.length ? rawOrder.filter((item: unknown): item is string => ["hero","about","search","listings","testimonials","contact"].includes(String(item))) : ["hero","about","search","listings","testimonials","contact"];
  const content = site.content ?? {}; const asset = assets.find((item) => item.placement === (site.site_type === "brokerage" ? "brokerage_logo" : "profile_photo"));
  const section = {
    hero: <section key="hero" className="professional-site-hero">{asset ? <Image className={site.site_type === "brokerage" ? "site-logo" : "site-profile-photo"} src={`/professional-assets/${asset.id}/display.webp?v=${asset.id}`} alt={`${site.display_name} ${site.site_type === "brokerage" ? "logo" : "profile photograph"}`} width={220} height={220} unoptimized /> : null}<span>{site.site_type === "agent" ? "SteadFast agent" : "SteadFast brokerage"}</span><h1>{site.display_name}</h1><p>{site.headline ?? (site.site_type === "agent" ? "Local property guidance with clear, professional service." : "Verified property opportunities across Jamaica.")}</p></section>,
    about: <section key="about" className="professional-site-intro"><div><span>About</span><h2>{site.site_type === "agent" ? "Service built around your property goals." : "A brokerage portfolio in one clear place."}</h2></div>{content.aboutHtml ? <div className="site-rich-content" dangerouslySetInnerHTML={{ __html: sanitizeSiteRichText(String(content.aboutHtml)) }} /> : <p>{site.bio ?? "Browse active, brokerage-approved listings and contact the assigned property professional securely through SteadFast."}</p>}{content.strengths ? <p className="site-strengths"><strong>Career strengths</strong>{String(content.strengths)}</p> : null}</section>,
    search: <section key="search" className="professional-site-search"><span>Find your place</span><h2>Search Jamaican property</h2><form action="/properties"><label><span>City or area</span><input name="location" maxLength={80} placeholder="Kingston, Ocho Rios, Negril…" /></label><label><span>Bedrooms</span><select name="beds"><option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></label><button type="submit">Search listings</button></form></section>,
    listings: <section key="listings" className="professional-site-listings"><div className="section-heading"><div><span>Active portfolio</span><h2>{listings.length} propert{listings.length === 1 ? "y" : "ies"}</h2></div><p>Every listing shown here remains controlled by its owning brokerage and assigned representative.</p></div>{listings.length ? <div className="marketplace-results">{listings.map((listing) => { const photo = media.find((item) => item.listing_id === listing.listing_id); return <article className="property-result-card" key={listing.listing_id}>{photo ? <Image src={`/media/listings/${photo.id}/card.webp`} alt={`${listing.title} property view`} width={photo.width} height={photo.height} unoptimized /> : <div className="property-card-placeholder">Photo preparing</div>}<div><span>{listing.is_demo ? "Demo listing" : listing.purpose === "sale" ? "For sale" : "For rent"}</span><h3>{listing.title}</h3><p>{listing.public_location_label ?? listing.administrative_area_name}</p><strong>{new Intl.NumberFormat("en-JM",{style:"currency",currency:listing.currency,maximumFractionDigits:0}).format(listing.price)}</strong><small>{listing.bedrooms ?? "—"} beds · {listing.bathrooms ?? "—"} baths · {listing.assigned_agent_name}</small><Link href={`/properties/${listing.listing_id}${sourceQuery}`}>View property</Link></div></article>; })}</div> : <div className="listing-empty"><span>Portfolio</span><h2>No active listings right now.</h2><p>This professional website remains active while new brokerage-approved inventory is prepared.</p></div>}</section>,
    testimonials: testimonials.length ? <section key="testimonials" className="professional-site-testimonials"><span>Client stories</span><h2>Trusted through every step.</h2><TestimonialRotator testimonials={testimonials} /></section> : null,
    contact: <section key="contact" className="professional-site-contact"><span>Start a conversation</span><h2>Ready when you are.</h2>{content.contactEmail ? <a href={`mailto:${encodeURIComponent(String(content.contactEmail))}`}>{String(content.contactEmail)}</a> : null}{content.contactPhone ? <p>{String(content.contactPhone)}</p> : null}<Link href="/properties">Browse all properties</Link></section>,
  } as Record<string, ReactNode>;
  return <main className="professional-site-page" style={style}>
    <header className="site-header"><BrandLogo /><nav><Link href="/properties">All properties</Link><Link href="/sign-in">Professional sign in</Link></nav></header>
    {order.map((name: string) => section[name])}
  </main>;
}

function safeColor(value: unknown, fallback: string) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
