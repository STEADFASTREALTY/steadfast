import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { CreateListingForm } from "@/app/components/create-listing-form";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Create listing", description: "Create a private property listing draft for brokerage review.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  const context = await getActiveMembershipContext("/workspace/listings/new");
  const canCreate = (Boolean(context.membership) && (context.roles.includes("agent") || context.roles.includes("broker"))) || (context.independentAgent && !context.membership);
  if (!canCreate) redirect("/access-denied?reason=listing-creation");

  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles, isIndependentAgent: context.independentAgent });
  const { data: parishes } = await context.supabase.from("administrative_areas").select("id, name").eq("area_type", "parish").order("name");
  const brokerage = context.membership?.brokerages as unknown as { display_name?: string } | null;

  return <main className="account-page">
    <AccountHeader displayName={context.person.display_name} hasWorkspace canManageAgents={access.canManageAgents} canManageListings canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Private workspace</span><h1>Create a listing</h1><p>{context.independentAgent && !context.membership ? "Your independent listing stays private until you choose to publish it." : `${brokerage?.display_name ?? "Your brokerage"} owns and approves every listing.`}</p></section>
    <div className="listing-wizard-shell">
      <div className="wizard-topline"><Link href="/workspace/listings">← Back to listings</Link><span>Draft · not public</span></div>
      <CreateListingForm parishes={parishes ?? []} independentAgent={context.independentAgent && !context.membership} />
    </div>
  </main>;
}
