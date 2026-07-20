import type { Metadata } from "next";
import { AccountHeader } from "@/app/components/account-header";
import { ConsumerAccountNav } from "@/app/components/consumer-account-nav";
import { NotificationInbox, type InboxNotification } from "@/app/components/notification-inbox";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Review private SteadFast account and brokerage workflow notifications.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function activityFor(eventType: string, actorName: string | null) {
  const person = actorName ?? "SteadFast";
  if (eventType === "listing.draft_created") return `Created by ${person}`;
  if (eventType === "listing.submitted") return `Submitted by ${person} · Awaiting approval`;
  if (eventType === "listing.approved") return `Approved by ${person}`;
  if (eventType === "listing.changes_requested") return `Changes requested by ${person}`;
  if (eventType === "listing.rejected") return `Rejected by ${person}`;
  if (eventType === "share.received") return `Shared by ${person}`;
  if (eventType === "share.removed" || eventType === "share.revoked") return `Updated by ${person}`;
  if (eventType === "agent.application_submitted") return `Applied by ${person} · Awaiting review`;
  if (eventType === "membership.suspended") return `Suspended by ${person}`;
  if (eventType === "membership.reactivated") return `Restored by ${person}`;
  if (eventType === "membership.removed") return `Removed by ${person}`;
  return `Updated by ${person}`;
}

export default async function NotificationsPage() {
  const context = await getActiveMembershipContext("/account/notifications");
  const access = deriveWorkspaceAccess({
    hasMembership: Boolean(context.membership),
    roles: context.roles,
    permissions: context.permissions,
    platformRoles: context.platformRoles,
  });
  const { data: notifications } = await context.supabase
    .from("notifications")
    .select("id, source_event_id, event_type, title, body_safe, target_type, target_id, read_at, starred_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const sourceEventIds = (notifications ?? []).map((notification) => notification.source_event_id);
  const admin = createAdminClient();
  const { data: sourceEvents } = sourceEventIds.length
    ? await admin.from("audit_events").select("event_id,action,actor_person_id").in("event_id", sourceEventIds)
    : { data: [] as Array<{ event_id: string; action: string; actor_person_id: string | null }> };
  const actorIds = [...new Set((sourceEvents ?? []).flatMap((event) => event.actor_person_id ? [event.actor_person_id] : []))];
  const { data: actors } = actorIds.length
    ? await admin.from("people").select("id,display_name").in("id", actorIds)
    : { data: [] as Array<{ id: string; display_name: string }> };
  const eventsById = new Map((sourceEvents ?? []).map((event) => [event.event_id, event]));
  const actorsById = new Map((actors ?? []).map((actor) => [actor.id, actor.display_name]));
  const inboxNotifications: InboxNotification[] = (notifications ?? []).map((notification) => {
    const event = eventsById.get(notification.source_event_id);
    const actorName = event?.actor_person_id ? actorsById.get(event.actor_person_id) ?? null : null;
    return {
      id: notification.id,
      eventType: notification.event_type,
      title: notification.title,
      body: notification.body_safe,
      targetType: notification.target_type,
      targetId: notification.target_id,
      readAt: notification.read_at,
      starredAt: notification.starred_at,
      createdAt: notification.created_at,
      actorName,
      activity: activityFor(notification.event_type, actorName),
    };
  });

  return (
    <main className="account-page">
      <AccountHeader
        displayName={context.person.display_name}
        hasWorkspace={access.hasWorkspace}
        canManageAgents={access.canManageAgents}
        canManageListings={access.isAgent || access.canReviewListings}
        canManageInquiries={access.canManageInquiries}
        canShareListings={access.canShareListings}
        isConsumer={!context.membership}
      />
      <section className="account-hero compact inbox-hero">
        <span className="eyebrow"><i /> Updates for you</span>
        <h1>Notifications</h1>
      </section>
      {!context.membership ? <div className="account-settings-layout consumer-account-layout"><ConsumerAccountNav active="notifications" /><div className="account-main"><NotificationInbox notifications={inboxNotifications} /></div></div> : <NotificationInbox notifications={inboxNotifications} />}
    </main>
  );
}
