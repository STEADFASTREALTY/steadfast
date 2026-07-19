"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!document.cookie.split("; ").some((item) => item.startsWith("canadasap_cookie_notice=")));
  }, []);

  function acceptCookies() {
    const domain = window.location.hostname === "properap.com" || window.location.hostname.endsWith(".properap.com") ? "; domain=.properap.com" : "";
    document.cookie = `canadasap_cookie_notice=accepted; path=/; max-age=31536000; samesite=lax; secure${domain}`;
    setVisible(false);
  }

  if (!visible) return null;
  return <aside className="cookie-notice" role="dialog" aria-label="Cookie notice" aria-live="polite"><div><strong>Your privacy matters.</strong><p>We use essential cookies to keep the website secure, remember your currency preference, and provide a reliable experience. We do not use advertising cookies.</p></div><div className="cookie-notice-actions"><Link href="/privacy">Privacy</Link><button type="button" onClick={acceptCookies}>Accept and continue</button></div></aside>;
}
