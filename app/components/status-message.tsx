"use client";

import { useEffect, useState } from "react";

export function StatusMessage({ error, notice }: { error?: string; notice?: string }) {
  const message = error ?? notice;
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(error ? "error" : "notice");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (error) return;
    const timeout = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [error, message]);

  if (!message || !visible) return null;
  return <p className={`status-message ${error ? "error" : "success"}`} role="status">{message}</p>;
}
