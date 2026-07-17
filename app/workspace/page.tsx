import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { getActiveMembershipContext, requireInternalMfa } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Workspace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await getActiveMembershipContext("/workspace");
  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership), roles: context.roles,
    permissions: context.permissions, platformRoles: context.platformRoles,
  });
  if (!access.hasWorkspace) redirect("/access-denied?reason=professional-workspace");
  await requireInternalMfa(context, "/workspace");

  const brokerage = context.membership?.brokerages as unknown as { display_name?: string } | null;
  return (
    <main className="account-page">
      <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} />
      <section className="account-hero compact">
        <span className="eyebrow"><i /> Your work</span>
        <h1>Workspace.</h1>
        <p>{brokerage?.display_name ?? (access.isAdmin ? "SteadFast administration" : "SteadFast operations")}</p>
      </section>
      <section className="workspace-grid">
        {access.isAgent ? <article className="workspace-card active"><span>Agent</span><h2>Listings</h2><p>Create private property drafts and see the brokerage records available to you.</p><Link className="solid-button" href="/workspace/listings">Open listings</Link></article> : null}
        {access.canReviewListings ? <article className="workspace-card"><span>Approvals</span><h2>Listing review</h2><p>Review agent submissions and major changes after listing tools are introduced.</p><span className="workspace-state">Coming next</span></article> : null}
        {access.canManageAgents ? <article className="workspace-card active"><span>Brokerage</span><h2>Agents and access</h2><p>Review applications, invite team members, manage capabilities, and process departures.</p><Link className="solid-button" href="/broker/agents">Open team management</Link></article> : null}
        {access.canManageBrokerage ? <article className="workspace-card"><span>Brokerage</span><h2>Company website</h2><p>Branding, offices, and the brokerage website will be added after listing management.</p><span className="workspace-state">Planned</span></article> : null}
        {access.isOperations ? <article className="workspace-card"><span>SteadFast</span><h2>Operations</h2><p>Customer service, billing support, delivery monitoring, and flags will appear here.</p><span className="workspace-state">Planned</span></article> : null}
        {access.isAdmin ? <article className="workspace-card"><span>SteadFast</span><h2>Administration</h2><p>Restricted platform configuration and internal access management will appear here.</p><span className="workspace-state">Planned</span></article> : null}
      </section>
    </main>
  );
}
