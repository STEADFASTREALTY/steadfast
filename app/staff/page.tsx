import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StaffNav } from "@/app/components/staff-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function StaffDashboardPage() {
  const context = await getActiveMembershipContext("/staff");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.isOperations && !access.isAdmin) redirect("/access-denied?reason=platform-operations");
  const admin = createAdminClient();
  const [requests, brokerages, activeListings, submittedVersions] = await Promise.all([
    admin.from("professional_registration_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "brokerage_approved", "properap_approved"]),
    admin.from("brokerages").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("listings").select("id", { count: "exact", head: true }).eq("lifecycle_state", "active"),
    admin.from("listing_versions").select("id", { count: "exact", head: true }).eq("revision_state", "submitted"),
  ]);

  const metrics = [
    ["Professional registrations", requests.count ?? 0, "Awaiting ProperAP review"],
    ["Active brokerages", brokerages.count ?? 0, "Approved organizations"],
    ["Active listings", activeListings.count ?? 0, "Visible listing inventory"],
    ["Listing submissions", submittedVersions.count ?? 0, "Awaiting brokerage decision"],
  ];
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace isOperations={access.isOperations} isAdmin={access.isAdmin} />
    <section className="account-hero compact"><span className="eyebrow"><i /> ProperAP operations</span><h1>Staff dashboard</h1><p>Customer, brokerage, and listing oversight in one place.</p></section>
    <div className="account-settings-layout staff-layout"><StaffNav active="dashboard" /><div className="account-main"><section className="staff-metric-grid">{metrics.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section><section className="account-card"><div className="card-heading"><span>Today’s work</span><h2>Operational queue</h2></div><p>Review professional registrations, check brokerage readiness, and monitor listings that need attention. This workspace does not change a brokerage’s listing decisions.</p></section></div></div>
  </main>;
}
