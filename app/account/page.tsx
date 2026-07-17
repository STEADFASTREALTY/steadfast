import type { Metadata } from "next";
import Link from "next/link";
import { AccountHeader } from "@/app/components/account-header";
import { StatusMessage } from "@/app/components/status-message";
import {
  submitAgentApplicationAction,
  updateProfileAction,
} from "@/app/actions/onboarding";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const applicationLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Waiting for broker review",
  broker_approved: "Broker approved",
  broker_denied: "Not approved",
  activated: "Active agent",
  withdrawn: "Withdrawn",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const context = await getActiveMembershipContext();
  const [{ data: brokerages }, { data: applications }] = await Promise.all([
    context.supabase
      .from("brokerages")
      .select("id, display_name, slug")
      .eq("status", "active")
      .order("display_name"),
    context.supabase
      .from("agent_applications")
      .select("id, status, submitted_at, broker_reason, brokerages(display_name, slug)")
      .order("created_at", { ascending: false }),
  ]);

  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
  });
  const openApplication = applications?.some((application) =>
    ["draft", "submitted", "broker_approved"].includes(application.status),
  );

  return (
    <main className="account-page">
      <AccountHeader displayName={context.person.display_name} hasWorkspace={access.hasWorkspace} canManageAgents={access.canManageAgents} />
      <section className="account-hero">
        <span className="eyebrow"><i /> Your SteadFast account</span>
        <h1>Hello, {context.person.display_name}.</h1>
        <p>Keep your profile current and manage how you participate in the professional network.</p>
      </section>
      <div className="account-layout">
        <div className="account-main">
          <StatusMessage error={params.error} notice={params.notice} />
          <section className="account-card">
            <div className="card-heading"><span>Profile</span><h2>Your details</h2></div>
            <form action={updateProfileAction} className="stack-form two-column">
              <label className="full"><span>Display name</span><input name="displayName" defaultValue={context.person.display_name} minLength={2} maxLength={120} required /></label>
              <label className="full"><span>Email</span><input value={context.person.primary_email ?? context.user.email ?? ""} readOnly /></label>
              <label className="full"><span>Phone</span><input name="phone" defaultValue={context.person.primary_phone ?? ""} autoComplete="tel" maxLength={30} /></label>
              <input type="hidden" name="locale" value="en-JM" />
              <input type="hidden" name="timezone" value="America/Jamaica" />
              <button className="solid-button full" type="submit">Save profile</button>
            </form>
          </section>

          {!context.membership && !openApplication ? (
            <section className="account-card accent-card">
              <div className="card-heading"><span>For professionals</span><h2>Apply to join a brokerage</h2></div>
              <p>Independent agent registration is not available. Choose the brokerage that referred you; its broker will review your application.</p>
              <form action={submitAgentApplicationAction} className="stack-form">
                <label><span>Brokerage</span><select name="brokerageId" required defaultValue=""><option value="" disabled>Select your brokerage</option>{brokerages?.map((brokerage) => <option key={brokerage.id} value={brokerage.id}>{brokerage.display_name}</option>)}</select></label>
                <button className="solid-button" type="submit">Send application</button>
              </form>
            </section>
          ) : null}

          {applications?.length ? (
            <section className="account-card">
              <div className="card-heading"><span>Applications</span><h2>Agent application history</h2></div>
              <div className="record-list">{applications.map((application) => {
                const brokerage = application.brokerages as unknown as { display_name?: string } | null;
                return <article key={application.id}><div><strong>{brokerage?.display_name ?? "Brokerage"}</strong><span>{application.submitted_at ? new Date(application.submitted_at).toLocaleDateString("en-JM") : "Not submitted"}</span></div><span className={`record-status status-${application.status}`}>{applicationLabels[application.status] ?? application.status}</span>{application.broker_reason ? <p>{application.broker_reason}</p> : null}</article>;
              })}</div>
            </section>
          ) : null}
        </div>

        <aside className="account-sidebar">
          <section>
            <span>Professional status</span>
            <strong>{context.membership ? "Active brokerage member" : "Registered user"}</strong>
            <p>{context.membership ? "Your brokerage controls your professional roles and listing authority." : "Browse properties freely or apply to the brokerage that referred you."}</p>
          </section>
          {context.membership ? <section><span>Brokerage</span><strong>{(context.membership.brokerages as unknown as { display_name?: string } | null)?.display_name ?? "Your brokerage"}</strong><p>Roles: {context.roles.join(", ").replaceAll("_", " ") || "member"}</p></section> : null}
          {access.hasWorkspace ? <Link className="solid-button" href="/workspace">Open your workspace</Link> : null}
        </aside>
      </div>
    </main>
  );
}
