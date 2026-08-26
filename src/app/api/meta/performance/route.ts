import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAdInsights, resolveAdAccountId } from "@/lib/meta-insights";
import { ESTIMATE_STATUSES, HOT_STATUSES, QUALIFIED_STATUSES, QUOTATION_STATUSES, SURVEY_STATUSES, normalizeLeadStatus } from "@/lib/lead-pipeline";

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
  estimate: number;
  qualified: number;
  survey: number;
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
  updated_at: string;
};

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: string | null, fallback: string) {
  if (!value) return fallback;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function jakartaDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getRange(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const today = jakartaDateString(now);

  const defaultSinceDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const defaultSince = jakartaDateString(defaultSinceDate);

  return {
    since: isoDate(url.searchParams.get("since"), defaultSince),
    until: isoDate(url.searchParams.get("until"), today)
  };
}

function cacheKey(since: string, until: string) {
  return `${since}:${until}`;
}

function startOfDayJakarta(date: string) {
  return `${date}T00:00:00.000+07:00`;
}

function endOfDayJakarta(date: string) {
  return `${date}T23:59:59.999+07:00`;
}

function emptyMetrics(): Metrics {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    estimate: 0,
    qualified: 0,
    survey: 0,
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
  const status = normalizeLeadStatus(lead.status);

  if (ESTIMATE_STATUSES.has(status)) metrics.estimate += 1;
  if (QUALIFIED_STATUSES.has(status)) metrics.qualified += 1;
  if (SURVEY_STATUSES.has(status)) metrics.survey += 1;
  if (QUOTATION_STATUSES.has(status)) metrics.quotation += 1;
  if (HOT_STATUSES.has(status)) metrics.hot += 1;

  if (status === "Closing") {
    metrics.closing += 1;
    metrics.revenue += num(lead.revenue);
  }
}

async function readCache(db: any, since: string, until: string) {
  const { data, error } = await db
    .from("meta_performance_cache")
    .select(
      "cache_key,since_date,until_date,ad_account_id,insight_rows,synced_at,last_error,updated_at"
    )
    .eq("cache_key", cacheKey(since, until))
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as CacheRow | null;
}

async function readLatestAttempt(db: any) {
  const { data, error } = await db
    .from("meta_performance_cache")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.updated_at ? String(data.updated_at) : null;
}

function cacheTiming(
  cache: CacheRow | null,
  cooldownBaseAt?: string | null
) {
  const attemptAt =
    cooldownBaseAt ?? cache?.updated_at ?? cache?.synced_at ?? null;

  if (!attemptAt) {
    return {
      last_synced_at: cache?.synced_at ?? null,
      last_attempt_at: null,
      can_sync_at: null,
      cooldown_remaining_seconds: 0
    };
  }

  const attemptMs = new Date(attemptAt).getTime();
  const canSyncMs = attemptMs + COOLDOWN_MS;
  const remaining = Math.max(0, Math.ceil((canSyncMs - Date.now()) / 1000));

  return {
    last_synced_at: cache?.synced_at ?? null,
    last_attempt_at: attemptAt,
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
    cooldown_base_at?: string | null;
  } = {}
) {
  const { data: leads, error: leadsError } = await db
    .from("leads")
    .select(
      "id,source_id,campaign_id,campaign_name,adset_id,adset_name,ad_name,status,revenue,first_seen_at"
    )
    .eq("source", "Meta Ads")
    .gte("first_seen_at", startOfDayJakarta(since))
    .lte("first_seen_at", endOfDayJakarta(until))
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
    let adId = String(lead.source_id ?? "");

    if (!adId && lead.ad_name) {
      const byName = [...adMap.entries()].find(([, row]) => row.ad_name === lead.ad_name);
      if (byName) adId = byName[0];
    }

    if (!adId) {
      adId = "unattributed";
    }

    if (!adMap.has(adId)) {
      adMap.set(adId, {
        id: adId,
        ad_name:
          adId === "unattributed"
            ? "Meta Ads · Belum terpetakan Ad"
            : lead.ad_name ?? "Lead tanpa insight spend",
        adset_id: lead.adset_id,
        adset_name: lead.adset_name ?? "Tanpa Ad Set",
        campaign_id: lead.campaign_id,
        campaign_name: lead.campaign_name ?? "Tanpa Campaign",
        metrics: emptyMetrics()
      });
    }

    addLeadToMetrics(adMap.get(adId).metrics, lead);

    let campaignId = String(lead.campaign_id ?? "");

    if (!campaignId && lead.campaign_name) {
      const byName = [...campaignMap.entries()].find(
        ([, row]) => row.campaign_name === lead.campaign_name
      );
      if (byName) campaignId = byName[0];
    }

    // Historical/pre-CRM rows may only know the campaign name. Keep them
    // attributable by name rather than dropping them from campaign metrics.
    if (!campaignId && lead.campaign_name) {
      campaignId = `name:${lead.campaign_name}`;
    }

    if (!campaignId) {
      campaignId = "unattributed";
    }

    if (!campaignMap.has(campaignId)) {
      campaignMap.set(campaignId, {
        id: campaignId,
        campaign_name:
          campaignId === "unattributed"
            ? "Meta Ads · Belum terpetakan Campaign"
            : lead.campaign_name ?? "Tanpa Campaign",
        metrics: emptyMetrics()
      });
    }

    addLeadToMetrics(campaignMap.get(campaignId).metrics, lead);
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
    summary.estimate += campaign.metrics.estimate;
    summary.qualified += campaign.metrics.qualified;
    summary.survey += campaign.metrics.survey;
    summary.quotation += campaign.metrics.quotation;
    summary.hot += campaign.metrics.hot;
    summary.closing += campaign.metrics.closing;
    summary.revenue += campaign.metrics.revenue;
  }

  const { data: closingRows, error: closingError } = await db
    .from("leads")
    .select("status,revenue,closed_at")
    .eq("source", "Meta Ads")
    .eq("status", "Closing")
    .gte("closed_at", startOfDayJakarta(since))
    .lte("closed_at", endOfDayJakarta(until))
    .limit(5000);

  if (closingError) throw closingError;

  const closingActivity = {
    closing: (closingRows ?? []).length,
    revenue: (closingRows ?? []).reduce(
      (sum: number, row: any) => sum + num(row.revenue),
      0
    )
  };

  return {
    ok: true,
    since,
    until,
    ad_account_id:
      meta.ad_account_id ?? meta.cache?.ad_account_id ?? null,
    summary: enrich(summary),
    closing_activity: closingActivity,
    campaigns,
    ads,
    ...cacheTiming(meta.cache ?? null, meta.cooldown_base_at),
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
    const latestAttemptAt = await readLatestAttempt(db);

    const warning = cache
      ? cache.last_error
        ? (cache.insight_rows ?? []).length > 0
          ? "Sync Meta terakhir gagal. Menampilkan cache terakhir yang berhasil."
          : "Sync Meta terakhir gagal dan belum ada cache sukses untuk periode ini."
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
          stale: Boolean(cache?.last_error),
          cooldown_base_at: latestAttemptAt
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
    const latestAttemptAt = await readLatestAttempt(db);
    const timing = cacheTiming(cache, latestAttemptAt);

    if (timing.cooldown_remaining_seconds > 0) {
      return NextResponse.json(
        await buildPerformanceResponse(
          db,
          since,
          until,
          cache?.insight_rows ?? [],
          {
            cache,
            sync_skipped: true,
            cooldown_base_at: latestAttemptAt,
            warning: `Cooldown global 15 menit aktif. Data Meta tidak dipanggil ulang untuk mencegah request berlebihan.`
          }
        )
      );
    }

    const { data: anchorLead, error: anchorError } = await db
      .from("leads")
      .select("source_id")
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
            ad_account_id: accountId,
            cooldown_base_at: now
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

        const failedAt = new Date().toISOString();
        const failedCache = {
          ...cache,
          last_error: message,
          updated_at: failedAt
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
              cooldown_base_at: failedAt,
              warning:
                "Meta sedang menolak/membatasi request. Data terakhir yang berhasil tetap ditampilkan; CRM dan CAPI tidak terganggu."
            }
          )
        );
      }

      // Even without a successful cache, record the failed attempt so repeated
      // clicks cannot hammer Meta. The empty cache keeps the CRM usable.
      const failedAt = new Date().toISOString();
      await db.from("meta_performance_cache").upsert(
        {
          cache_key: cacheKey(since, until),
          since_date: since,
          until_date: until,
          ad_account_id: null,
          insight_rows: [],
          synced_at: failedAt,
          last_error: message,
          updated_at: failedAt
        },
        { onConflict: "cache_key" }
      );

      const failedCache = await readCache(db, since, until);

      return NextResponse.json(
        await buildPerformanceResponse(db, since, until, [], {
          cache: failedCache,
          stale: true,
          sync_error: message,
          cooldown_base_at: failedAt,
          warning:
            "Meta sedang menolak/membatasi request dan belum ada cache sukses untuk periode ini. CRM tetap berjalan; sync dikunci 15 menit sebelum boleh dicoba lagi."
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
