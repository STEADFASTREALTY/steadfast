import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { StatusMessage } from "@/app/components/status-message";
import { updateInquiryStatusAction } from "@/app/actions/inquiries";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = {
  title: "Property inquiries",
  description: "Review private visitor inquiries routed to authorized SteadFast property professionals.",
  robots: { index: false, follow: false, noarchive: true },
};
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string; notice?: string }> };

function formatInquiryTime(value: string) {
  return new Intl.DateTimeFormat("en-JM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

export default async function InquiryInboxPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const context = await getActiveMembershipContext("/workspace/inquiries");
  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
  });
  if (!access.canManageInquiries) redirect("/access-denied?reason=inquiry-workspace");

  const { data: inquiries } = await context.supabase
    .from("inquiries")
    .select("id,listing_id,listing_title,listing_location_label,requester_name,requester_email,requester_phone,contact_preference,message,status,first_viewed_at,closed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="account-page">
      <AccountHeader
        displayName={context.person.display_name}
        hasWorkspace={access.hasWorkspace}
        canManageAgents={access.canManageAgents}
        canManageListings={access.isAgent || access.canReviewListings}
        canReviewListings={access.canReviewListings}
        canManageInquiries={access.canManageInquiries}
        canShareListings={access.canShareListings}
      />
      <section className="account-hero compact">
        <span className="eyebrow"><i /> Private client service</span>
        <h1>Property inquiries.</h1>
        <p>{access.canReviewListings ? "Brokerage inquiries are shown according to your current permissions." : "Only inquiries assigned to you are shown here."}</p>
      </section>
      <section className="inquiry-shell">
        <StatusMessage error={query.error} notice={query.notice} />
        <div className="inquiry-toolbar">
          <div><span>Inbox</span><strong>{inquiries?.length ?? 0} recent request{inquiries?.length === 1 ? "" : "s"}</strong></div>
          <p>Contact details are private. Use them only to respond about the requested property.</p>
        </div>
        {inquiries?.length ? <div className="inquiry-list">
          {inquiries.map((inquiry) => <article key={inquiry.id}>
            <header>
              <div><span>{inquiry.status.replaceAll("_", " ")}</span><h2>{inquiry.listing_title}</h2><p>{inquiry.listing_location_label}</p></div>
              <small>{formatInquiryTime(inquiry.created_at)}</small>
            </header>
            <div className="inquiry-contact-grid">
              <div><span>Name</span><strong>{inquiry.requester_name}</strong></div>
              <div><span>Email</span><strong>{inquiry.requester_email}</strong></div>
              <div><span>Phone</span><strong>{inquiry.requester_phone ?? "Not provided"}</strong></div>
              <div><span>Reply preference</span><strong>{inquiry.contact_preference.replaceAll("_", " ")}</strong></div>
            </div>
            <div className="inquiry-message"><span>Visitor message</span><p>{inquiry.message}</p></div>
            <footer>
              <span>Reference: {inquiry.id.slice(0, 8).toUpperCase()}</span>
              <div>
                {inquiry.status === "new" ? <form action={updateInquiryStatusAction} data-prompt-title="Mark this inquiry in progress?" data-prompt-message="The brokerage record will show that this visitor inquiry is being handled." data-prompt-confirm="Start follow-up"><input type="hidden" name="inquiryId" value={inquiry.id} /><button className="outline-dark-button" name="operation" value="claim" type="submit">Start follow-up</button></form> : null}
                {inquiry.status !== "closed" ? <form action={updateInquiryStatusAction} data-prompt-title="Close this inquiry?" data-prompt-message="The inquiry will remain in the private history and can be reopened later." data-prompt-confirm="Close inquiry"><input type="hidden" name="inquiryId" value={inquiry.id} /><button className="solid-button" name="operation" value="close" type="submit">Close inquiry</button></form> : <form action={updateInquiryStatusAction} data-prompt-title="Reopen this inquiry?" data-prompt-message="The inquiry will return to the active follow-up queue." data-prompt-confirm="Reopen inquiry"><input type="hidden" name="inquiryId" value={inquiry.id} /><button className="outline-dark-button" name="operation" value="reopen" type="submit">Reopen inquiry</button></form>}
              </div>
            </footer>
          </article>)}
        </div> : <div className="listing-empty"><span>All clear</span><h2>No property inquiries yet.</h2><p>New visitor requests assigned to you or your authorized brokerage queue will appear here.</p></div>}
      </section>
    </main>
  );
}
