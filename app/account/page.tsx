import type { Metadata } from "next";
import Link from "next/link";
import { AccountHeader } from "@/app/components/account-header";
import { AccountSectionNav } from "@/app/components/account-section-nav";
import { StatusMessage } from "@/app/components/status-message";
import {
  submitAgentApplicationAction,
  updateProfileAction,
} from "@/app/actions/onboarding";
import { uploadSiteAssetAction } from "@/app/actions/site-builder";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "My account", description: "Manage your private SteadFast profile and brokerage participation.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const applicationLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Waiting for broker review",
  broker_approved: "Broker approved",
  broker_denied: "Not approved",
  activated: "Active agent",
  withdrawn: "Withdrawn",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; section?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveMembershipContext();
  const activeSection = params.section === "photo" ? "photo" : "profile";
  const [{ data: brokerages }, { data: applications }, { data: site }] = await Promise.all([
    context.supabase
      .from("brokerages")
      .select("id, display_name, slug")
      .eq("status", "active")
      .order("display_name"),
    context.supabase
      .from("agent_applications")
      .select("id, status, submitted_at, broker_reason, brokerages(display_name, slug)")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("professional_sites")
      .select("id,slug")
      .eq("owner_person_id", context.person.id)
      .eq("site_type", "agent")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  const { data: profileAsset } = site
    ? await context.supabase.from("site_assets").select("id").eq("site_id", site.id).eq("placement", "profile_photo").eq("status", "ready").maybeSingle()
    : { data: null };

  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
  });
  const openApplication = applications?.some((application) =>
    ["draft", "submitted", "broker_approved"].includes(application.status),
  );

  return (
    <main className="account-page">
      <AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} />
      <section className="account-hero compact">
        <span className="eyebrow"><i /> Your SteadFast account</span>
        <h1>Hello, {context.person.display_name}.</h1>
        <p>Keep your profile current and manage how you participate in the professional network.</p>
      </section>
      <div className="account-settings-layout">
        <AccountSectionNav active={activeSection} />
        <div className="account-main">
          <StatusMessage error={params.error} notice={params.notice} />
          {activeSection === "profile" ? <>
          <section className="account-card">
            <div className="card-heading"><span>Profile</span><h2>Your details</h2></div>
            <form action={updateProfileAction} className="stack-form two-column" data-prompt-title="Save your profile changes?" data-prompt-message="Your SteadFast display name and phone number will be updated for future account and professional use." data-prompt-confirm="Save profile">
              <label className="full"><span>Display name</span><input name="displayName" defaultValue={context.person.display_name} minLength={2} maxLength={120} required /></label>
              <label className="full"><span>Email</span><input value={context.person.primary_email ?? context.user.email ?? ""} readOnly /></label>
              <label className="full"><span>Phone</span><input name="phone" defaultValue={context.person.primary_phone ?? ""} autoComplete="tel" maxLength={30} /></label>
              <input type="hidden" name="locale" value="en-JM" />
              <input type="hidden" name="timezone" value="America/Jamaica" />
              <button className="solid-button full" type="submit">Save profile</button>
            </form>
          </section>

          {!context.membership && !openApplication ? (
            <section className="account-card accent-card">
              <div className="card-heading"><span>For professionals</span><h2>Apply to join a brokerage</h2></div>
              <p>Independent agent registration is not available. Choose the brokerage that referred you; its broker will review your application.</p>
              <form action={submitAgentApplicationAction} className="stack-form" data-prompt-title="Send this agent application?" data-prompt-message="The selected brokerage will receive your application for review. You cannot join as an independent agent." data-prompt-confirm="Send application">
                <label><span>Brokerage</span><select name="brokerageId" required defaultValue=""><option value="" disabled>Select your brokerage</option>{brokerages?.map((brokerage) => <option key={brokerage.id} value={brokerage.id}>{brokerage.display_name}</option>)}</select></label>
                <button className="solid-button" type="submit">Send application</button>
              </form>
            </section>
          ) : null}

          {applications?.length ? (
            <section className="account-card">
              <div className="card-heading"><span>Applications</span><h2>Agent application history</h2></div>
              <div className="record-list">{applications.map((application) => {
                const brokerage = application.brokerages as unknown as { display_name?: string } | null;
                return <article key={application.id}><div><strong>{brokerage?.display_name ?? "Brokerage"}</strong><span>{application.submitted_at ? new Date(application.submitted_at).toLocaleDateString("en-JM") : "Not submitted"}</span></div><span className={`record-status status-${application.status}`}>{applicationLabels[application.status] ?? application.status}</span>{application.broker_reason ? <p>{application.broker_reason}</p> : null}</article>;
              })}</div>
            </section>
          ) : null}
          </> : <section className="account-card profile-photo-card">
            <div className="card-heading"><span>My photo</span><h2>How clients see you</h2></div>
            <p>Your photograph appears on your public agent website and brokerage team card.</p>
            {profileAsset ? <div className="site-asset-preview"><img src={`/media/sites/${profileAsset.id}/display.webp?v=${profileAsset.id}`} alt="Current professional profile" /></div> : <div className="site-asset-preview empty"><span>No photo uploaded yet</span></div>}
            {site ? <form action={uploadSiteAssetAction} className="stack-form site-asset-upload" data-prompt-title="Save this professional photo?" data-prompt-message="It will be compressed, stripped of metadata, and shown on your public professional website." data-prompt-confirm="Save photo">
              <input type="hidden" name="siteId" value={site.id} />
              <input type="hidden" name="placement" value="profile_photo" />
              <input type="hidden" name="returnTo" value="/account?section=photo" />
              <label className="site-file-picker"><span>Professional photo</span><input className="site-file-input" name="asset" type="file" accept="image/jpeg,image/png,image/webp" required /><span className="site-file-picker-row"><span className="site-file-picker-button">Choose file</span><span className="site-file-name">JPEG, PNG, or WebP under 5 MB</span></span></label>
              <button className="outline-dark-button image-upload-button" type="submit">Prepare and upload</button>
            </form> : <p className="form-error">An active agent website is required before you can add a professional photo.</p>}
          </section>}
        </div>

        <aside className="account-sidebar">
          <section>
            <span>Professional status</span>
            <strong>{context.membership ? "Active brokerage member" : "Registered user"}</strong>
            <p>{context.membership ? "Your brokerage controls your professional roles and listing authority." : "Browse properties freely or apply to the brokerage that referred you."}</p>
          </section>
          {context.membership ? <section><span>Brokerage</span><strong>{(context.membership.brokerages as unknown as { display_name?: string } | null)?.display_name ?? "Your brokerage"}</strong><p>Roles: {context.roles.join(", ").replaceAll("_", " ") || "member"}</p></section> : null}
        </aside>
      </div>
    </main>
  );
}
