import type { Metadata } from "next";
import { signOutAction } from "@/app/actions/auth";
import { AccountHeader } from "@/app/components/account-header";
import { AccountSectionNav } from "@/app/components/account-section-nav";
import { MfaEnrollment } from "@/app/components/mfa-enrollment";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Account security", description: "Manage SteadFast account, device sessions, and multi-factor security.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  const context = await getActiveMembershipContext("/account/security");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const required = access.isAdmin || access.isOperations;

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canReviewListings={access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Account protection</span><h1>Security.</h1><p>Protect your account and control signed-in machines.</p></section>
    <div className="account-settings-layout account-security-settings-layout">
      <AccountSectionNav active="security" />
      <div className="account-main">
      <section className="account-card accent-card">
        <StatusMessage error={query.error} notice={query.notice} />
        <div className="card-heading"><span>{required ? "Required" : "Recommended"}</span><h2>Authenticator verification</h2></div>
        <p>{required ? "Your SteadFast internal role requires authenticator verification before restricted tools open." : "Add an authenticator to reduce the risk of someone accessing your professional account with a stolen password."}</p>
        <MfaEnrollment nextPath="/account/security" allowAdditional />
      </section>
      <section className="account-card">
        <div className="card-heading"><span>Device sessions</span><h2>Sign out other machines</h2></div>
        <p>Keep this machine signed in and revoke the account’s other browser and device sessions.</p>
        <form action={signOutAction} data-prompt-title="Sign out every other machine?" data-prompt-message="This browser will stay signed in. All other active SteadFast device sessions will be revoked." data-prompt-confirm="Sign out other machines" data-prompt-variant="danger">
          <input type="hidden" name="scope" value="others" />
          <button className="outline-dark-button" type="submit">Sign out other machines</button>
        </form>
      </section>
      </div>
      <aside className="security-note"><strong>Plan for device loss</strong><p>SteadFast does not display recovery codes. Enroll a second authenticator on another protected device, or contact a SteadFast administrator if every enrolled device is unavailable.</p></aside>
    </div>
  </main>;
}
