import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const exchangeRatesResponse = z.array(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: z.literal("USD"),
  quote: z.enum(["JMD", "CAD", "GBP"]),
  rate: z.number().positive(),
}));

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
    const response = await fetch("https://api.frankfurter.dev/v2/rates?base=USD&quotes=JMD,CAD,GBP", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
    const payload = exchangeRatesResponse.parse(await response.json());
    const rates = new Map(payload.map((item) => [item.quote, item]));
    const jmd = rates.get("JMD");
    const cad = rates.get("CAD");
    const gbp = rates.get("GBP");
    if (!jmd || !cad || !gbp || jmd.date !== cad.date || jmd.date !== gbp.date) throw new Error("Provider returned an incomplete rate set.");
    const providerUpdatedAt = new Date(`${jmd.date}T00:00:00.000Z`);
    const supabase = createAdminClient();
    const { error } = await supabase.from("exchange_rate_snapshots").insert({
      provider: "Frankfurter",
      base_currency: "USD",
      jmd_per_usd: jmd.rate,
      cad_per_usd: cad.rate,
      gbp_per_usd: gbp.rate,
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
