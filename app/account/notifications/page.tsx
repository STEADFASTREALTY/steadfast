import type { Metadata } from "next";
import Link from "next/link";
import { AccountHeader } from "@/app/components/account-header";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { getActiveMembershipContext } from "@/lib/auth/session";
import { deriveWorkspaceAccess } from "@/lib/auth/workspace-access";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Review private SteadFast account and brokerage workflow notifications.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-JM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
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
    .select("id, event_type, title, body_safe, target_type, target_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const unreadCount = notifications?.filter((notification) => !notification.read_at).length ?? 0;

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
        <span className="eyebrow"><i /> Updates for you</span>
        <h1>Notifications.</h1>
        <p>Brokerage workflow updates are kept here. Opening a listing always checks your current access again.</p>
      </section>
      <section className="notification-shell">
        <div className="notification-toolbar">
          <div>
            <span>Inbox</span>
            <strong>{unreadCount} unread</strong>
          </div>
          {unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button className="outline-dark-button" type="submit">Mark all as read</button>
            </form>
          ) : null}
        </div>

        {notifications?.length ? (
          <div className="notification-list">
            {notifications.map((notification) => (
              <article className={notification.read_at ? "" : "unread"} key={notification.id}>
                <div className="notification-marker" aria-hidden="true" />
                <div>
                  <span>{notification.event_type.replaceAll(".", " · ")}</span>
                  <h2>{notification.title}</h2>
                  <p>{notification.body_safe}</p>
                  <small>{formatNotificationTime(notification.created_at)}</small>
                </div>
                <div className="notification-actions">
                  {notification.target_type === "listing" ? (
                    <Link className="solid-button" href={`/workspace/listings/${notification.target_id}`}>
                      Open listing
                    </Link>
                  ) : null}
                  {notification.target_type === "share" ? (
                    <Link className="solid-button" href="/workspace/sharing">Open sharing</Link>
                  ) : null}
                  {notification.target_type === "inquiry" ? (
                    <Link className="solid-button" href="/workspace/inquiries">
                      Open inquiry
                    </Link>
                  ) : null}
                  {!notification.read_at ? (
                    <form action={markNotificationReadAction}>
                      <input name="notificationId" type="hidden" value={notification.id} />
                      <button className="text-button" type="submit">Mark read</button>
                    </form>
                  ) : <span className="notification-read-state">Read</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="listing-empty">
            <span>All clear</span>
            <h2>No notifications yet.</h2>
            <p>Listing submissions and brokerage decisions that concern you will appear here.</p>
          </div>
        )}
      </section>
    </main>
  );
}
