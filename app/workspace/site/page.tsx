import type { Metadata } from "next";
import { AccountHeader } from "@/app/components/account-header";
import { SiteBuilder } from "@/app/components/site-builder";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Website builder", description: "Customize your private professional website.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function SiteBuilderPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams; const context = await getActiveMembershipContext("/workspace/site");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const siteQuery = context.supabase.from("professional_sites").select("id,site_type,owner_person_id,owner_brokerage_id,display_name,headline,slug,theme,layout,content").eq("status", "active");
  const { data: allSites } = await siteQuery;
  const sites = (allSites ?? []).filter((site) => site.owner_person_id === context.person.id || (context.roles.includes("broker") && site.owner_brokerage_id === context.membership?.brokerage_id));
  const { data: testimonials } = sites.length ? await context.supabase.from("site_testimonials").select("id,site_id,author_name,author_context,quote,asset_id,position,created_at").in("site_id", sites.map((site) => site.id)).eq("is_active", true).order("position") : { data: [] };
  return <main className="account-page"><StatusMessage error={query.error} notice={query.notice} /><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent} canReviewListings={access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} /><section className="account-hero compact"><span className="eyebrow"><i /> Professional presence</span><h1>Build your website.</h1><p>Use modular sections, readable rich text, and your own color palette without changing your brokerage’s listing controls.</p></section><div className="account-main settings-main">{sites.map((site) => <SiteBuilder key={site.id} site={site} testimonials={(testimonials ?? []).filter((testimonial) => testimonial.site_id === site.id)} />)}{!sites.length ? <section className="account-card"><h2>Website unavailable</h2><p>Only an active agent or principal broker can customize a professional site.</p></section> : null}</div></main>;
}
