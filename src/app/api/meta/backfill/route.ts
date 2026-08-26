import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchMetaAdAttribution } from "@/lib/meta-marketing";

export const runtime = "nodejs";

// Keep this intentionally small. New CTWA leads are enriched by webhook;
// this endpoint only repairs rows that still miss Meta object names.
const MAX_PER_RUN = 5;
const COOLDOWN_MS = 15 * 60 * 1000;
const ACTION_CACHE_KEY = "__meta_backfill__";

function jakartaDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function latestMetaAttempt(db: any) {
  const { data, error } = await db
    .from("meta_performance_cache")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.updated_at ? String(data.updated_at) : null;
}

async function recordAction(
  db: any,
  at: string,
  errorMessage: string | null
) {
  const date = jakartaDateString(new Date(at));

  const { error } = await db
    .from("meta_performance_cache")
    .upsert(
      {
        cache_key: ACTION_CACHE_KEY,
        since_date: date,
        until_date: date,
        ad_account_id: null,
        insight_rows: [],
        synced_at: at,
        last_error: errorMessage,
        updated_at: at
      },
      { onConflict: "cache_key" }
    );

  if (error) {
    console.error("Failed to record Meta backfill cooldown:", error);
  }
}

export async function POST() {
  const db = supabaseAdmin();

  try {
    const latestAttemptAt = await latestMetaAttempt(db);

    if (latestAttemptAt) {
      const elapsed = Date.now() - new Date(latestAttemptAt).getTime();

      if (elapsed < COOLDOWN_MS) {
        const remainingSeconds = Math.max(
          1,
          Math.ceil((COOLDOWN_MS - elapsed) / 1000)
        );

        return NextResponse.json({
          ok: true,
          updated: 0,
          skipped: 0,
          max_per_run: MAX_PER_RUN,
          sync_skipped: true,
          cooldown_remaining_seconds: remainingSeconds,
          reason:
            "Cooldown global 15 menit aktif untuk melindungi Marketing API."
        });
      }
    }

    // Record the attempt BEFORE calling Meta, so even a failed request creates
    // a cooldown and repeated button clicks cannot hammer the API.
    const startedAt = new Date().toISOString();
    await recordAction(db, startedAt, null);

    const { data: leads, error } = await db
      .from("leads")
      .select("id,source_id,ad_name,meta_enriched_at")
      .not("source_id", "is", null)
      .or("meta_enriched_at.is.null,ad_name.is.null")
      .order("first_seen_at", { ascending: false })
      .limit(MAX_PER_RUN);

    if (error) throw error;

    let updated = 0;
    let skipped = 0;
    let metaError: string | null = null;

    for (const lead of leads ?? []) {
      if (!lead.source_id) {
        skipped++;
        continue;
      }

      const meta = await fetchMetaAdAttribution(String(lead.source_id));

      if (!meta) {
        skipped++;
        metaError =
          "Meta API tidak mengembalikan data. Proses dihentikan agar tidak membuat burst request.";
        break;
      }

      const { error: updateError } = await db
        .from("leads")
        .update({
          ad_name: meta.ad_name,
          adset_id: meta.adset_id,
          adset_name: meta.adset_name,
          campaign_id: meta.campaign_id,
          campaign_name: meta.campaign_name,
          creative_id: meta.creative_id,
          meta_enriched_at: new Date().toISOString()
        })
        .eq("id", lead.id);

      if (updateError) {
        console.error("Meta backfill update failed:", updateError);
        skipped++;
      } else {
        updated++;
      }
    }

    const finishedAt = new Date().toISOString();
    await recordAction(db, finishedAt, metaError);

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      max_per_run: MAX_PER_RUN,
      sync_skipped: false,
      warning: metaError
    });
  } catch (error: any) {
    console.error("Meta backfill failed:", error);

    const failedAt = new Date().toISOString();
    await recordAction(
      db,
      failedAt,
      error?.message || "Failed to enrich Meta Ads leads"
    );

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to enrich Meta Ads leads"
      },
      { status: 500 }
    );
  }
}
