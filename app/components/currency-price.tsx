"use client";

import { useId, useState } from "react";

type ExchangeRateSnapshot = {
  jmd_per_usd: number;
  cad_per_usd: number;
  gbp_per_usd: number;
  provider_updated_at: string;
};

type Currency = "JMD" | "USD" | "CAD" | "GBP";

const currencyLabels: Record<Currency, string> = { JMD: "JMD", USD: "USD", CAD: "CAD", GBP: "GBP" };

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
  const [currency, setCurrency] = useState<Currency>("JMD");
  const tooltipId = useId();
  const isEstimate = currency !== "JMD" && rates;
  const amount = rates ? convertedAmount(priceJmd, currency, rates) : priceJmd;

  return <div className="currency-price">
    <div className="currency-price-value"><strong>{formatAmount(amount, currency)}{pricePeriod ? <small> / {pricePeriod}</small> : null}</strong>{isEstimate ? <span className="currency-estimate">Estimated</span> : null}</div>
    {rates ? <div className="currency-price-controls">
      <label><span>Display currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{(Object.keys(currencyLabels) as Currency[]).map((item) => <option key={item} value={item}>{currencyLabels[item]}</option>)}</select></label>
      <span className="currency-info" tabIndex={0} aria-describedby={tooltipId}>i<span id={tooltipId} role="tooltip" className="currency-disclaimer">Converted price in your selected currency, using rates provided by Frankfurter. Exchange rates change continuously. CanadaSAP does not guarantee that this conversion reflects the current exchange rate and is not responsible for inaccuracies. Please independently verify exchange-rate information before relying on it. Rates updated {new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Jamaica" }).format(new Date(rates.provider_updated_at))}.</span></span>
    </div> : null}
  </div>;
}
