"use client";

import { useEffect } from "react";

export function PublicSiteLiveRefresh({ slug, updatedAt }: { slug: string; updatedAt: string }) {
  useEffect(() => {
    let checking = false;
    const checkForUpdate = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const response = await fetch(`/api/sites/${encodeURIComponent(slug)}/version`, { cache: "no-store" });
        const data = await response.json() as { updatedAt?: string };
        if (data.updatedAt && data.updatedAt !== updatedAt) window.location.reload();
      } catch {
        // A public website stays usable if the small update check is unavailable.
      } finally {
        checking = false;
      }
    };
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
    return () => { window.removeEventListener("focus", checkForUpdate); document.removeEventListener("visibilitychange", checkForUpdate); };
  }, [slug, updatedAt]);

  return null;
}
