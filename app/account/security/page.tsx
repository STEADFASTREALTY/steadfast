import type { Metadata } from "next";
import { AccountHeader } from "@/app/components/account-header";
import { MfaEnrollment } from "@/app/components/mfa-enrollment";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Account security", description: "Manage SteadFast account and multi-factor security.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const context = await getActiveMembershipContext("/account/security");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const required = access.isAdmin || access.isOperations;
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} /><section className="account-hero compact"><span className="eyebrow"><i /> Account protection</span><h1>Security.</h1><p>Protect your SteadFast account with an authenticator app.</p></section><div className="security-layout"><section className="account-card accent-card"><div className="card-heading"><span>{required ? "Required" : "Recommended"}</span><h2>Authenticator verification</h2></div><p>{required ? "Your SteadFast internal role requires authenticator verification before restricted tools open." : "Add an authenticator to reduce the risk of someone accessing your professional account with a stolen password."}</p><MfaEnrollment nextPath="/account/security" allowAdditional /></section><aside className="security-note"><strong>Plan for device loss</strong><p>SteadFast does not display recovery codes. Enroll a second authenticator on another protected device, or contact a SteadFast administrator if every enrolled device is unavailable.</p></aside></div></main>;
}
