import { NextResponse } from "next/server";
import { fetchMetaAdAttribution } from "@/lib/meta-marketing";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const adId = url.searchParams.get("ad_id");
  if (!adId) return NextResponse.json({ ok: false, error: "Missing ad_id" }, { status: 400 });
  const data = await fetchMetaAdAttribution(adId);
  if (!data) return NextResponse.json({ ok: false, error: "Meta API did not return ad data" }, { status: 502 });
  return NextResponse.json({ ok: true, data });
}
