import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type TimelineItem = {
  id: string;
  kind: "message" | "status" | "activity";
  label: string;
  detail: string | null;
  created_at: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = supabaseAdmin();

    const [messagesResult, statusResult, activityResult] = await Promise.all([
      db
        .from("messages")
        .select("id,direction,body,message_timestamp,created_at")
        .eq("lead_id", id)
        .order("message_timestamp", { ascending: false })
        .limit(12),
      db
        .from("lead_status_events")
        .select("id,old_status,new_status,revenue,created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("lead_activity_events")
        .select("id,event_type,label,detail,created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(30)
    ]);

    if (messagesResult.error) throw messagesResult.error;
    if (statusResult.error) throw statusResult.error;

    // If the new optional table has not been migrated yet, messages/status
    // still remain readable instead of breaking the whole detail panel.
    if (
      activityResult.error &&
      activityResult.error.code !== "42P01"
    ) {
      throw activityResult.error;
    }

    const items: TimelineItem[] = [];

    for (const message of messagesResult.data ?? []) {
      items.push({
        id: `message:${message.id}`,
        kind: "message",
        label:
          message.direction === "outbound"
            ? "Chat keluar"
            : "Chat masuk",
        detail: message.body || null,
        created_at:
          message.message_timestamp ||
          message.created_at
      });
    }

    for (const event of statusResult.data ?? []) {
      items.push({
        id: `status:${event.id}`,
        kind: "status",
        label: event.old_status
          ? `Status: ${event.old_status} → ${event.new_status}`
          : `Status: ${event.new_status}`,
        detail:
          Number(event.revenue || 0) > 0
            ? `Revenue saat event: ${Number(event.revenue || 0)}`
            : null,
        created_at: event.created_at
      });
    }

    for (const event of activityResult.data ?? []) {
      items.push({
        id: `activity:${event.id}`,
        kind: "activity",
        label: event.label || event.event_type || "Aktivitas CRM",
        detail: event.detail || null,
        created_at: event.created_at
      });
    }

    items.sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      ok: true,
      items: items.slice(0, 40)
    });
  } catch (error: any) {
    console.error("GET /api/leads/[id]/activity failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Gagal mengambil riwayat aktivitas lead."
      },
      { status: 500 }
    );
  }
}
