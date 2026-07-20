import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { changeMembershipStatusAction, decideAgentApplicationAction } from "@/app/actions/onboarding";
import { AccountHeader } from "@/app/components/account-header";
import { InvitationForm } from "@/app/components/invitation-form";
import { StaffCapabilityPanel } from "@/app/components/staff-capability-panel";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { getBrokeragePlanLimits } from "@/lib/billing/brokerage-plan-limits";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Team management", description: "Manage brokerage team members, access, and agent applications.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type TeamSection = "members" | "applications";
type Person = { auth_user_id?: string | null; first_name?: string; last_name?: string; display_name?: string; primary_email?: string } | null;
type Role = { role_key: string; ends_at: string | null };
type Permission = { permission_key: string; effect: string; ends_at: string | null };
const MEMBERS_PER_PAGE = 5;

function splitName(displayName?: string) {
  const parts = (displayName ?? "Team member").trim().split(/\s+/);
  return { firstName: parts[0] ?? "Team", lastName: parts.slice(1).join(" ") || "—" };
}

function activeRoleKeys(roles: Role[]) {
  return roles.filter((role) => !role.ends_at).map((role) => role.role_key);
}

function roleLabel(roles: string[]) {
  const isAgent = roles.includes("agent");
  const isBroker = roles.includes("broker");
  const isStaff = roles.includes("broker_staff");
  if (isAgent && isBroker) return "Agent + broker";
  if (isAgent && isStaff) return "Agent + staff";
  if (isBroker) return "Broker";
  if (isStaff) return "Staff";
  if (isAgent) return "Agent";
  return "Member";
}

function memberPageHref(page: number, delegate?: string) {
  const query = new URLSearchParams({ section: "members", page: String(page) });
  if (delegate) query.set("delegate", delegate);
  return `/broker/agents?${query.toString()}`;
}

function GlobeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z" /></svg>;
}

function PauseIcon({ reactivate = false }: { reactivate?: boolean }) {
  return reactivate
    ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 10 7-10 7Z" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>;
}

function RemoveIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}

export default async function BrokerAgentsPage({ searchParams }: { searchParams: Promise<{ delegate?: string; error?: string; notice?: string; page?: string; section?: string }> }) {
  const params = await searchParams;
  const section: TeamSection = params.section === "applications" ? "applications" : "members";
  const context = await getActiveMembershipContext(`/broker/agents?section=${section}`);
  if (!context.membership) redirect("/access-denied?reason=brokerage-membership");

  const access = deriveWorkspaceAccess({ hasMembership: true, roles: context.roles, permissions: context.permissions, platformRoles: context.platformRoles });
  const isBroker = context.roles.includes("broker");
  if (!access.canManageAgents) redirect("/access-denied?reason=agent-management");
  const canInvite = isBroker || context.permissions.some((permission) => permission.permission_key === "staff.manage_limited" && permission.effect === "allow");
  const admin = createAdminClient();
  const brokerageId = context.membership.brokerage_id;

  const [applicationsResult, membersResult, invitationsResult, subscriptionResult] = await Promise.all([
    admin.from("agent_applications").select("id, status, submitted_at, broker_reason, people!agent_applications_person_id_fkey(display_name, primary_email)").eq("brokerage_id", brokerageId).order("submitted_at", { ascending: false }),
    admin.from("brokerage_memberships").select("id, person_id, status, starts_at, people!brokerage_memberships_person_id_fkey(auth_user_id, first_name, last_name, display_name, primary_email), membership_roles(role_key, ends_at), membership_permissions(permission_key, effect, ends_at)").eq("brokerage_id", brokerageId).in("status", ["active", "suspended"]).order("starts_at"),
    canInvite ? admin.from("brokerage_invitations").select("id, email, status, expires_at, created_at, brokerage_invitation_roles(role_key)").eq("brokerage_id", brokerageId).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    admin.from("brokerage_subscription_records").select("plan_key,status,starts_at,ends_at").eq("brokerage_id", brokerageId).eq("status", "paid").lte("starts_at", new Date().toISOString()).gte("ends_at", new Date().toISOString()).order("ends_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (applicationsResult.error) throw new Error(`Agent applications could not be loaded: ${applicationsResult.error.message}`);
  if (membersResult.error) throw new Error(`Brokerage team members could not be loaded: ${membersResult.error.message}`);
  if ("error" in invitationsResult && invitationsResult.error) throw new Error(`Brokerage invitations could not be loaded: ${invitationsResult.error.message}`);
  if (subscriptionResult.error) throw new Error(`Brokerage plan could not be loaded: ${subscriptionResult.error.message}`);
  const applications = applicationsResult.data;
  const members = membersResult.data?.filter((member) => Boolean((member.people as unknown as Person)?.auth_user_id)) ?? [];
  const invitations = invitationsResult.data;
  const plan = getBrokeragePlanLimits(subscriptionResult.data?.plan_key);

  const agentCount = members.filter((member) => activeRoleKeys(member.membership_roles as unknown as Role[]).includes("agent")).length;
  const staffCount = members.filter((member) => activeRoleKeys(member.membership_roles as unknown as Role[]).includes("broker_staff")).length;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const memberPageCount = Math.max(1, Math.ceil(members.length / MEMBERS_PER_PAGE));
  const memberPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), memberPageCount) : 1;
  const pageMembers = members.slice((memberPage - 1) * MEMBERS_PER_PAGE, memberPage * MEMBERS_PER_PAGE);
  const delegateMember = isBroker
    ? members.find((member) => {
        if (member.id !== params.delegate) return false;
        const roles = activeRoleKeys(member.membership_roles as unknown as Role[]);
        return roles.includes("broker") || roles.includes("broker_staff");
      })
    : undefined;

  const personIds = (members ?? []).map((member) => member.person_id);
  const [{ data: sites }, { data: listings }] = await Promise.all([
    personIds.length ? admin.from("professional_sites").select("id,owner_person_id,slug,status").eq("site_type", "agent").in("owner_person_id", personIds) : Promise.resolve({ data: [] }),
    personIds.length ? admin.from("listings").select("id,created_by_person_id").eq("brokerage_id", brokerageId).in("created_by_person_id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const siteIds = (sites ?? []).map((site) => site.id);
  const { data: assets } = siteIds.length
    ? await admin.from("site_assets").select("id,site_id").eq("placement", "profile_photo").eq("status", "ready").in("site_id", siteIds)
    : { data: [] };
  const siteByPerson = new Map((sites ?? []).map((site) => [site.owner_person_id, site]));
  const assetBySite = new Map((assets ?? []).map((asset) => [asset.site_id, asset.id]));
  const listingCountByPerson = new Map<string, number>();
  for (const listing of listings ?? []) listingCountByPerson.set(listing.created_by_person_id, (listingCountByPerson.get(listing.created_by_person_id) ?? 0) + 1);
  const hasPendingApplications = applications?.some((application) => application.status === "submitted") ?? false;

  const brokerage = context.membership.brokerages as unknown as { display_name?: string } | null;
  return (
    <main className="account-page">
      <AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} canManageListings={access.isAgent || access.canReviewListings} canManageInquiries={access.canManageInquiries} canShareListings={access.canShareListings} />
      <section className="account-hero compact"><span className="eyebrow"><i /> Brokerage control</span><h1>Team</h1><p>{brokerage?.display_name ?? "Your brokerage"}</p></section>
      <div className="team-management-layout">
        <aside className="account-section-nav" aria-label="Team management sections">
          <span>Team</span>
          <Link className={section === "members" ? "active" : ""} href="/broker/agents?section=members">Team members</Link>
          <Link className={section === "applications" ? "active" : ""} href="/broker/agents?section=applications">
            <span>Applications</span>
            {hasPendingApplications ? <span aria-label="Applications awaiting review" className="nav-alert-badge" title="Applications awaiting review">!</span> : null}
          </Link>
        </aside>
        <div className="team-management-main">
          <StatusMessage error={params.error} notice={params.notice} />
          {section === "members" ? <>
            <section className="team-capacity-dashboard" aria-label={`${plan.label} team capacity`}>
              <div className="team-plan-summary"><span>Current plan</span><strong>{plan.label}</strong></div>
              <div className="team-capacity-stat"><span>Agents</span><strong>{agentCount}<small> / {plan.agentLimit ?? "Unlimited"}</small></strong></div>
              <div className="team-capacity-stat"><span>Staff</span><strong>{staffCount}<small> / {plan.staffLimit ?? "Unlimited"}</small></strong></div>
            </section>
            <section className="account-card team-table-card">
              <div className="card-heading"><span>Current team</span><h2>Team members</h2><p>Suspended members keep their ProperAP account but cannot use brokerage tools.</p></div>
              <div className="team-table-scroll">
                <table className="team-members-table">
                  <thead><tr><th>Photo</th><th>First</th><th>Last</th><th>Role</th><th>Joined</th><th>Listings</th><th>Webpage</th><th>Action</th></tr></thead>
                  <tbody>{pageMembers.map((member) => {
                    const person = member.people as unknown as Person;
                    const { firstName, lastName } = person?.first_name && person?.last_name
                      ? { firstName: person.first_name, lastName: person.last_name }
                      : splitName(person?.display_name);
                    const roles = member.membership_roles as unknown as Role[];
                    const activeRoles = activeRoleKeys(roles);
                    const isPrincipalBroker = activeRoles.includes("broker");
                    const canDelegate = isPrincipalBroker || activeRoles.includes("broker_staff");
                    const site = siteByPerson.get(member.person_id);
                    const photoId = site ? assetBySite.get(site.id) : null;
                    const canAct = !isPrincipalBroker && member.person_id !== context.person.id;
                    return <tr key={member.id} className={member.status === "suspended" ? "suspended" : ""}>
                      <td><div className="team-member-photo">{photoId ? <Image alt={`${person?.display_name ?? "Team member"} professional photo`} height={64} src={`/media/sites/${photoId}/display.webp`} unoptimized width={64} /> : <span aria-label="No professional photo">{firstName.slice(0, 1)}</span>}</div></td>
                      <td>{canDelegate && isBroker ? <Link className="team-member-name-link" href={`${memberPageHref(memberPage, member.id)}#delegated-access`}>{firstName}</Link> : <strong>{firstName}</strong>}{member.status === "suspended" ? <span className="team-member-state">Suspended</span> : null}</td>
                      <td>{canDelegate && isBroker ? <Link className="team-member-name-link" href={`${memberPageHref(memberPage, member.id)}#delegated-access`}>{lastName}</Link> : lastName}</td>
                      <td><span className="team-role-label">{roleLabel(activeRoles)}</span></td>
                      <td>{member.starts_at ? new Date(member.starts_at).toLocaleDateString("en-JM", { year: "numeric", month: "short", day: "numeric" }) : "—"}</td>
                      <td>{listingCountByPerson.get(member.person_id) ?? 0}</td>
                      <td>{site ? <a aria-label={`Open ${person?.display_name ?? "member"} webpage in a new tab`} className="team-icon-link" href={`https://${site.slug}.properap.com`} rel="noopener noreferrer" target="_blank" title="Open webpage"><GlobeIcon /></a> : <span className="team-no-site">—</span>}</td>
                      <td><div className="team-action-icons">
                        {canAct ? <form action={changeMembershipStatusAction} data-prompt-title={member.status === "suspended" ? "Restore this member’s access?" : "Suspend this member’s access?"} data-prompt-message={member.status === "suspended" ? "The member will regain their assigned brokerage features." : "The member will immediately become read-only and lose access to all brokerage tools."} data-prompt-confirm={member.status === "suspended" ? "Restore access" : "Suspend access"}>
                          <input name="membershipId" type="hidden" value={member.id} /><input name="operation" type="hidden" value={member.status === "suspended" ? "reactivate" : "suspend"} /><input name="reason" type="hidden" value={member.status === "suspended" ? "Access restored by brokerage team manager" : "Access suspended by brokerage team manager"} />
                          <button aria-label={member.status === "suspended" ? `Restore ${person?.display_name ?? "member"}` : `Suspend ${person?.display_name ?? "member"}`} className="team-icon-button suspend" title={member.status === "suspended" ? "Restore access" : "Suspend access"} type="submit"><PauseIcon reactivate={member.status === "suspended"} /></button>
                        </form> : null}
                        {canAct ? <form action={changeMembershipStatusAction} data-prompt-title="Remove this member from the brokerage?" data-prompt-message="Their brokerage access will end immediately. Represented listings will be removed from public display until reassigned. Their personal ProperAP account remains active." data-prompt-confirm="Remove member" data-prompt-variant="danger">
                          <input name="membershipId" type="hidden" value={member.id} /><input name="operation" type="hidden" value="remove" /><input name="reason" type="hidden" value="Removed by brokerage team manager" />
                          <button aria-label={`Remove ${person?.display_name ?? "member"}`} className="team-icon-button remove" title="Remove from team" type="submit"><RemoveIcon /></button>
                        </form> : null}
                        {!canAct ? <span className="team-protected-member">Protected</span> : null}
                      </div></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              {memberPageCount > 1 ? <nav className="listing-pagination team-member-pagination" aria-label="Team member pages">
                {memberPage > 1 ? <Link href={memberPageHref(memberPage - 1, params.delegate)}>Previous</Link> : <span>Previous</span>}
                <strong>Page {memberPage} of {memberPageCount}</strong>
                {memberPage < memberPageCount ? <Link href={memberPageHref(memberPage + 1, params.delegate)}>Next</Link> : <span>Next</span>}
              </nav> : null}
            </section>
            {isBroker ? <section className="account-card" id="delegated-access">
              <div className="card-heading"><span>Delegated access</span><h2>{delegateMember ? (delegateMember.people as unknown as Person)?.display_name ?? "Team member" : "Staff capabilities"}</h2></div>
              {!delegateMember ? <div className="delegate-access-empty"><strong>No team member selected</strong><p>Select the first or last name of a broker or staff member in the table to view their access.</p></div> : (() => {
                const roles = activeRoleKeys(delegateMember.membership_roles as unknown as Role[]);
                if (roles.includes("broker")) return <div className="delegate-access-empty broker-access"><strong>Full broker access</strong><p>The principal broker has protected access to all brokerage controls. These permissions are not delegated individually.</p></div>;
                const permissions = delegateMember.membership_permissions as unknown as Permission[];
                const person = delegateMember.people as unknown as Person;
                const activePermissionKeys = permissions.filter((permission) => !permission.ends_at && permission.effect === "allow").map((permission) => permission.permission_key);
                const returnTo = memberPageHref(memberPage, delegateMember.id);
                return <div className="team-capability-list"><StaffCapabilityPanel membershipId={delegateMember.id} activePermissionKeys={activePermissionKeys} returnTo={returnTo} staffName={person?.display_name ?? "Staff member"} /></div>;
              })()}
            </section> : null}
          </> : <>
            <section className="account-card">
              <div className="card-heading"><span>Approval queue</span><h2>Agent applications</h2></div>
              <div className="record-list">{applications?.length ? applications.map((application) => {
                const person = application.people as unknown as Person;
                return <article key={application.id}><div><strong>{person?.display_name ?? "Applicant"}</strong><span>{person?.primary_email ?? "Email unavailable"}</span><span>Applied {new Date(application.submitted_at).toLocaleDateString("en-JM")}</span></div><span className={`record-status status-${application.status}`}>{application.status.replaceAll("_", " ")}</span>{application.status === "submitted" ? <form action={decideAgentApplicationAction} className="decision-form"><input type="hidden" name="applicationId" value={application.id} /><label><span>Decision note</span><input name="reason" maxLength={2000} placeholder="Required when declining" /></label><button name="decision" value="approve" className="solid-button" type="submit" data-prompt-title="Approve this agent application?" data-prompt-message="The applicant will join this brokerage as an agent." data-prompt-confirm="Approve application">Approve</button><button name="decision" value="deny" className="outline-dark-button" type="submit" data-prompt-title="Decline this agent application?" data-prompt-message="The applicant will not join this brokerage. The decision and your reason will be retained." data-prompt-confirm="Decline application" data-prompt-variant="danger">Decline</button></form> : null}</article>;
              }) : <p className="muted-copy">No agent applications have been received.</p>}</div>
            </section>
            {canInvite ? <section className="account-card"><div className="card-heading"><span>Invite</span><h2>Add a person</h2></div><InvitationForm brokerageId={brokerageId} /></section> : null}
            {canInvite && invitations?.length ? <section className="account-card"><div className="card-heading"><span>Recent</span><h2>Invitations</h2></div><div className="mini-list">{invitations.map((invitation) => <div key={invitation.id}><strong>{invitation.email}</strong><span>{invitation.status} · expires {new Date(invitation.expires_at).toLocaleDateString("en-JM")}</span></div>)}</div></section> : null}
          </>}
        </div>
      </div>
    </main>
  );
}
