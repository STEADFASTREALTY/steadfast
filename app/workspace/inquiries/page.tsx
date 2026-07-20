import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/app/components/account-header";
import { InquiryInbox, type AgentInquiry } from "@/app/components/inquiry-inbox";
import { StatusMessage } from "@/app/components/status-message";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = {
  title: "Property inquiries",
  description: "Review private visitor inquiries routed to authorized SteadFast property professionals.",
  robots: { index: false, follow: false, noarchive: true },
};
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string; notice?: string }> };

export default async function InquiryInboxPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const context = await getActiveMembershipContext("/workspace/inquiries");
  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
  });
  if (!context.roles.includes("agent")) redirect("/access-denied?reason=inquiry-workspace");

  const { data: inquiries } = await context.supabase
    .from("inquiries")
    .select("id,listing_id,listing_title,listing_location_label,requester_name,requester_email,requester_phone,contact_preference,message,status,first_viewed_at,closed_at,created_at")
    .eq("selected_agent_person_id", context.person.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const inboxInquiries: AgentInquiry[] = (inquiries ?? []).map((inquiry) => ({
    id: inquiry.id,
    listingId: inquiry.listing_id,
    listingTitle: inquiry.listing_title,
    listingLocation: inquiry.listing_location_label,
    requesterName: inquiry.requester_name,
    requesterEmail: inquiry.requester_email,
    requesterPhone: inquiry.requester_phone,
    contactPreference: inquiry.contact_preference,
    message: inquiry.message,
    status: inquiry.status,
    createdAt: inquiry.created_at,
  }));

  return (
    <main className="account-page">
      <AccountHeader
        displayName={context.person.display_name}
        hasWorkspace={access.hasWorkspace}
        canManageAgents={access.canManageAgents}
        canManageListings={access.isAgent || access.canReviewListings}
        canManageInquiries={access.canManageInquiries}
        canShareListings={access.canShareListings}
      />
      <section className="account-hero compact">
        <span className="eyebrow"><i /> Private client service</span>
        <h1>Property inquiries.</h1>
      </section>
      <div className="inquiry-status-wrap"><StatusMessage error={query.error} notice={query.notice} /></div>
      <InquiryInbox inquiries={inboxInquiries} />
    </main>
  );
}
