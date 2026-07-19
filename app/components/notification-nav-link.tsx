"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type UnreadResponse = {
  count: number;
  latest: { id: string; title: string; body: string } | null;
};

export function NotificationNavLink({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const countRef = useRef(initialCount);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as UnreadResponse;
      const previousCount = countRef.current;
      countRef.current = result.count;
      setCount(result.count);

      if (result.count > previousCount && result.latest && "Notification" in window && Notification.permission === "granted") {
        new Notification(result.latest.title, {
          body: result.latest.body,
          tag: result.latest.id,
        });
      }
    } catch {
      // The current number remains visible if a temporary network request fails.
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(refresh, 30_000);
    const handleFocus = () => void refresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  const label = count > 99 ? "99+" : String(count);
  return (
    <Link className="notification-nav-link" href="/account/notifications">
      <span>Notifications</span>
      {count > 0 ? <strong aria-label={`${count} unread notification${count === 1 ? "" : "s"}`}>{label}</strong> : null}
    </Link>
  );
}
