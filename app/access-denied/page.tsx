import type { Metadata } from "next";
import Link from "next/link";
import { AccountHeader } from "@/app/components/account-header";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Access unavailable", description: "The requested SteadFast workspace access is unavailable.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const messages: Record<string, { title: string; detail: string }> = {
  "brokerage-membership": { title: "A brokerage membership is required.", detail: "This area is available only while your brokerage membership is active." },
  "agent-management": { title: "Agent management is not part of your access.", detail: "Your broker can grant this responsibility when your role requires it." },
  "professional-workspace": { title: "Your professional workspace is not active.", detail: "Registered users can browse properties freely. Professional tools require an active brokerage or SteadFast role." },
};

export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const context = await getActiveMembershipContext();
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const reason = (await searchParams).reason ?? "";
  const message = messages[reason] ?? { title: "This area is not available to your account.", detail: "Access is based on your active role and responsibilities." };

  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canReviewListings={access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} /><section className="denied-card"><span>Access unavailable</span><h1>{message.title}</h1><p>{message.detail}</p><div><Link className="solid-button" href={access.hasWorkspace ? "/workspace" : "/account"}>{access.hasWorkspace ? "Return to your workspace" : "Return to your account"}</Link><Link className="outline-dark-button" href="/properties">Browse properties</Link></div></section></main>;
}
