import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function safeTile(value: string, limit: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= limit ? parsed : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z: rawZ, x: rawX, y: rawY } = await params;
  const z = safeTile(rawZ, 18);
  if (z === null) return new NextResponse(null, { status: 400 });
  const maximum = 2 ** z - 1;
  const x = safeTile(rawX, maximum); const y = safeTile(rawY, maximum);
  if (x === null || y === null) return new NextResponse(null, { status: 400 });
  const response = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: { "User-Agent": "SteadFast-Realty-Map/1.0 (support@canadasap.com)" }, next: { revalidate: 60 * 60 * 24 } });
  if (!response.ok) return new NextResponse(null, { status: 502 });
  return new NextResponse(await response.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
