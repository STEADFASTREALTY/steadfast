import type { Metadata } from "next";
import { AccountHeader } from "@/app/components/account-header";
import { AccountSectionNav } from "@/app/components/account-section-nav";
import { ConsumerAccountNav } from "@/app/components/consumer-account-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { getBrokeragePlanLimits } from "@/lib/billing/brokerage-plan-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProfessionalUpgradeForm } from "@/app/components/professional-upgrade-form";
import { StatusMessage } from "@/app/components/status-message";

export const metadata: Metadata = { title: "Subscription", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(value)) : "No expiry";
const planName = (key: string) => ({ consumer_free: "Consumer Free", agent: "Professional Agent", staff: "Professional Staff", broker: "Broker", brokerage_20: "Broker Core", brokerage_growth: "Broker Growth" }[key] ?? key);

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  const context = await getActiveMembershipContext("/account/subscription");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const admin = createAdminClient();
  const isBroker = context.roles.includes("broker");
  const [personalResult, brokerageResult, membersResult, registrationResult, brokeragesResult] = await Promise.all([
    admin.from("person_subscription_records").select("plan_key,status,billing_period,starts_at,ends_at").eq("person_id", context.person.id).in("status", ["paid", "free", "pending"]).order("ends_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    context.membership ? admin.from("brokerage_subscription_records").select("plan_key,status,billing_period,starts_at,ends_at").eq("brokerage_id", context.membership.brokerage_id).in("status", ["paid", "pending"]).order("ends_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    isBroker && context.membership ? admin.from("brokerage_memberships").select("id,membership_roles(role_key,ends_at)").eq("brokerage_id", context.membership.brokerage_id).eq("status", "active") : Promise.resolve({ data: [] }),
    admin.from("professional_registration_requests").select("request_type,status,origin,created_at").eq("person_id", context.person.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    !context.membership ? admin.from("brokerages").select("id,display_name").eq("status", "active").order("display_name") : Promise.resolve({ data: [] }),
  ]);
  const subscription = isBroker && brokerageResult.data ? brokerageResult.data : personalResult.data;
  const plan = isBroker ? getBrokeragePlanLimits(brokerageResult.data?.plan_key) : null;
  const members = membersResult.data ?? [];
  const agentCount = members.filter((member) => (member.membership_roles as Array<{ role_key: string; ends_at: string | null }>).some((role) => role.role_key === "agent" && !role.ends_at)).length;
  const staffCount = members.filter((member) => (member.membership_roles as Array<{ role_key: string; ends_at: string | null }>).some((role) => role.role_key === "broker_staff" && !role.ends_at)).length;
  const registration = registrationResult.data;
  const isPlatformAccount = access.isOperations || access.isAdmin;
  const isRegisteredUser = !context.membership && !registration && !isPlatformAccount;
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} isConsumer={!context.membership && !isPlatformAccount} isOperations={access.isOperations} isAdmin={access.isAdmin} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Account plan</span><h1>Subscription</h1><p>Review your active plan and renewal information.</p></section>
    <div className="account-settings-layout account-subscription-layout">{!context.membership && !isPlatformAccount ? <ConsumerAccountNav active="subscription" /> : <AccountSectionNav active="subscription" />}<div className="account-main"><StatusMessage error={query.error} notice={query.notice} /><section className="account-card subscription-card"><div className="card-heading"><span>Current plan</span><h2>{isPlatformAccount ? access.isAdmin ? "ProperAP Administrator" : "ProperAP Operations Staff" : isRegisteredUser ? "Registered User" : subscription ? planName(subscription.plan_key) : "Professional registration"}</h2></div><dl><div><dt>Subscription date</dt><dd>{isPlatformAccount || isRegisteredUser ? formatDate(context.person.created_at) : formatDate(subscription?.starts_at ?? registration?.created_at ?? null)}</dd></div><div><dt>End date</dt><dd>{isPlatformAccount || isRegisteredUser ? "Not applicable" : formatDate(subscription?.ends_at ?? null)}</dd></div><div><dt>Plan type</dt><dd>{isPlatformAccount ? "Internal platform role" : isRegisteredUser ? "Registered User · Free" : subscription ? `${subscription.billing_period === "none" ? "Free access" : subscription.billing_period} · ${subscription.status}` : `${registration?.request_type === "agent" ? "Agent" : "Broker"} · ${registration?.status.replaceAll("_", " ")}`}</dd></div></dl></section>{isRegisteredUser ? <section className="account-card"><div className="card-heading"><span>Professional access</span><h2>Upgrade to Agent or Broker</h2></div><p>Send your request to ProperAP for review. Your Registered User account remains free while we review it.</p><ProfessionalUpgradeForm brokerages={brokeragesResult.data ?? []} /></section> : null}{!context.membership && registration && !isRegisteredUser && !isPlatformAccount ? <section className="account-card"><div className="card-heading"><span>Review status</span><h2>Your professional request is being reviewed</h2></div><p>ProperAP will notify you when your {registration.request_type} access is approved and activated.</p></section> : null}{isBroker && plan ? <section className="account-card subscription-capacity"><div className="card-heading"><span>Brokerage capacity</span><h2>Available team slots</h2></div><div><article><span>Agents</span><strong>{plan.agentLimit === null ? "Unlimited" : Math.max(plan.agentLimit - agentCount, 0)}</strong><small>{agentCount} of {plan.agentLimit ?? "Unlimited"} currently used</small></article><article><span>Staff</span><strong>{plan.staffLimit === null ? "Unlimited" : Math.max(plan.staffLimit - staffCount, 0)}</strong><small>{staffCount} of {plan.staffLimit ?? "Unlimited"} currently used</small></article></div></section> : null}</div></div>
  </main>;
}
