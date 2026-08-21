import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAdInsights, resolveAdAccountId } from "@/lib/meta-insights";

export const runtime = "nodejs";

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

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: string | null, fallback: string) {
  if (!value) return fallback;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const today = new Date().toISOString().slice(0, 10);

    const defaultSinceDate = new Date();
    defaultSinceDate.setUTCDate(defaultSinceDate.getUTCDate() - 6);
    const defaultSince = defaultSinceDate.toISOString().slice(0, 10);

    const since = isoDate(url.searchParams.get("since"), defaultSince);
    const until = isoDate(url.searchParams.get("until"), today);

    const db = supabaseAdmin();

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
      return NextResponse.json({
        ok: true,
        since,
        until,
        summary: enrich(emptyMetrics()),
        campaigns: [],
        ads: [],
        warning: "Belum ada lead Meta Ads untuk mendeteksi Ad Account."
      });
    }

    const accountId = await resolveAdAccountId(String(anchorLead.source_id));
    const insightRows = await fetchAdInsights(accountId, since, until);

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

    for (const row of insightRows) {
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

    return NextResponse.json({
      ok: true,
      since,
      until,
      ad_account_id: accountId,
      summary: enrich(summary),
      campaigns,
      ads
    });
  } catch (error: any) {
    console.error("Performance dashboard error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Gagal mengambil performa iklan."
      },
      { status: 500 }
    );
  }
}
