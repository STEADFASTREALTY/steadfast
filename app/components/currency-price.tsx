"use client";

import { useEffect, useId, useState } from "react";

type ExchangeRateSnapshot = {
  jmd_per_usd: number;
  cad_per_usd: number;
  gbp_per_usd: number;
  provider_updated_at: string;
};

type Currency = "JMD" | "USD" | "CAD" | "GBP";

function convertedAmount(jmdAmount: number, currency: Currency, rates: ExchangeRateSnapshot) {
  if (currency === "JMD") return jmdAmount;
  const usd = jmdAmount / Number(rates.jmd_per_usd);
  if (currency === "USD") return usd;
  return currency === "CAD" ? usd * Number(rates.cad_per_usd) : usd * Number(rates.gbp_per_usd);
}

function formatAmount(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function CurrencyPrice({ priceJmd, pricePeriod, rates }: { priceJmd: number; pricePeriod: string | null; rates: ExchangeRateSnapshot | null }) {
  const tooltipId = useId();
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("JMD");
  useEffect(() => {
    const loadCurrency = () => {
      const saved = window.localStorage.getItem("canadasap-display-currency");
      if (saved === "JMD" || saved === "USD" || saved === "CAD" || saved === "GBP") setSelectedCurrency(saved);
    };
    const handleChange = (event: Event) => setSelectedCurrency((event as CustomEvent<Currency>).detail);
    loadCurrency();
    window.addEventListener("canadasap:currency-change", handleChange);
    return () => window.removeEventListener("canadasap:currency-change", handleChange);
  }, []);
  const currencies: Currency[] = [selectedCurrency, ...(["JMD", "USD", "CAD", "GBP"] as Currency[]).filter((currency) => currency !== selectedCurrency)];
  const amountFor = (currency: Currency) => currency === "JMD" ? priceJmd : rates ? convertedAmount(priceJmd, currency, rates) : priceJmd;

  return <div className="currency-price">
    {currencies.map((currency, index) => <div className={index === 0 ? "currency-price-value" : "currency-price-row"} key={currency}><span>{currency}</span><strong>{formatAmount(amountFor(currency), currency)}{pricePeriod ? <small> / {pricePeriod}</small> : null}</strong><small>{currency === "JMD" ? "Official asking price" : "Estimated"}</small>{index === 0 && currency !== "JMD" && rates ? <span className="currency-info" tabIndex={0} aria-describedby={tooltipId}>i<span id={tooltipId} role="tooltip" className="currency-disclaimer">Converted prices use rates provided by <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" aria-label="ExchangeRate-API">ExchangeRate</a>. Exchange rates change continuously. CanadaSAP does not guarantee that these conversions reflect current conversion rates and is not responsible for inaccuracies. Please independently verify information before relying on it. Rates updated {new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Jamaica" }).format(new Date(rates.provider_updated_at))}.</span></span> : null}</div>)}
  </div>;
}
