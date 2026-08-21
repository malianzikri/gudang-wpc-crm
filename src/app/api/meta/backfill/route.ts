import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchMetaAdAttribution } from "@/lib/meta-marketing";

export const runtime = "nodejs";

export async function POST() {
  try {
    const db = supabaseAdmin();
    const { data: leads, error } = await db
      .from("leads")
      .select("id,source_id,ad_name")
      .eq("source", "Meta Ads")
      .not("source_id", "is", null)
      .limit(100);
    if (error) throw error;

    let updated = 0, skipped = 0;
    for (const lead of leads ?? []) {
      if (!lead.source_id) { skipped++; continue; }
      const meta = await fetchMetaAdAttribution(String(lead.source_id));
      if (!meta) { skipped++; continue; }
      const { error: updateError } = await db.from("leads").update({
        ad_name: meta.ad_name,
        adset_id: meta.adset_id,
        adset_name: meta.adset_name,
        campaign_id: meta.campaign_id,
        campaign_name: meta.campaign_name,
        creative_id: meta.creative_id,
        meta_enriched_at: new Date().toISOString()
      }).eq("id", lead.id);
      if (updateError) { console.error(updateError); skipped++; } else updated++;
    }
    return NextResponse.json({ ok: true, updated, skipped });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Failed to enrich Meta Ads leads" }, { status: 500 });
  }
}
