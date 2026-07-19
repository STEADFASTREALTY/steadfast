"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DisplayCurrency } from "@/lib/currency-conversions";

const storageKey = "canadasap-display-currency";

export function PublicCurrencySelector() {
  const router = useRouter();
  const [currency, setCurrency] = useState<DisplayCurrency>("JMD");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "JMD" || saved === "USD" || saved === "CAD" || saved === "GBP") setCurrency(saved);
  }, []);

  function changeCurrency(nextCurrency: DisplayCurrency) {
    setCurrency(nextCurrency);
    window.localStorage.setItem(storageKey, nextCurrency);
    document.cookie = `canadasap_display_currency=${nextCurrency}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent("canadasap:currency-change", { detail: nextCurrency }));
    router.refresh();
  }

  return <label className="public-currency-selector"><span>Currency</span><select aria-label="Display currency" value={currency} onChange={(event) => changeCurrency(event.target.value as DisplayCurrency)}><option value="JMD">JMD</option><option value="USD">USD</option><option value="CAD">CAD</option><option value="GBP">GBP</option></select></label>;
}
