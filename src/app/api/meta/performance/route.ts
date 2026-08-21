import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAdInsights, resolveAdAccountId } from "@/lib/meta-insights";

export const runtime = "nodejs";

const COOLDOWN_MS = 15 * 60 * 1000;

type LeadRow = {
  id: string;
  source_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_name: string | null;
  status: string;
  revenue: number | string | null;
  first_seen_at: string;
};

type Metrics = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  qualified: number;
  quotation: number;
  hot: number;
  closing: number;
  revenue: number;
};

type CacheRow = {
  cache_key: string;
  since_date: string;
  until_date: string;
  ad_account_id: string | null;
  insight_rows: any[] | null;
  synced_at: string;
  last_error: string | null;
};

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: string | null, fallback: string) {
  if (!value) return fallback;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function getRange(request: Request) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);

  const defaultSinceDate = new Date();
  defaultSinceDate.setUTCDate(defaultSinceDate.getUTCDate() - 6);
  const defaultSince = defaultSinceDate.toISOString().slice(0, 10);

  return {
    since: isoDate(url.searchParams.get("since"), defaultSince),
    until: isoDate(url.searchParams.get("until"), today)
  };
}

function cacheKey(since: string, until: string) {
  return `${since}:${until}`;
}

function startOfDayUtc(date: string) {
  return `${date}T00:00:00.000Z`;
}

function endOfDayUtc(date: string) {
  return `${date}T23:59:59.999Z`;
}

function emptyMetrics(): Metrics {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    qualified: 0,
    quotation: 0,
    hot: 0,
    closing: 0,
    revenue: 0
  };
}

function enrich(m: Metrics) {
  return {
    ...m,
    ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
    cpc: m.clicks > 0 ? m.spend / m.clicks : 0,
    cpm: m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0,
    cpl: m.leads > 0 ? m.spend / m.leads : 0,
    cost_per_qualified: m.qualified > 0 ? m.spend / m.qualified : 0,
    cost_per_closing: m.closing > 0 ? m.spend / m.closing : 0,
    qualified_rate: m.leads > 0 ? (m.qualified / m.leads) * 100 : 0,
    closing_rate: m.leads > 0 ? (m.closing / m.leads) * 100 : 0,
    roas: m.spend > 0 ? m.revenue / m.spend : 0
  };
}

function addLeadToMetrics(metrics: Metrics, lead: LeadRow) {
  metrics.leads += 1;

  const qualifiedStatuses = new Set([
    "Qualified",
    "Quotation Dikirim",
    "Hot",
    "Closing"
  ]);

  const quotationStatuses = new Set([
    "Quotation Dikirim",
    "Hot",
    "Closing"
  ]);

  const hotStatuses = new Set(["Hot", "Closing"]);

  if (qualifiedStatuses.has(lead.status)) metrics.qualified += 1;
  if (quotationStatuses.has(lead.status)) metrics.quotation += 1;
  if (hotStatuses.has(lead.status)) metrics.hot += 1;

  if (lead.status === "Closing") {
    metrics.closing += 1;
    metrics.revenue += num(lead.revenue);
  }
}

async function readCache(db: any, since: string, until: string) {
  const { data, error } = await db
    .from("meta_performance_cache")
    .select(
      "cache_key,since_date,until_date,ad_account_id,insight_rows,synced_at,last_error"
    )
    .eq("cache_key", cacheKey(since, until))
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as CacheRow | null;
}

function cacheTiming(cache: CacheRow | null) {
  if (!cache?.synced_at) {
    return {
      last_synced_at: null,
      can_sync_at: null,
      cooldown_remaining_seconds: 0
    };
  }

  const syncedMs = new Date(cache.synced_at).getTime();
  const canSyncMs = syncedMs + COOLDOWN_MS;
  const remaining = Math.max(0, Math.ceil((canSyncMs - Date.now()) / 1000));

  return {
    last_synced_at: cache.synced_at,
    can_sync_at: new Date(canSyncMs).toISOString(),
    cooldown_remaining_seconds: remaining
  };
}

async function buildPerformanceResponse(
  db: any,
  since: string,
  until: string,
  insightRows: any[],
  meta: {
    cache?: CacheRow | null;
    warning?: string;
    stale?: boolean;
    sync_skipped?: boolean;
    sync_error?: string | null;
    ad_account_id?: string | null;
  } = {}
) {
  const { data: leads, error: leadsError } = await db
    .from("leads")
    .select(
      "id,source_id,campaign_id,campaign_name,adset_id,adset_name,ad_name,status,revenue,first_seen_at"
    )
    .eq("source", "Meta Ads")
    .gte("first_seen_at", startOfDayUtc(since))
    .lte("first_seen_at", endOfDayUtc(until))
    .limit(5000);

  if (leadsError) throw leadsError;

  const adMap = new Map<string, any>();
  const campaignMap = new Map<string, any>();

  for (const row of insightRows ?? []) {
    const adId = String(row.ad_id ?? "");
    const campaignId = String(row.campaign_id ?? "");

    if (!adId) continue;

    const adMetrics = emptyMetrics();
    adMetrics.spend = num(row.spend);
    adMetrics.impressions = num(row.impressions);
    adMetrics.reach = num(row.reach);
    adMetrics.clicks = num(row.clicks);

    adMap.set(adId, {
      id: adId,
      ad_name: row.ad_name ?? "Tanpa nama",
      adset_id: row.adset_id ?? null,
      adset_name: row.adset_name ?? "Tanpa Ad Set",
      campaign_id: row.campaign_id ?? null,
      campaign_name: row.campaign_name ?? "Tanpa Campaign",
      metrics: adMetrics
    });

    if (campaignId) {
      if (!campaignMap.has(campaignId)) {
        campaignMap.set(campaignId, {
          id: campaignId,
          campaign_name: row.campaign_name ?? "Tanpa Campaign",
          metrics: emptyMetrics()
        });
      }

      const c = campaignMap.get(campaignId);
      c.metrics.spend += adMetrics.spend;
      c.metrics.impressions += adMetrics.impressions;
      c.metrics.reach += adMetrics.reach;
      c.metrics.clicks += adMetrics.clicks;
    }
  }

  for (const lead of (leads ?? []) as LeadRow[]) {
    const adId = String(lead.source_id ?? "");

    if (adId) {
      if (!adMap.has(adId)) {
        adMap.set(adId, {
          id: adId,
          ad_name: lead.ad_name ?? "Lead tanpa insight spend",
          adset_id: lead.adset_id,
          adset_name: lead.adset_name ?? "Tanpa Ad Set",
          campaign_id: lead.campaign_id,
          campaign_name: lead.campaign_name ?? "Tanpa Campaign",
          metrics: emptyMetrics()
        });
      }

      addLeadToMetrics(adMap.get(adId).metrics, lead);
    }

    const campaignId = String(lead.campaign_id ?? "");

    if (campaignId) {
      if (!campaignMap.has(campaignId)) {
        campaignMap.set(campaignId, {
          id: campaignId,
          campaign_name: lead.campaign_name ?? "Tanpa Campaign",
          metrics: emptyMetrics()
        });
      }

      addLeadToMetrics(campaignMap.get(campaignId).metrics, lead);
    }
  }

  const campaigns = [...campaignMap.values()]
    .map((row) => ({
      ...row,
      metrics: enrich(row.metrics)
    }))
    .sort((a, b) => b.metrics.spend - a.metrics.spend);

  const ads = [...adMap.values()]
    .map((row) => ({
      ...row,
      metrics: enrich(row.metrics)
    }))
    .sort((a, b) => b.metrics.spend - a.metrics.spend);

  const summary = emptyMetrics();

  for (const campaign of campaigns) {
    summary.spend += campaign.metrics.spend;
    summary.impressions += campaign.metrics.impressions;
    summary.reach += campaign.metrics.reach;
    summary.clicks += campaign.metrics.clicks;
    summary.leads += campaign.metrics.leads;
    summary.qualified += campaign.metrics.qualified;
    summary.quotation += campaign.metrics.quotation;
    summary.hot += campaign.metrics.hot;
    summary.closing += campaign.metrics.closing;
    summary.revenue += campaign.metrics.revenue;
  }

  return {
    ok: true,
    since,
    until,
    ad_account_id:
      meta.ad_account_id ?? meta.cache?.ad_account_id ?? null,
    summary: enrich(summary),
    campaigns,
    ads,
    ...cacheTiming(meta.cache ?? null),
    stale: Boolean(meta.stale),
    sync_skipped: Boolean(meta.sync_skipped),
    sync_error: meta.sync_error ?? null,
    warning: meta.warning
  };
}

// GET never calls Meta.
// It only reads the last successful cache from Supabase + current CRM funnel.
export async function GET(request: Request) {
  try {
    const { since, until } = getRange(request);
    const db = supabaseAdmin();
    const cache = await readCache(db, since, until);

    const warning = cache
      ? cache.last_error
        ? `Sync Meta terakhir gagal. Menampilkan cache terakhir yang berhasil.`
        : undefined
      : "Belum ada cache performa untuk periode ini. Klik “Sync Performa Meta” jika ingin mengambil data Meta.";

    return NextResponse.json(
      await buildPerformanceResponse(
        db,
        since,
        until,
        cache?.insight_rows ?? [],
        {
          cache,
          warning,
          stale: Boolean(cache?.last_error)
        }
      )
    );
  } catch (error: any) {
    console.error("Performance cache GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Gagal membaca cache performa. Pastikan SQL meta_performance_cache sudah dijalankan."
      },
      { status: 500 }
    );
  }
}

// POST is the ONLY route action that calls Meta Ads Insights.
// Server-side cooldown prevents repeated Meta calls even if the button is clicked repeatedly.
export async function POST(request: Request) {
  const { since, until } = getRange(request);
  const db = supabaseAdmin();

  try {
    const cache = await readCache(db, since, until);
    const timing = cacheTiming(cache);

    if (
      cache &&
      timing.cooldown_remaining_seconds > 0
    ) {
      return NextResponse.json(
        await buildPerformanceResponse(
          db,
          since,
          until,
          cache.insight_rows ?? [],
          {
            cache,
            sync_skipped: true,
            warning: `Cooldown aktif. Data Meta tidak dipanggil ulang untuk mencegah request berlebihan.`
          }
        )
      );
    }

    const { data: anchorLead, error: anchorError } = await db
      .from("leads")
      .select("source_id")
      .eq("source", "Meta Ads")
      .not("source_id", "is", null)
      .order("first_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anchorError) throw anchorError;

    if (!anchorLead?.source_id) {
      return NextResponse.json(
        await buildPerformanceResponse(db, since, until, [], {
          cache,
          warning:
            "Belum ada lead Meta Ads untuk mendeteksi Ad Account. Tidak ada request Meta yang dikirim."
        })
      );
    }

    try {
      const accountId = await resolveAdAccountId(String(anchorLead.source_id));
      const insightRows = await fetchAdInsights(accountId, since, until);
      const now = new Date().toISOString();

      const { error: upsertError } = await db
        .from("meta_performance_cache")
        .upsert(
          {
            cache_key: cacheKey(since, until),
            since_date: since,
            until_date: until,
            ad_account_id: accountId,
            insight_rows: insightRows,
            synced_at: now,
            last_error: null,
            updated_at: now
          },
          { onConflict: "cache_key" }
        );

      if (upsertError) throw upsertError;

      const refreshedCache = await readCache(db, since, until);

      return NextResponse.json(
        await buildPerformanceResponse(
          db,
          since,
          until,
          insightRows,
          {
            cache: refreshedCache,
            ad_account_id: accountId
          }
        )
      );
    } catch (metaError: any) {
      const message =
        metaError?.message || "Meta Ads Insights sedang tidak tersedia.";

      // Keep the last successful cache. We only record the error.
      if (cache) {
        await db
          .from("meta_performance_cache")
          .update({
            last_error: message,
            updated_at: new Date().toISOString()
          })
          .eq("cache_key", cache.cache_key);

        const failedCache = {
          ...cache,
          last_error: message
        };

        return NextResponse.json(
          await buildPerformanceResponse(
            db,
            since,
            until,
            cache.insight_rows ?? [],
            {
              cache: failedCache,
              stale: true,
              sync_error: message,
              warning:
                "Meta sedang menolak/membatasi request. Data terakhir yang berhasil tetap ditampilkan; CRM dan CAPI tidak terganggu."
            }
          )
        );
      }

      // Even without a cache, don't break the whole CRM dashboard.
      return NextResponse.json(
        await buildPerformanceResponse(db, since, until, [], {
          cache: null,
          stale: true,
          sync_error: message,
          warning:
            "Meta sedang menolak/membatasi request dan belum ada cache untuk periode ini. CRM tetap berjalan; coba sync lagi nanti."
        })
      );
    }
  } catch (error: any) {
    console.error("Performance sync POST error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Gagal menjalankan sync performa."
      },
      { status: 500 }
    );
  }
}
