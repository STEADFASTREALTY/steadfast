import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const exchangeRatesResponse = z.object({
  result: z.literal("success"),
  time_last_update_unix: z.number().int().positive(),
  base_code: z.literal("USD"),
  rates: z.object({
    JMD: z.number().positive(),
    CAD: z.number().positive(),
    GBP: z.number().positive(),
  }),
});

function hasValidCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
    const payload = exchangeRatesResponse.parse(await response.json());
    const providerUpdatedAt = new Date(payload.time_last_update_unix * 1000);
    const supabase = createAdminClient();
    const { error } = await supabase.from("exchange_rate_snapshots").insert({
      provider: "ExchangeRate-API",
      base_currency: "USD",
      jmd_per_usd: payload.rates.JMD,
      cad_per_usd: payload.rates.CAD,
      gbp_per_usd: payload.rates.GBP,
      provider_updated_at: providerUpdatedAt.toISOString(),
      fetched_at: new Date().toISOString(),
    });
    if (error) throw new Error("Could not store the latest exchange rate snapshot.");

    return NextResponse.json({ ok: true, providerUpdatedAt: providerUpdatedAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Exchange rate update failed", error);
    return NextResponse.json({ error: "Exchange rate update failed. The last successful rates remain in use." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
