"use client";

import { useEffect, useState } from "react";

type PermissionState = NotificationPermission | "unsupported";

export function DesktopNotificationControl() {
  const [permission, setPermission] = useState<PermissionState>("unsupported");

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission === "granted") {
      new Notification("CanadaSAP desktop alerts are on", {
        body: "New account notifications will appear while CanadaSAP is open in this browser.",
        tag: "canadasap-desktop-alerts-enabled",
      });
    }
  }

  if (permission === "unsupported") return null;
  if (permission === "granted") return <span className="desktop-notification-state">Desktop alerts on</span>;
  if (permission === "denied") return <span className="desktop-notification-state blocked">Desktop alerts blocked in browser settings</span>;

  return <button className="outline-dark-button desktop-notification-button" onClick={enableNotifications} type="button">Enable desktop alerts</button>;
}
