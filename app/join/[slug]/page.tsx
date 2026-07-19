import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { submitAgentApplicationAction } from "@/app/actions/onboarding";
import { AccountHeader } from "@/app/components/account-header";
import { StatusMessage } from "@/app/components/status-message";
import { getProfessionalSite } from "@/app/components/public-professional-site";
import { getActiveMembershipContext, requireAccount } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join a brokerage", description: "Apply to join a ProperAP brokerage as an agent.", robots: { index: false, follow: false } };

export default async function JoinBrokeragePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { slug } = await params;
  const site = await getProfessionalSite(slug, "brokerage");
  if (!site?.owner_brokerage_id) notFound();
  const returnTo = `/join/${site.slug}`;
  const account = await requireAccount(returnTo);
  const context = await getActiveMembershipContext(returnTo);
  const messages = await searchParams;

  return <main className="account-page">
    <AccountHeader displayName={account.person.display_name} hasWorkspace={Boolean(context.membership)} canManageAgents={false} canManageListings={false} canReviewListings={false} canManageInquiries={false} canShareListings={false} />
    <section className="account-hero compact"><span className="eyebrow"><i /> Agent application</span><h1>Join {site.display_name}.</h1><p>Send your application directly to this brokerage. Its broker must approve you before professional access can be activated.</p></section>
    <section className="join-brokerage-shell"><StatusMessage error={messages.error} notice={messages.notice} />
      {context.membership ? <section className="account-card"><div className="card-heading"><span>Current membership</span><h2>You already belong to a brokerage.</h2></div><p>Agents can belong to one brokerage at a time. Your current brokerage must end your membership before you apply elsewhere.</p><Link className="outline-dark-button" href="/account">Return to account</Link></section> : <section className="account-card join-brokerage-card"><div className="card-heading"><span>Simple application</span><h2>Apply as an agent</h2></div><p>Your signed-in account will be submitted to {site.display_name} for review.</p><form action={submitAgentApplicationAction} className="stack-form" data-prompt-title={`Apply to join ${site.display_name}?`} data-prompt-message="Your application will be sent to this brokerage for approval. You will not receive professional access until the broker approves it." data-prompt-confirm="Send application"><input type="hidden" name="brokerageId" value={site.owner_brokerage_id} /><input type="hidden" name="returnTo" value={returnTo} /><label><span>Applicant</span><input value={account.person.display_name} readOnly aria-readonly="true" /></label><label><span>Email</span><input value={account.person.primary_email ?? ""} readOnly aria-readonly="true" /></label><button className="solid-button" type="submit">Send application</button></form></section>}
    </section>
  </main>;
}
