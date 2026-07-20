import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StaffNav } from "@/app/components/staff-nav";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const date = (value: string) => new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(value));

export default async function StaffRegistrationsPage() {
  const context = await getActiveMembershipContext("/staff/registrations");
  const access = deriveWorkspaceAccess({ hasMembership: Boolean(context.membership), roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  if (!access.isOperations && !access.isAdmin) redirect("/access-denied?reason=platform-operations");
  const { data: requests } = await createAdminClient().from("professional_registration_requests").select("id,request_type,status,origin,contact_phone,created_at,people(first_name,last_name,primary_email),brokerages(display_name)").order("created_at", { ascending: false }).limit(25);
  return <main className="account-page"><AccountHeader displayName={context.person.display_name} hasWorkspace isOperations={access.isOperations} isAdmin={access.isAdmin} />
    <section className="account-hero compact"><span className="eyebrow"><i /> ProperAP operations</span><h1>Professional registrations</h1><p>Review account upgrade and new professional registration requests.</p></section>
    <div className="account-settings-layout staff-layout"><StaffNav active="registrations" /><div className="account-main"><section className="account-card"><div className="card-heading"><span>Review queue</span><h2>Agent and broker requests</h2></div><div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Name</th><th>Requested role</th><th>Brokerage</th><th>Contact</th><th>Submitted</th><th>Status</th></tr></thead><tbody>{requests?.map((request) => { const person = request.people as unknown as { first_name: string; last_name: string; primary_email: string | null } | null; const brokerage = request.brokerages as unknown as { display_name: string } | null; return <tr key={request.id}><td><strong>{person ? `${person.first_name} ${person.last_name}` : "Account unavailable"}</strong><small>{person?.primary_email ?? "—"}</small></td><td>{request.request_type === "agent" ? "Agent" : "Broker"}<small>{request.origin === "upgrade" ? "Account upgrade" : "New registration"}</small></td><td>{brokerage?.display_name ?? "New brokerage"}</td><td>{request.contact_phone}</td><td>{date(request.created_at)}</td><td><span className={`record-status status-${request.status}`}>{request.status.replaceAll("_", " ")}</span></td></tr>; })}</tbody></table></div></section></div></div>
  </main>;
}
