import type { Metadata } from "next";
import Link from "next/link";
import { AccountHeader } from "@/app/components/account-header";
import { StatusMessage } from "@/app/components/status-message";
import { uploadSiteAssetAction } from "@/app/actions/site-builder";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "My profile", description: "Manage your professional profile photograph.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  const context = await getActiveMembershipContext("/account/profile");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const { data: site } = await context.supabase.from("professional_sites").select("id,slug").eq("owner_person_id", context.person.id).eq("site_type", "agent").eq("status", "active").maybeSingle();
  const { data: asset } = site ? await context.supabase.from("site_assets").select("id").eq("site_id", site.id).eq("placement", "profile_photo").eq("status", "ready").maybeSingle() : { data: null };
  return <main className="account-page"><StatusMessage error={query.error} notice={query.notice} /><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent} canReviewListings={access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} /><section className="account-hero compact"><span className="eyebrow"><i /> Professional profile</span><h1>My profile photo.</h1><p>Your photograph appears on your public agent website and brokerage team card.</p></section><div className="account-main settings-main"><section className="account-card profile-photo-card"><div className="card-heading"><span>Professional photo</span><h2>How clients see you</h2></div>{asset ? <div className="site-asset-preview"><img src={`/media/sites/${asset.id}/display.webp?v=${asset.id}`} alt="Current professional profile" /></div> : <div className="site-asset-preview empty"><span>No photo uploaded yet</span></div>}{site ? <form action={uploadSiteAssetAction} className="stack-form site-asset-upload" data-prompt-title="Save this professional photo?" data-prompt-message="It will be compressed, stripped of metadata, and shown on your public professional website." data-prompt-confirm="Save photo"><input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="placement" value="profile_photo" /><input type="hidden" name="returnTo" value="/account/profile" /><label className="site-file-picker"><span>Professional photo</span><input className="site-file-input" name="asset" type="file" accept="image/jpeg,image/png,image/webp" required /><span className="site-file-picker-row"><span className="site-file-picker-button">Choose file</span><span className="site-file-name">JPEG, PNG, or WebP under 5 MB</span></span></label><button className="outline-dark-button image-upload-button" type="submit">Prepare and upload</button></form> : <p className="form-error">An active agent website is required before you can add a professional photo.</p>}<Link className="outline-dark-button" href="/account">Back to my account</Link></section></div></main>;
}
