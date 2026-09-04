import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeLeadStatus, statusLabel } from "@/lib/lead-pipeline";

export const runtime = "nodejs";

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isoStart(date: string) {
  return new Date(`${date}T00:00:00.000+07:00`).getTime();
}

function isoEnd(date: string) {
  return new Date(`${date}T23:59:59.999+07:00`).getTime();
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type StatusEvent = {
  id: string;
  lead_id: string;
  old_status: string | null;
  new_status: string;
  revenue: number | string | null;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const db = supabaseAdmin();
    const url = new URL(request.url);
    const since = validDate(url.searchParams.get("since"));
    const until = validDate(url.searchParams.get("until"));

    const endMs = until ? isoEnd(until) : Date.now();
    const startMs = since ? isoStart(since) : endMs - 29 * 86400000;

    // Read the most recent history up to the selected period end. We keep
    // events before `since` too so durations into a transition remain useful.
    let eventQuery = db
      .from("lead_status_events")
      .select("id,lead_id,old_status,new_status,revenue,created_at")
      .lte("created_at", new Date(endMs).toISOString())
      .order("created_at", { ascending: false })
      .limit(30000);

    const { data: rawEvents, error: eventError } = await eventQuery;
    if (eventError) throw eventError;

    const events = ((rawEvents ?? []) as StatusEvent[])
      .map((event) => ({
        ...event,
        old_status: event.old_status ? normalizeLeadStatus(event.old_status) : null,
        new_status: normalizeLeadStatus(event.new_status)
      }))
      .reverse();

    const selected = events.filter((event) => {
      const time = new Date(event.created_at).getTime();
      return time >= startMs && time <= endMs;
    });

    const transitionCounts = new Map<string, number>();
    const outgoingCounts = new Map<string, number>();
    const durationGroups = new Map<string, { totalHours: number; count: number }>();
    const leadFirstEvent = new Map<string, StatusEvent>();
    const previousByLead = new Map<string, StatusEvent>();
    const touchedLeadIds = new Set<string>();
    let dropoffs = 0;
    let closings = 0;
    let reactivated = 0;
    let closingHoursTotal = 0;
    let closingHoursCount = 0;

    for (const event of events) {
      if (!leadFirstEvent.has(event.lead_id)) leadFirstEvent.set(event.lead_id, event);

      const previous = previousByLead.get(event.lead_id);
      const eventMs = new Date(event.created_at).getTime();
      const inPeriod = eventMs >= startMs && eventMs <= endMs;

      if (inPeriod) touchedLeadIds.add(event.lead_id);

      if (inPeriod && event.old_status && event.old_status !== event.new_status) {
        const key = `${event.old_status}|||${event.new_status}`;
        transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
        outgoingCounts.set(event.old_status, (outgoingCounts.get(event.old_status) || 0) + 1);

        if (["No Response", "Lost", "Tidak Layak"].includes(event.new_status)) dropoffs += 1;
        if (event.new_status === "Closing") closings += 1;
        if (
          ["No Response", "Pending"].includes(event.old_status) &&
          !["No Response", "Pending", "Lost", "Tidak Layak"].includes(event.new_status)
        ) {
          reactivated += 1;
        }

        if (previous) {
          const hours = Math.max(0, (eventMs - new Date(previous.created_at).getTime()) / 3600000);
          const duration = durationGroups.get(key) || { totalHours: 0, count: 0 };
          duration.totalHours += hours;
          duration.count += 1;
          durationGroups.set(key, duration);
        }

        if (event.new_status === "Closing") {
          const first = leadFirstEvent.get(event.lead_id);
          if (first) {
            closingHoursTotal += Math.max(0, (eventMs - new Date(first.created_at).getTime()) / 3600000);
            closingHoursCount += 1;
          }
        }
      }

      previousByLead.set(event.lead_id, event);
    }

    const transitions = [...transitionCounts.entries()]
      .map(([key, count]) => {
        const [from, to] = key.split("|||");
        const outgoing = outgoingCounts.get(from) || count;
        return {
          from,
          from_label: statusLabel(from),
          to,
          to_label: statusLabel(to),
          count,
          share_from: round((count / Math.max(1, outgoing)) * 100)
        };
      })
      .sort((a, b) => b.count - a.count || b.share_from - a.share_from);

    const stageDurations = [...durationGroups.entries()]
      .map(([key, value]) => {
        const [from, to] = key.split("|||");
        return {
          from,
          from_label: statusLabel(from),
          to,
          to_label: statusLabel(to),
          count: value.count,
          avg_hours: round(value.totalHours / Math.max(1, value.count))
        };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const dropoffTransitions = transitions
      .filter((item) => ["No Response", "Lost", "Tidak Layak"].includes(item.to))
      .slice(0, 8);

    const activeTransitions = transitions
      .filter((item) => !["No Response", "Lost", "Tidak Layak"].includes(item.to))
      .slice(0, 10);

    // Current reasons are intentionally a snapshot, not period-filtered.
    const { data: reasonRows, error: reasonError } = await db
      .from("leads")
      .select("status,pending_reason,lost_reason")
      .in("status", ["Pending", "Lost"])
      .limit(10000);
    if (reasonError) throw reasonError;

    const pendingReasons: Record<string, number> = {};
    const lostReasons: Record<string, number> = {};
    for (const row of reasonRows ?? []) {
      const status = normalizeLeadStatus(String((row as any).status || ""));
      if (status === "Pending") {
        const reason = String((row as any).pending_reason || "Belum diisi");
        pendingReasons[reason] = (pendingReasons[reason] || 0) + 1;
      }
      if (status === "Lost") {
        const reason = String((row as any).lost_reason || "Belum diisi");
        lostReasons[reason] = (lostReasons[reason] || 0) + 1;
      }
    }

    const reasonList = (values: Record<string, number>) =>
      Object.entries(values)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

    const transitionTotal = transitions.reduce((sum, item) => sum + item.count, 0);

    return NextResponse.json({
      ok: true,
      since: new Date(startMs).toISOString(),
      until: new Date(endMs).toISOString(),
      summary: {
        transitions: transitionTotal,
        leads_touched: touchedLeadIds.size,
        dropoffs,
        dropoff_rate: round((dropoffs / Math.max(1, transitionTotal)) * 100),
        closings,
        reactivated,
        avg_hours_to_close: closingHoursCount ? round(closingHoursTotal / closingHoursCount) : 0
      },
      transitions: activeTransitions,
      dropoffs: dropoffTransitions,
      durations: stageDurations,
      reasons: {
        pending: reasonList(pendingReasons),
        lost: reasonList(lostReasons)
      }
    });
  } catch (error: any) {
    console.error("/api/sales-analysis fatal error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Gagal membaca analisa sales." },
      { status: 500 }
    );
  }
}
