"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  starNotificationAction,
  unstarNotificationAction,
} from "@/app/actions/notifications";
import { DesktopNotificationControl } from "@/app/components/desktop-notification-control";

export type InboxNotification = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  targetType: string;
  targetId: string;
  readAt: string | null;
  starredAt: string | null;
  createdAt: string;
  actorName: string | null;
  activity: string;
};

type Filter = "all" | "unread" | "starred" | "listing" | "approval";
const PAGE_SIZE = 10;

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-JM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Jamaica",
  }).format(new Date(value));
}

function isApproval(eventType: string) {
  return eventType === "listing.submitted" || eventType === "listing.approved" || eventType === "listing.changes_requested" || eventType === "listing.rejected";
}

export function NotificationInbox({ notifications }: { notifications: InboxNotification[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return notifications.filter((notification) => {
      const inFilter = filter === "all"
        || (filter === "unread" && !notification.readAt)
        || (filter === "starred" && Boolean(notification.starredAt))
        || (filter === "listing" && notification.targetType === "listing")
        || (filter === "approval" && isApproval(notification.eventType));
      const searchable = [notification.title, notification.body, notification.actorName ?? "", notification.activity].join(" ").toLocaleLowerCase();
      return inFilter && (!query || searchable.includes(query));
    });
  }, [filter, notifications, search]);

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "Inbox", count: notifications.length },
    { key: "unread", label: "Unread", count: unreadCount },
    { key: "starred", label: "Starred", count: notifications.filter((notification) => Boolean(notification.starredAt)).length },
    { key: "listing", label: "Listing activity", count: notifications.filter((notification) => notification.targetType === "listing").length },
    { key: "approval", label: "Approvals", count: notifications.filter((notification) => isApproval(notification.eventType)).length },
  ];
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedNotifications = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstVisible = filtered.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const clearFilters = () => {
    setFilter("all");
    setSearch("");
    setPage(1);
  };
  const hasActiveFilters = filter !== "all" || Boolean(search.trim());

  return (
    <section className="notification-inbox">
      <aside className="notification-folders" aria-label="Notification folders">
        <strong>Mailboxes</strong>
        {filters.map((item) => (
          <button key={item.key} type="button" className={filter === item.key ? "active" : ""} onClick={() => { setFilter(item.key); setPage(1); }}>
            <span>{item.label}</span><b>{item.count}</b>
          </button>
        ))}
      </aside>
      <div className="notification-mailbox">
        <div className="notification-mailbox-toolbar">
          <div>
            <span>{filter === "all" ? "Inbox" : filters.find((item) => item.key === filter)?.label}</span>
          <strong>{filtered.length ? `${firstVisible}–${lastVisible} of ${filtered.length}` : "0"} message{filtered.length === 1 ? "" : "s"}</strong>
          </div>
          <div className="notification-toolbar-actions">
            <DesktopNotificationControl />
            {hasActiveFilters ? <button className="text-button notification-clear-filter" onClick={clearFilters} type="button">Clear filters</button> : null}
            {unreadCount > 0 ? <form action={markAllNotificationsReadAction}><button className="outline-dark-button" type="submit">Mark all as read</button></form> : null}
          </div>
        </div>
        <label className="notification-search">
          <span>Search notifications</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search title or user" type="search" />
        </label>
        {filtered.length ? <div className="notification-list">
          {pagedNotifications.map((notification) => (
            <article className={notification.readAt ? "" : "unread"} key={notification.id}>
              <div className="notification-avatar" aria-hidden="true">{(notification.actorName ?? "S").slice(0, 1).toUpperCase()}</div>
              <div className="notification-message">
                <div className="notification-message-heading"><span>{notification.activity}</span><time>{formatNotificationTime(notification.createdAt)}</time></div>
                <h2>{notification.title}</h2>
                <p>{notification.body}</p>
              </div>
              <div className="notification-actions">
                {notification.targetType === "listing" ? <Link className="solid-button" href={`/workspace/listings/${notification.targetId}`}>Open listing</Link> : null}
                {notification.targetType === "share" ? <Link className="solid-button" href="/workspace/sharing">Open sharing</Link> : null}
                {notification.targetType === "inquiry" ? <Link className="solid-button" href="/workspace/inquiries">Open inquiry</Link> : null}
                <div className="notification-message-controls">
                  {!notification.readAt ? <form action={markNotificationReadAction}><input name="notificationId" type="hidden" value={notification.id} /><button className="notification-read-button" type="submit">Mark read</button></form> : <span className="notification-read-state">Read</span>}
                  <form action={notification.starredAt ? unstarNotificationAction : starNotificationAction}>
                    <input name="notificationId" type="hidden" value={notification.id} />
                    <button aria-label={notification.starredAt ? "Remove star" : "Star notification"} className={notification.starredAt ? "notification-icon-button starred" : "notification-icon-button"} title={notification.starredAt ? "Remove star" : "Star notification"} type="submit">★</button>
                  </form>
                  <button aria-label="Delete notification" className="notification-icon-button delete" onClick={() => setDeleteCandidateId(notification.id)} title="Delete notification" type="button">Delete</button>
                </div>
                {deleteCandidateId === notification.id ? <div className="notification-delete-confirm" role="dialog" aria-label="Delete notification confirmation">
                  <p>Remove this notification from your inbox?</p>
                  <div><button className="text-button" onClick={() => setDeleteCandidateId(null)} type="button">Cancel</button><form action={deleteNotificationAction}><input name="notificationId" type="hidden" value={notification.id} /><button className="delete-confirm-button" type="submit">Delete</button></form></div>
                </div> : null}
              </div>
            </article>
          ))}
          {pageCount > 1 ? <nav aria-label="Notification pages" className="notification-pagination">
            <button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
            <span>Page {currentPage} of {pageCount}</span>
            <button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button>
          </nav> : null}
        </div> : <div className="listing-empty"><span>Inbox</span><h2>No matching notifications.</h2><p>Try a different search or folder.</p></div>}
      </div>
    </section>
  );
}
