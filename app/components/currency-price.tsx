"use client";

import { useId } from "react";

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
  const convertedCurrencies: Currency[] = ["USD", "CAD", "GBP"];

  return <div className="currency-price">
    <div className="currency-price-value"><strong>{formatAmount(priceJmd, "JMD")}{pricePeriod ? <small> / {pricePeriod}</small> : null}</strong></div>
    {rates ? <div className="currency-price-conversions">
      {convertedCurrencies.map((currency) => <div key={currency}><span>{currency}</span><strong>{formatAmount(convertedAmount(priceJmd, currency, rates), currency)}{pricePeriod ? <small> / {pricePeriod}</small> : null}</strong><small>Estimated</small></div>)}
      <span className="currency-info" tabIndex={0} aria-describedby={tooltipId}>i<span id={tooltipId} role="tooltip" className="currency-disclaimer">Converted prices use rates provided by <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a>. Exchange rates change continuously. CanadaSAP does not guarantee that these conversions reflect current conversion rates and is not responsible for inaccuracies. Please independently verify information before relying on it. Rates updated {new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Jamaica" }).format(new Date(rates.provider_updated_at))}.</span></span>
    </div> : null}
  </div>;
}
