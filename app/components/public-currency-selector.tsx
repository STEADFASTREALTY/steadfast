"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DisplayCurrency } from "@/lib/currency-conversions";

const storageKey = "canadasap-display-currency";

function savedCurrency() {
  const local = window.localStorage.getItem(storageKey);
  if (local === "JMD" || local === "USD" || local === "CAD" || local === "GBP") return local;
  const cookie = document.cookie.split("; ").find((item) => item.startsWith("canadasap_display_currency="))?.split("=")[1];
  return cookie === "JMD" || cookie === "USD" || cookie === "CAD" || cookie === "GBP" ? cookie : "USD";
}

export function PublicCurrencySelector() {
  const router = useRouter();
  const [currency, setCurrency] = useState<DisplayCurrency>("JMD");

  useEffect(() => {
    setCurrency(savedCurrency());
  }, []);

  function changeCurrency(nextCurrency: DisplayCurrency) {
    setCurrency(nextCurrency);
    window.localStorage.setItem(storageKey, nextCurrency);
    const domain = window.location.hostname === "canadasap.com" || window.location.hostname.endsWith(".canadasap.com") ? "; domain=.canadasap.com" : "";
    document.cookie = `canadasap_display_currency=${nextCurrency}; path=/; max-age=31536000; samesite=lax${domain}`;
    window.dispatchEvent(new CustomEvent("canadasap:currency-change", { detail: nextCurrency }));
    router.refresh();
  }

  return <label className="public-currency-selector"><span>Currency</span><select aria-label="Display currency" value={currency} onChange={(event) => changeCurrency(event.target.value as DisplayCurrency)}><option value="JMD">JMD</option><option value="USD">USD</option><option value="CAD">CAD</option><option value="GBP">GBP</option></select></label>;
}
