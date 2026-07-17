import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { decideAgentApplicationAction } from "@/app/actions/onboarding";
import { AccountHeader } from "@/app/components/account-header";
import { InvitationForm } from "@/app/components/invitation-form";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Agent management", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BrokerAgentsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const params = await searchParams;
  const context = await getActiveMembershipContext();
  if (!context.membership) redirect("/account?error=An+active+brokerage+membership+is+required.");

  const isBroker = context.roles.includes("broker");
  const canManageAgents = isBroker || context.permissions.some((permission) => permission.permission_key === "agent.manage" && permission.effect === "allow");
  if (!canManageAgents) redirect("/account?error=You+do+not+have+agent+management+permission.");
  const canInvite = isBroker || context.permissions.some((permission) => permission.permission_key === "staff.manage_limited" && permission.effect === "allow");

  const [{ data: applications }, { data: members }, { data: invitations }] = await Promise.all([
    context.supabase.from("agent_applications").select("id, status, submitted_at, broker_reason, people(display_name, primary_email)").eq("brokerage_id", context.membership.brokerage_id).order("submitted_at"),
    context.supabase.from("brokerage_memberships").select("id, status, starts_at, people(display_name, primary_email), membership_roles(role_key, ends_at)").eq("brokerage_id", context.membership.brokerage_id).eq("status", "active").order("starts_at"),
    canInvite ? context.supabase.from("brokerage_invitations").select("id, email, status, expires_at, created_at, brokerage_invitation_roles(role_key)").eq("brokerage_id", context.membership.brokerage_id).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
  ]);

  const brokerage = context.membership.brokerages as unknown as { display_name?: string } | null;
  return (
    <main className="account-page">
      <AccountHeader displayName={context.person.display_name} />
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
          <section className="account-card"><div className="card-heading"><span>Current team</span><h2>Active members</h2></div><div className="record-list">{members?.map((member) => { const person = member.people as unknown as { display_name?: string; primary_email?: string } | null; const roles = member.membership_roles as unknown as { role_key: string; ends_at: string | null }[]; return <article key={member.id}><div><strong>{person?.display_name ?? "Member"}</strong><span>{person?.primary_email ?? ""}</span></div><span className="record-status">{roles.filter((role) => !role.ends_at).map((role) => role.role_key.replaceAll("_", " ")).join(", ")}</span></article>; })}</div></section>
        </div>
        <aside className="management-aside">
          {canInvite ? <section className="account-card"><div className="card-heading"><span>Invite</span><h2>Add a person</h2></div><InvitationForm brokerageId={context.membership.brokerage_id} /></section> : null}
          {canInvite && invitations?.length ? <section className="account-card"><div className="card-heading"><span>Recent</span><h2>Invitations</h2></div><div className="mini-list">{invitations.map((invitation) => <div key={invitation.id}><strong>{invitation.email}</strong><span>{invitation.status} · expires {new Date(invitation.expires_at).toLocaleDateString("en-JM")}</span></div>)}</div></section> : null}
        </aside>
      </div>
    </main>
  );
}
