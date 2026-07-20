import type { Metadata } from "next";
import { AccountHeader } from "@/app/components/account-header";
import { AccountSectionNav } from "@/app/components/account-section-nav";
import { ConsumerAccountNav } from "@/app/components/consumer-account-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaymentPage() {
  const context = await getActiveMembershipContext("/account/payment");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} isConsumer={!context.membership} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Billing</span><h1>Payment</h1><p>Manage how professional subscriptions will be paid.</p></section>
    <div className="account-settings-layout account-payment-layout">{!context.membership ? <ConsumerAccountNav active="payment" /> : <AccountSectionNav active="payment" />}<div className="account-main"><section className="account-card payment-placeholder"><div className="card-heading"><span>Coming next</span><h2>Payment setup</h2></div><p>Stripe and PayPal payment options will be connected here in a later release. Your current subscription information remains available on the Subscription page.</p><span>Payment processing is not enabled in this prototype.</span></section></div></div>
  </main>;
}
