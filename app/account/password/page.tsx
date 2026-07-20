import type { Metadata } from "next";
import { setPasswordAction } from "@/app/actions/auth";
import { AccountHeader } from "@/app/components/account-header";
import { AccountSectionNav } from "@/app/components/account-section-nav";
import { ConsumerAccountNav } from "@/app/components/consumer-account-nav";
import { PasswordChangeForm } from "@/app/components/password-change-form";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const context = await getActiveMembershipContext("/account/password");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} isConsumer={!context.membership} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Account protection</span><h1>Password</h1><p>Set a new password for your ProperAP account.</p></section>
    <div className="account-settings-layout account-password-layout">{!context.membership ? <ConsumerAccountNav active="password" /> : <AccountSectionNav active="password" />}<div className="account-main"><section className="account-card"><div className="card-heading"><span>Password</span><h2>Change your password</h2></div><p>Use at least 10 characters with uppercase, lowercase, and a number. Changing your password signs out your other devices.</p><PasswordChangeForm action={setPasswordAction} /></section></div></div>
  </main>;
}
