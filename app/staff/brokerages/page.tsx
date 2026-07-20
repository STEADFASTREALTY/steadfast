import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StaffNav } from "@/app/components/staff-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export default async function StaffBrokeragesPage() {
  const context = await getActiveMembershipContext("/staff/brokerages");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.isOperations && !access.isAdmin) redirect("/access-denied?reason=platform-operations");
  const { data: brokerages } = await createAdminClient().from("brokerages").select("id,display_name,slug,status,created_at").order("display_name").limit(50);
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace isOperations={access.isOperations} isAdmin={access.isAdmin} />
    <section className="account-hero compact"><span className="eyebrow"><i /> ProperAP operations</span><h1>Brokerages</h1><p>Monitor organizations using the ProperAP platform.</p></section>
    <div className="account-settings-layout staff-layout"><StaffNav active="brokerages" /><div className="account-main"><section className="account-card"><div className="card-heading"><span>Brokerage directory</span><h2>Approved and pending organizations</h2></div><div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Brokerage</th><th>Website</th><th>Joined</th><th>Status</th></tr></thead><tbody>{brokerages?.map((brokerage) => <tr key={brokerage.id}><td><strong>{brokerage.display_name}</strong></td><td>{brokerage.slug ? <a href={`https://${brokerage.slug}.properap.com`} target="_blank" rel="noreferrer">/{brokerage.slug}</a> : "—"}</td><td>{new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(brokerage.created_at))}</td><td><span className={`record-status status-${brokerage.status}`}>{brokerage.status}</span></td></tr>)}</tbody></table></div></section></div></div>
  </main>;
}
