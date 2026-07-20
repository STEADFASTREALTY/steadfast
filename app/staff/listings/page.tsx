import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StaffNav } from "@/app/components/staff-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export default async function StaffListingsPage() {
  const context = await getActiveMembershipContext("/staff/listings");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.isOperations && !access.isAdmin) redirect("/access-denied?reason=platform-operations");
  const { data: listings } = await createAdminClient().from("public_listing_snapshots").select("listing_id,title,lifecycle_state,price,currency,brokerage_name,published_at").order("published_at", { ascending: false }).limit(50);
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace isOperations={access.isOperations} isAdmin={access.isAdmin} />
    <section className="account-hero compact"><span className="eyebrow"><i /> ProperAP operations</span><h1>Listing monitor</h1><p>See active platform inventory. Brokerage teams retain all listing approval decisions.</p></section>
    <div className="account-settings-layout staff-layout"><StaffNav active="listings" /><div className="account-main"><section className="account-card"><div className="card-heading"><span>Platform inventory</span><h2>Published listings</h2></div><div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Listing</th><th>Brokerage</th><th>Asking price</th><th>Status</th><th>Published</th></tr></thead><tbody>{listings?.map((listing) => <tr key={listing.listing_id}><td><strong>{listing.title}</strong></td><td>{listing.brokerage_name ?? "—"}</td><td>{listing.currency} {new Intl.NumberFormat("en-JM").format(Number(listing.price))}</td><td><span className={`record-status status-${listing.lifecycle_state}`}>{listing.lifecycle_state.replaceAll("_", " ")}</span></td><td>{listing.published_at ? new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(listing.published_at)) : "—"}</td></tr>)}</tbody></table></div></section></div></div>
  </main>;
}
