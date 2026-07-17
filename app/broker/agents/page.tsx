import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { decideAgentApplicationAction, departAgentAction } from "@/app/actions/onboarding";
import { AccountHeader } from "@/app/components/account-header";
import { InvitationForm } from "@/app/components/invitation-form";
import { StaffCapabilityPanel } from "@/app/components/staff-capability-panel";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "Agent management", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BrokerAgentsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const params = await searchParams;
  const context = await getActiveMembershipContext();
  if (!context.membership) redirect("/access-denied?reason=brokerage-membership");

  const access = deriveWorkspaceAccess({ hasMembership: true, roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const isBroker = context.roles.includes("broker");
  const canManageAgents = access.canManageAgents;
  if (!canManageAgents) redirect("/access-denied?reason=agent-management");
  const canInvite = isBroker || context.permissions.some((permission) => permission.permission_key === "staff.manage_limited" && permission.effect === "allow");

  const [{ data: applications }, { data: members }, { data: invitations }] = await Promise.all([
    context.supabase.from("agent_applications").select("id, status, submitted_at, broker_reason, people(display_name, primary_email)").eq("brokerage_id", context.membership.brokerage_id).order("submitted_at"),
    context.supabase.from("brokerage_memberships").select("id, person_id, status, starts_at, people(display_name, primary_email), membership_roles(role_key, ends_at), membership_permissions(permission_key, effect, ends_at)").eq("brokerage_id", context.membership.brokerage_id).eq("status", "active").order("starts_at"),
    canInvite ? context.supabase.from("brokerage_invitations").select("id, email, status, expires_at, created_at, brokerage_invitation_roles(role_key)").eq("brokerage_id", context.membership.brokerage_id).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
  ]);

  const brokerage = context.membership.brokerages as unknown as { display_name?: string } | null;
  return (
    <main className="account-page">
      <AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} />
      <section className="account-hero compact"><span className="eyebrow"><i /> Brokerage control</span><h1>Agents and access.</h1><p>{brokerage?.display_name ?? "Your brokerage"}</p></section>
      <div className="management-layout">
        <div>
          <StatusMessage error={params.error} notice={params.notice} />
          <section className="account-card">
            <div className="card-heading"><span>Approval queue</span><h2>Agent applications</h2></div>
            <div className="record-list">{applications?.length ? applications.map((application) => {
              const person = application.people as unknown as { display_name?: string; primary_email?: string } | null;
              return <article key={application.id}><div><strong>{person?.display_name ?? "Applicant"}</strong><span>{person?.primary_email ?? "Email unavailable"}</span></div><span className={`record-status status-${application.status}`}>{application.status.replaceAll("_", " ")}</span>{application.status === "submitted" ? <form action={decideAgentApplicationAction} className="decision-form"><input type="hidden" name="applicationId" value={application.id} /><label><span>Decision note</span><input name="reason" maxLength={2000} placeholder="Required when declining" /></label><button name="decision" value="approve" className="solid-button" type="submit">Approve</button><button name="decision" value="deny" className="outline-dark-button" type="submit">Decline</button></form> : null}</article>;
            }) : <p className="muted-copy">No applications are waiting for review.</p>}</div>
          </section>
          <section className="account-card">
            <div className="card-heading"><span>Current team</span><h2>Active members</h2></div>
            <div className="record-list">{members?.map((member) => {
              const person = member.people as unknown as { display_name?: string; primary_email?: string } | null;
              const roles = member.membership_roles as unknown as { role_key: string; ends_at: string | null }[];
              const permissions = member.membership_permissions as unknown as { permission_key: string; effect: string; ends_at: string | null }[];
              const activeRoles = roles.filter((role) => !role.ends_at).map((role) => role.role_key);
              const isStaff = activeRoles.includes("broker_staff");
              const isPrincipalBroker = activeRoles.includes("broker");
              const isAgent = activeRoles.includes("agent");
              const activePermissionKeys = permissions
                .filter((permission) => !permission.ends_at && permission.effect === "allow")
                .map((permission) => permission.permission_key);

              return (
                <article key={member.id}>
                  <div><strong>{person?.display_name ?? "Member"}</strong><span>{person?.primary_email ?? ""}</span></div>
                  <span className="record-status">{activeRoles.map((role) => role.replaceAll("_", " ")).join(", ")}</span>
                  {isBroker && isStaff && !isPrincipalBroker ? (
                    <StaffCapabilityPanel membershipId={member.id} activePermissionKeys={activePermissionKeys} />
                  ) : null}
                  {canManageAgents && isAgent && !isPrincipalBroker && member.person_id !== context.person.id ? (
                    <details className="departure-panel">
                      <summary>End brokerage access</summary>
                      <form action={departAgentAction} className="departure-form">
                        <input name="membershipId" type="hidden" value={member.id} />
                        <p><strong>Represented listings: 0</strong><br />Listing tools are not active yet. The person’s SteadFast login and personal account will remain active.</p>
                        <label><span>Reason</span><input name="reason" minLength={3} maxLength={1000} required placeholder="Why is this agent leaving the brokerage?" /></label>
                        <label className="check-row"><input name="confirmation" type="checkbox" required /> I confirm this agent’s brokerage access should end now.</label>
                        <button className="danger-button" type="submit">End brokerage access</button>
                      </form>
                    </details>
                  ) : null}
                </article>
              );
            })}</div>
          </section>
        </div>
        <aside className="management-aside">
          {canInvite ? <section className="account-card"><div className="card-heading"><span>Invite</span><h2>Add a person</h2></div><InvitationForm brokerageId={context.membership.brokerage_id} /></section> : null}
          {canInvite && invitations?.length ? <section className="account-card"><div className="card-heading"><span>Recent</span><h2>Invitations</h2></div><div className="mini-list">{invitations.map((invitation) => <div key={invitation.id}><strong>{invitation.email}</strong><span>{invitation.status} · expires {new Date(invitation.expires_at).toLocaleDateString("en-JM")}</span></div>)}</div></section> : null}
        </aside>
      </div>
    </main>
  );
}
