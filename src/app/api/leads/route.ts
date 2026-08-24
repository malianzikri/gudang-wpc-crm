import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  HIGH_INTENT_STATUSES,
  SOURCE_GROUPS,
  sourceGroup,
  normalizeLeadStatus
} from "@/lib/lead-pipeline";

export const runtime = "nodejs";

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function applyDateRange(query: any, since: string | null, until: string | null) {
  let next = query;

  if (since) {
    next = next.gte("first_seen_at", `${since}T00:00:00.000+07:00`);
  }

  if (until) {
    next = next.lte("first_seen_at", `${until}T23:59:59.999+07:00`);
  }

  return next;
}

function applySourceGroup(query: any, source: string | null) {
  if (!source) return query;

  if (source === "meta") return query.eq("source", "Meta Ads");
  if (source === "legacy") {
    return query.or("source.ilike.%Legacy%,source.ilike.%Belum Teratribusi%");
  }
  if (source === "walkin") return query.ilike("source", "%Walk%");
  if (source === "referral") return query.ilike("source", "%Refer%");

  if (source === "organic") {
    return query.or(
      "source.ilike.%Organic%,source.eq.WhatsApp Organic,source.eq.Organic"
    );
  }

  return query;
}

function buildSummary(rows: any[]) {
  const sourceMap = new Map<string, any>();

  for (const source of SOURCE_GROUPS) {
    sourceMap.set(source.key, {
      key: source.key,
      label: source.label,
      total: 0,
      closing: 0,
      revenue: 0,
      statuses: {} as Record<string, number>
    });
  }

  let highIntent = 0;
  let survey = 0;
  let closing = 0;
  let revenue = 0;
  let broadcastReactivation = 0;
  const statusCounts: Record<string, number> = {};
  const touchTotals: Record<string, number> = {};

  for (const row of rows) {
    const status = normalizeLeadStatus(row.status);
    const group = sourceGroup(row.source);
    const sourceStats = sourceMap.get(group);
    const touch = String(row.last_touch_source || "").trim();

    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (HIGH_INTENT_STATUSES.has(status)) highIntent += 1;
    if (["Survey Ditawarkan", "Survey Terjadwal"].includes(status)) survey += 1;

    if (touch) {
      touchTotals[touch] = (touchTotals[touch] || 0) + 1;
      if (touch.toLowerCase().includes("broadcast")) {
        broadcastReactivation += 1;
      }
    }

    if (status === "Closing") {
      closing += 1;
      revenue += Number(row.revenue || 0);
    }

    if (sourceStats) {
      sourceStats.total += 1;
      sourceStats.statuses[status] = (sourceStats.statuses[status] || 0) + 1;

      if (status === "Closing") {
        sourceStats.closing += 1;
        sourceStats.revenue += Number(row.revenue || 0);
      }
    }
  }

  const sources = [...sourceMap.values()].filter((item) => item.total > 0);

  return {
    total: rows.length,
    highIntent,
    survey,
    closing,
    revenue,
    broadcastReactivation,
    touchTotals,
    statusCounts,
    sources,
    sourceTotals: Object.fromEntries(
      SOURCE_GROUPS.map((group) => [
        group.key,
        sourceMap.get(group.key)?.total || 0
      ])
    )
  };
}

export async function GET(request: Request) {
  try {
    const db = supabaseAdmin();
    const url = new URL(request.url);

    const status = url.searchParams.get("status");
    const source = url.searchParams.get("source");
    const q = url.searchParams.get("q")?.trim();
    const since = validDate(url.searchParams.get("since"));
    const until = validDate(url.searchParams.get("until"));

    // Summary is based on FIRST-TOUCH cohort date.
    let summaryQuery = db
      .from("leads")
      .select("status,source,last_touch_source,revenue,first_seen_at")
      .order("first_seen_at", { ascending: false })
      .limit(5000);

    summaryQuery = applyDateRange(summaryQuery, since, until);

    const { data: summaryRows, error: summaryError } = await summaryQuery;
    if (summaryError) throw summaryError;

    let query = db
      .from("leads")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(500);

    query = applyDateRange(query, since, until);

    if (status) query = query.eq("status", status);
    query = applySourceGroup(query, source);

    if (q) {
      const escaped = q.replace(/[%_,()]/g, "");
      query = query.or(
        `name.ilike.%${escaped}%,phone.ilike.%${escaped}%,last_message.ilike.%${escaped}%,campaign_name.ilike.%${escaped}%,manual_campaign.ilike.%${escaped}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase /api/leads error:", error);
      return NextResponse.json(
        {
          ok: false,
          error: error.message || "Supabase query failed",
          code: error.code || null
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      since,
      until,
      leads: (data ?? []).map((lead: any) => ({
        ...lead,
        status: normalizeLeadStatus(lead.status)
      })),
      summary: buildSummary(summaryRows ?? [])
    });
  } catch (error: any) {
    console.error("/api/leads fatal error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to load leads"
      },
      { status: 500 }
    );
  }
}
