import Image from "next/image";
import Link from "next/link";
import { createElement, type CSSProperties, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSiteRichText } from "@/lib/sites/rich-text";
import { TestimonialRotator, type Testimonial } from "@/app/components/testimonial-rotator";
import { ProfessionalListingGrid } from "@/app/components/professional-listing-grid";
import { PropertySearchCard } from "@/app/components/property-search-card";
import { AutoFitHeading } from "@/app/components/auto-fit-heading";
import { PublicSiteLiveRefresh } from "@/app/components/public-site-live-refresh";
import { BrokerageTeamGrid, type BrokerageTeamMember } from "@/app/components/brokerage-team-grid";

type SiteListing = {
  listing_id: string; title: string; purpose: string; property_type: string;
  price: number; currency: string; bedrooms: number | null; bathrooms: number | null; building_area: number | null;
  public_location_label: string | null; administrative_area_name: string;
  public_latitude: number | null; public_longitude: number | null;
  assigned_agent_name: string; brokerage_name: string; is_demo: boolean;
  demo_notice: string | null; source_url: string | null;
};
type SiteMedia = { id: string; listing_id: string; position: number; width: number; height: number };

function HeroColorText({ color, children }: { color: string; children: ReactNode }) {
  return createElement("font", { color }, children);
}

function AgentHeroName({ name }: { name: string }) {
  const nameParts = name.trim().split(/\s+/);
  const lastName = nameParts.pop() ?? "";
  const firstNames = nameParts.join(" ");
  return <><span className="agent-hero-first-name">{firstNames}{firstNames ? " " : ""}</span><span className="agent-hero-last-name">{lastName}</span></>;
}

export async function getProfessionalSite(slug: string, expectedType?: "agent" | "brokerage") {
  const supabase = await createClient();
  let query = supabase.from("professional_sites").select("id,site_type,owner_person_id,owner_brokerage_id,slug,display_name,headline,bio,theme,layout,content,status,updated_at").eq("slug", slug).eq("status", "active");
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
  let team: BrokerageTeamMember[] = [];
  if (site.site_type === "brokerage" && site.owner_brokerage_id) {
    const admin = createAdminClient();
    const { data: memberships } = await admin.from("brokerage_memberships").select("id,person_id").eq("brokerage_id", site.owner_brokerage_id).eq("status", "active");
    const membershipIds = (memberships ?? []).map((membership) => membership.id);
    if (membershipIds.length) {
      const { data: roles } = await admin.from("membership_roles").select("membership_id,role_key").in("membership_id", membershipIds).is("ends_at", null).in("role_key", ["agent", "broker"]);
      const agentMemberships = (memberships ?? []).filter((membership) => (roles ?? []).some((role) => role.membership_id === membership.id && role.role_key === "agent"));
      const personIds = [...new Set(agentMemberships.map((membership) => membership.person_id))];
      if (personIds.length) {
        const [{ data: agentSites }, { data: profileAssets }] = await Promise.all([
          admin.from("professional_sites").select("id,slug,display_name,owner_person_id").eq("site_type", "agent").eq("status", "active").in("owner_person_id", personIds),
          admin.from("site_assets").select("id,site_id").eq("placement", "profile_photo").eq("status", "ready"),
        ]);
        const principalPeople = new Set(agentMemberships.filter((membership) => (roles ?? []).some((role) => role.membership_id === membership.id && role.role_key === "broker")).map((membership) => membership.person_id));
        const photoBySite = new Map((profileAssets ?? []).map((asset) => [asset.site_id, asset.id]));
        team = (agentSites ?? []).map((agent) => ({ id: agent.id, slug: agent.slug, displayName: agent.display_name, photoAssetId: photoBySite.get(agent.id) ?? null, isPrincipal: principalPeople.has(agent.owner_person_id) })).sort((first, second) => Number(second.isPrincipal) - Number(first.isPrincipal) || first.displayName.localeCompare(second.displayName, "en-JM", { sensitivity: "base" }));
      }
    }
  }
  if (site.site_type === "agent" && site.owner_person_id) {
    const [{ data: owned }, { data: shared }] = await Promise.all([
      supabase.from("public_listing_snapshots").select("listing_id").eq("assigned_agent_person_id", site.owner_person_id),
      supabase.from("listing_shares").select("listing_id").eq("displaying_agent_person_id", site.owner_person_id).eq("status", "active"),
    ]);
    listingIds = [...new Set([...(owned ?? []), ...(shared ?? [])].map((row) => row.listing_id))];
  }
  let listingsQuery = supabase.from("public_listing_snapshots").select("listing_id,title,purpose,property_type,price,currency,bedrooms,bathrooms,building_area,public_location_label,administrative_area_name,public_latitude,public_longitude,assigned_agent_name,brokerage_name,is_demo,demo_notice,source_url").order("published_at", { ascending: false });
  if (site.site_type === "brokerage") listingsQuery = listingsQuery.eq("brokerage_id", site.owner_brokerage_id!);
  else if (listingIds.length) listingsQuery = listingsQuery.in("listing_id", listingIds);
  else return <SiteShell site={site} listings={[]} media={[]} assets={assets ?? []} testimonials={(testimonials ?? []) as Testimonial[]} team={team} />;
  const { data: listings } = await listingsQuery.limit(100);
  const ids = listings?.map((listing) => listing.listing_id) ?? [];
  const { data: media } = ids.length ? await supabase.from("public_listing_media").select("id,listing_id,position,width,height").in("listing_id", ids).eq("variant", "card").order("position") : { data: [] };
  return <SiteShell site={site} listings={listings ?? []} media={media ?? []} assets={assets ?? []} testimonials={(testimonials ?? []) as Testimonial[]} team={team} />;
}

function SiteShell({ site, listings, media, assets, testimonials, team }: { site: NonNullable<Awaited<ReturnType<typeof getProfessionalSite>>>; listings: SiteListing[]; media: SiteMedia[]; assets: {id:string;placement:string}[]; testimonials: Testimonial[]; team: BrokerageTeamMember[] }) {
  const theme = site.theme ?? {};
  const palette = { primary: safeColor(theme.primary, "#102C2A"), accent: safeColor(theme.accent, "#D8A72E"), background: safeColor(theme.background, "#FBFAF6"), text: safeColor(theme.text, "#17201C") };
  const heroTextColor = palette.text;
  const heroSecondaryTextColor = palette.text;
  const rawOrder: unknown[] = Array.isArray(site.layout?.sectionOrder) ? site.layout.sectionOrder as unknown[] : [];
  const validSections = site.site_type === "brokerage" ? ["hero", "about", "team", "search", "listings", "contact"] : ["hero", "about", "search", "listings", "testimonials", "contact"];
  const savedOrder = rawOrder.filter((item: unknown): item is string => validSections.includes(String(item)));
  const order: string[] = savedOrder.length === validSections.length ? savedOrder : validSections;
  const content = site.content ?? {}; const asset = assets.find((item) => item.placement === (site.site_type === "brokerage" ? "brokerage_logo" : "profile_photo")); const heroBackgroundAsset = assets.find((item) => item.placement === "hero_background");
  const style = { "--site-primary": palette.primary, "--site-accent": palette.accent, "--site-background": palette.background, "--site-text": palette.text, "--site-on-primary": heroTextColor, "--site-on-primary-muted": heroSecondaryTextColor, backgroundColor: palette.background, color: palette.text } as CSSProperties;
  const section = {
    hero: site.site_type === "agent"
      ? <section key="hero" className="professional-site-hero agent-site-hero"><div className={`agent-site-ocean-banner${heroBackgroundAsset ? " has-custom-image" : ""}`} aria-hidden="true">{heroBackgroundAsset ? <Image className="agent-site-ocean-image" src={`/media/sites/${heroBackgroundAsset.id}/display.webp?v=${heroBackgroundAsset.id}`} alt="" width={2400} height={800} priority unoptimized /> : null}</div><div className="agent-site-profile-panel">{asset ? <Image className="site-profile-photo" src={`/media/listings/${asset.id}/card.webp?v=${asset.id}`} alt={`${site.display_name} profile photograph`} width={420} height={420} unoptimized /> : null}<div className="professional-site-hero-copy"><AutoFitHeading className="brokerage-site-title"><AgentHeroName name={site.display_name} /></AutoFitHeading><p><HeroColorText color={palette.text}>{site.headline ?? "Local property guidance with clear, professional service."}</HeroColorText></p></div></div></section>
      : <section key="hero" className="professional-site-hero brokerage-site-hero"><svg className="professional-site-hero-surface" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill={palette.primary} /></svg><div className="professional-site-hero-content">{asset ? <Image className="site-logo" src={`/media/listings/${asset.id}/card.webp?v=${asset.id}`} alt={`${site.display_name} logo`} width={220} height={220} unoptimized /> : null}<div className="professional-site-hero-copy"><AutoFitHeading className="brokerage-site-title"><HeroColorText color={palette.text}>{site.display_name}</HeroColorText></AutoFitHeading><p><HeroColorText color={palette.text}>{site.headline ?? "Verified property opportunities across Jamaica."}</HeroColorText></p><Link className="site-join-button" href={`/join/${site.slug}`}><HeroColorText color={palette.text}>Join this brokerage</HeroColorText></Link></div></div></section>,
    about: <section key="about" className="professional-site-intro"><div><span>About</span><h2>{String(content.aboutHeading || (site.site_type === "agent" ? "Service built around your property goals." : "A brokerage portfolio in one clear place."))}</h2></div><div className="professional-site-about-copy">{content.aboutHtml ? <div className="site-rich-content" dangerouslySetInnerHTML={{ __html: sanitizeSiteRichText(String(content.aboutHtml)) }} /> : <p>{site.bio ?? "Browse active, brokerage-approved listings and contact the assigned property professional securely through SteadFast."}</p>}{content.strengths ? <p className="site-strengths"><strong>Career strengths</strong>{String(content.strengths)}</p> : null}</div></section>,
    team: team.length ? <section key="team" className="professional-site-team"><div className="professional-site-team-heading"><span>Meet the team</span><h2>Brokerage Team</h2></div><BrokerageTeamGrid members={team} /></section> : null,
    search: <section key="search" className="professional-site-search"><span>Find your place</span><h2>{site.site_type === "brokerage" ? `${site.display_name} properties` : `${site.display_name}'s properties`}</h2><PropertySearchCard hiddenFields={site.site_type === "brokerage" ? { brokerage: site.slug } : { agent: site.slug }} locationOptions={Array.from(new Set(listings.map((listing) => listing.public_location_label ?? listing.administrative_area_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "en-JM", { sensitivity: "base" }))} /></section>,
    listings: <section key="listings" className="professional-site-listings"><div className="section-heading"><div><span>Active portfolio</span><h2>{listings.length} propert{listings.length === 1 ? "y" : "ies"}</h2></div><p>Every listing shown here remains controlled by its owning brokerage and assigned representative.</p></div>{listings.length ? <ProfessionalListingGrid listings={listings} media={media} siteId={site.id} /> : <div className="listing-empty"><span>Portfolio</span><h2>No active listings right now.</h2><p>This professional website remains active while new brokerage-approved inventory is prepared.</p></div>}</section>,
    testimonials: site.site_type === "agent" && testimonials.length ? <section key="testimonials" className="professional-site-testimonials"><span>Client stories</span><TestimonialRotator testimonials={testimonials} /></section> : null,
    contact: <section key="contact" className="professional-site-contact"><span>Start a conversation</span><h2>Ready when you are.</h2>{content.contactEmail ? <a href={`mailto:${encodeURIComponent(String(content.contactEmail))}`}>{String(content.contactEmail)}</a> : null}{content.contactPhone ? <p>{String(content.contactPhone)}</p> : null}<Link href="/properties">Browse all properties</Link></section>,
  } as Record<string, ReactNode>;
  return <main className="professional-site-page" style={style}>
    <PublicSiteLiveRefresh slug={site.slug} updatedAt={site.updated_at} />
    <style>{`.professional-site-page { background: ${palette.background} !important; color: ${palette.text} !important; }.professional-site-page .brokerage-site-hero { background: ${palette.primary} !important; }.professional-site-page .professional-site-hero h1 { color: ${heroTextColor} !important; -webkit-text-fill-color: ${heroTextColor} !important; }.professional-site-page .professional-site-hero p { color: ${heroSecondaryTextColor} !important; -webkit-text-fill-color: ${heroSecondaryTextColor} !important; }.professional-site-page .professional-site-hero .site-join-button { color: ${heroTextColor} !important; -webkit-text-fill-color: ${heroTextColor} !important; }`}</style>
    {order.map((name: string) => section[name])}
    <footer className="professional-site-footer"><nav aria-label="Professional website navigation"><Link href="/properties">All properties</Link><Link href="/sign-in">Professional sign in</Link></nav><span>SteadFast Realty</span><a href="https://www.properap.com">properap.com</a><span>© {new Date().getFullYear()} SteadFast Realty. All rights reserved.</span></footer>
  </main>;
}

function safeColor(value: unknown, fallback: string) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
