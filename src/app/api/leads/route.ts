import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  HIGH_INTENT_STATUSES,
  SOURCE_GROUPS,
  sourceGroup,
  normalizeLeadStatus,
  normalizeTouchSource
} from "@/lib/lead-pipeline";

export const runtime = "nodejs";

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

type DateBasis = "lead" | "activity";
function validDateBasis(value: string | null): DateBasis {
  return value === "activity" ? "activity" : "lead";
}
function dateColumn(dateBasis: DateBasis) {
  return dateBasis === "activity" ? "last_seen_at" : "first_seen_at";
}
function applyDateRange(query: any, since: string | null, until: string | null, dateBasis: DateBasis) {
  let next = query;
  const column = dateColumn(dateBasis);
  if (since) next = next.gte(column, `${since}T00:00:00.000+07:00`);
  if (until) next = next.lte(column, `${until}T23:59:59.999+07:00`);
  return next;
}
function applySourceGroup(query: any, source: string | null) {
  if (!source) return query;
  if (source === "meta") return query.eq("source", "Meta Ads");
  if (source === "legacy") return query.or("source.ilike.%Legacy%,source.ilike.%Belum Teratribusi%");
  if (source === "walkin") return query.ilike("source", "%Walk%");
  if (source === "referral") return query.ilike("source", "%Refer%");
  if (source === "organic") return query.or("source.ilike.%Organic%,source.eq.WhatsApp Organic,source.eq.Organic");
  return query;
}

function buildSummary(rows: any[]) {
  const sourceMap = new Map<string, any>();
  for (const source of SOURCE_GROUPS) {
    sourceMap.set(source.key, { key: source.key, label: source.label, total: 0, closing: 0, revenue: 0, statuses: {} as Record<string, number> });
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
    const touch = normalizeTouchSource(row.last_touch_source || row.source || "");
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (HIGH_INTENT_STATUSES.has(status)) highIntent += 1;
    if (["Survey Ditawarkan", "Survey Terjadwal"].includes(status)) survey += 1;
    if (touch) {
      touchTotals[touch] = (touchTotals[touch] || 0) + 1;
      if (touch.toLowerCase().includes("broadcast")) broadcastReactivation += 1;
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

  return {
    total: rows.length,
    highIntent,
    survey,
    closing,
    revenue,
    broadcastReactivation,
    touchTotals,
    statusCounts,
    sources: [...sourceMap.values()].filter((item) => item.total > 0),
    sourceTotals: Object.fromEntries(SOURCE_GROUPS.map((group) => [group.key, sourceMap.get(group.key)?.total || 0]))
  };
}

const TERMINAL = new Set(["Closing", "Lost", "Tidak Layak"]);
function jakartaDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function queueMatches(row: any, quick: string, now = new Date()) {
  const status = normalizeLeadStatus(row.status);
  const follow = row.next_follow_up_at ? new Date(row.next_follow_up_at) : null;
  if (quick === "today") return Boolean(follow && jakartaDay(follow) === jakartaDay(now) && !TERMINAL.has(status));
  if (quick === "overdue") return Boolean(follow && follow.getTime() < now.getTime() && jakartaDay(follow) !== jakartaDay(now) && !TERMINAL.has(status));
  if (quick === "reactivated") return Boolean(row.reactivated_at && ["No Response", "Pending"].includes(status));
  if (quick === "hot") return status === "Hot";
  if (quick === "estimate") return status === "Estimasi Dikirim";
  if (quick === "qualified") return ["Foto Area Diterima", "Qualified"].includes(status);
  if (quick === "ask") return status === "Tanya Kebutuhan";
  if (quick === "builder") return status === "Chat Builder";
  if (quick === "pending") return status === "Pending";
  if (quick === "no_response") return status === "No Response";
  if (quick === "unplanned") return !row.next_follow_up_at && !["Closing", "Lost", "Tidak Layak", "No Response"].includes(status);
  return true;
}

function buildQueueCounts(rows: any[]) {
  const keys = ["today", "overdue", "reactivated", "hot", "estimate", "qualified", "ask", "builder", "pending", "no_response", "unplanned"];
  return Object.fromEntries(keys.map((key) => [key, rows.filter((row) => queueMatches(row, key)).length]));
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
    const dateBasis = validDateBasis(url.searchParams.get("date_basis"));
    const activeDateColumn = dateColumn(dateBasis);
    const queueMode = url.searchParams.get("queue") === "1";
    const quick = String(url.searchParams.get("quick") || "");

    let summaryQuery = db
      .from("leads")
      .select("status,source,last_touch_source,revenue,first_seen_at,last_seen_at")
      .order(activeDateColumn, { ascending: false })
      .limit(5000);
    summaryQuery = applyDateRange(summaryQuery, since, until, dateBasis);
    const { data: summaryRows, error: summaryError } = await summaryQuery;
    if (summaryError) throw summaryError;

    let queueRows: any[] = [];
    const queueResult = await db
      .from("leads")
      .select("id,status,next_follow_up_at,reactivated_at,first_seen_at,last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(10000);

    if (queueResult.error) {
      const message = String(queueResult.error.message || "").toLowerCase();
      if (message.includes("reactivated_at")) {
        const fallback = await db
          .from("leads")
          .select("id,status,next_follow_up_at,first_seen_at,last_seen_at")
          .order("last_seen_at", { ascending: false })
          .limit(10000);
        if (fallback.error) throw fallback.error;
        queueRows = ((fallback.data ?? []) as any[]).map((row: any) => ({ ...row, reactivated_at: null }));
      } else {
        throw queueResult.error;
      }
    } else {
      queueRows = (queueResult.data ?? []) as any[];
    }

    let query = db.from("leads").select("*").order(queueMode ? "last_seen_at" : activeDateColumn, { ascending: false }).limit(queueMode ? 5000 : 500);
    if (!queueMode) query = applyDateRange(query, since, until, dateBasis);
    if (status) query = query.eq("status", status);
    query = applySourceGroup(query, source);
    if (q) {
      const escaped = q.replace(/[%_,()]/g, "");
      query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,last_message.ilike.%${escaped}%,campaign_name.ilike.%${escaped}%,manual_campaign.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const normalized = (data ?? []).map((lead: any) => ({
      ...lead,
      status: normalizeLeadStatus(lead.status),
      last_touch_source: normalizeTouchSource(lead.last_touch_source || lead.source || "WhatsApp Organic")
    }));
    const output = queueMode ? normalized.filter((lead: any) => queueMatches(lead, quick)).slice(0, 500) : normalized;

    return NextResponse.json({
      ok: true,
      since,
      until,
      date_basis: dateBasis,
      date_column: activeDateColumn,
      queue_mode: queueMode,
      quick,
      leads: output,
      summary: buildSummary(summaryRows ?? []),
      queue_counts: buildQueueCounts(queueRows)
    });
  } catch (error: any) {
    console.error("/api/leads fatal error:", error);
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load leads" }, { status: 500 });
  }
}
