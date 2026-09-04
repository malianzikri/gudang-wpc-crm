import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMessagingConversion } from "@/lib/meta-capi";
import {
  ESTIMATE_STATUSES,
  STATUSES,
  TOUCH_OPTIONS,
  normalizeLeadStatus,
  normalizeTouchSource
} from "@/lib/lead-pipeline";

const ALLOWED_STATUS = new Set<string>(STATUSES);
const ALLOWED_TOUCH = new Set<string>(TOUCH_OPTIONS);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = supabaseAdmin();

    const [{ data: lead, error: leadError }, { data: events, error: eventError }] = await Promise.all([
      db.from("leads").select("id,status,first_seen_at,last_seen_at").eq("id", id).single(),
      db
        .from("lead_status_events")
        .select("id,old_status,new_status,revenue,created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: true })
        .limit(500)
    ]);

    if (leadError) throw leadError;
    if (eventError) throw eventError;

    let previousAt: string | null = null;
    const history = (events ?? []).map((event: any) => {
      const hours = previousAt
        ? Math.max(0, (new Date(event.created_at).getTime() - new Date(previousAt).getTime()) / 3600000)
        : null;
      previousAt = event.created_at;
      return {
        ...event,
        old_status: event.old_status ? normalizeLeadStatus(event.old_status) : null,
        new_status: normalizeLeadStatus(event.new_status),
        hours_in_previous_status: hours === null ? null : Math.round(hours * 10) / 10
      };
    });

    const lastEvent = history.length ? history[history.length - 1] : null;
    const currentSince = lastEvent?.created_at || lead.first_seen_at;

    return NextResponse.json({
      ok: true,
      lead: {
        id: lead.id,
        status: normalizeLeadStatus(lead.status),
        current_since: currentSince,
        current_hours: Math.max(0, Math.round(((Date.now() - new Date(currentSince).getTime()) / 3600000) * 10) / 10)
      },
      history
    });
  } catch (error: any) {
    console.error("GET /api/leads/[id] history error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Gagal membaca riwayat status." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const db = supabaseAdmin();

    const { data: existing, error: existingError } = await db
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (existingError) throw existingError;

    const patch: Record<string, any> = {};

    if (body.status !== undefined) {
      const requestedStatus = normalizeLeadStatus(String(body.status));

      if (!ALLOWED_STATUS.has(requestedStatus)) {
        return NextResponse.json(
          { ok: false, error: `Invalid status: ${body.status}` },
          { status: 400 }
        );
      }

      patch.status = requestedStatus;

      // Once sales intentionally moves a reactivated lead to another status,
      // remove it from the "Balas Lagi" queue.
      if (
        "reactivated_at" in existing &&
        requestedStatus !== existing.status &&
        !["No Response", "Pending"].includes(requestedStatus)
      ) {
        patch.reactivated_at = null;
        patch.reactivated_from_status = null;
      }

      if (requestedStatus === "Closing" && existing.status !== "Closing") {
        patch.closed_at = new Date().toISOString();
      } else if (
        requestedStatus !== "Closing" &&
        existing.status === "Closing"
      ) {
        patch.closed_at = null;
      }
    }

    if (body.last_touch_source !== undefined) {
      const requestedTouch = normalizeTouchSource(
        String(body.last_touch_source || "")
      );

      if (!ALLOWED_TOUCH.has(requestedTouch)) {
        return NextResponse.json(
          { ok: false, error: `Invalid touch/trigger: ${requestedTouch}` },
          { status: 400 }
        );
      }

      patch.last_touch_source = requestedTouch;

      if (requestedTouch !== String(existing.last_touch_source || "")) {
        patch.last_touch_at = new Date().toISOString();
      }
    }

    if (body.revenue !== undefined) {
      const revenue = Number(body.revenue);

      if (!Number.isFinite(revenue) || revenue < 0) {
        return NextResponse.json(
          { ok: false, error: "Invalid revenue" },
          { status: 400 }
        );
      }

      patch.revenue = revenue;
    }

    if (body.notes !== undefined) {
      patch.notes = String(body.notes ?? "").slice(0, 5000);
    }

    const stringFields = [
      "product_interest", "intent", "project_size", "project_location",
      "follow_up_reason", "pending_reason", "lost_reason"
    ];
    for (const field of stringFields) {
      if (body[field] !== undefined) {
        patch[field] = body[field] ? String(body[field]).slice(0, 500) : null;
      }
    }

    if (body.estimated_value !== undefined) {
      const value = Number(body.estimated_value || 0);
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json({ ok: false, error: "Invalid estimated value" }, { status: 400 });
      }
      patch.estimated_value = value;
    }

    if (body.lead_score !== undefined) {
      const score = Math.max(0, Math.min(100, Math.round(Number(body.lead_score || 0))));
      if (!Number.isFinite(score)) {
        return NextResponse.json({ ok: false, error: "Invalid lead score" }, { status: 400 });
      }
      patch.lead_score = score;
    }

    if (body.next_follow_up_at !== undefined) {
      if (!body.next_follow_up_at) patch.next_follow_up_at = null;
      else {
        const parsed = new Date(String(body.next_follow_up_at));
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ ok: false, error: "Invalid next follow up date" }, { status: 400 });
        }
        patch.next_follow_up_at = parsed.toISOString();
      }
    }

    // Keep `source` as first-touch acquisition. Touch/trigger is stored
    // separately in `last_touch_source`, so changing Broadcast/Follow-up
    // never steals first-touch credit from Meta Ads or Organic.

    const nextStatus = patch.status ?? normalizeLeadStatus(existing.status);
    const nextTouch =
      patch.last_touch_source ??
      existing.last_touch_source ??
      existing.source ??
      null;

    if (
      nextStatus === "Closing" &&
      existing.status !== "Closing" &&
      nextTouch
    ) {
      patch.closing_trigger = nextTouch;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Tidak ada perubahan untuk disimpan." },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await db
      .from("leads")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    // Verify what Supabase actually persisted before telling the UI success.
    if (patch.status !== undefined && updated.status !== patch.status) {
      throw new Error(
        `Status tidak tersimpan. Requested=${patch.status}, DB=${updated.status}`
      );
    }

    if (
      patch.last_touch_source !== undefined &&
      updated.last_touch_source !== patch.last_touch_source
    ) {
      throw new Error(
        `Touch/Trigger tidak tersimpan. Requested=${patch.last_touch_source}, DB=${updated.last_touch_source}`
      );
    }

    if (
      patch.revenue !== undefined &&
      Number(updated.revenue || 0) !== Number(patch.revenue)
    ) {
      throw new Error(
        `Revenue tidak tersimpan. Requested=${patch.revenue}, DB=${updated.revenue}`
      );
    }

    const capi: Record<string, any> = {};
    const capiAllowed = !updated.suppress_capi && Boolean(updated.ctwa_clid);

    // Preserve the previous behavior: a lead may be reported once it reaches
    // Estimasi or any later funnel stage. ESTIMATE_STATUSES is shared with the
    // dashboard so API and UI cannot drift apart again.
    if (
      ESTIMATE_STATUSES.has(normalizeLeadStatus(updated.status)) &&
      !updated.capi_lead_sent_at &&
      capiAllowed
    ) {
      try {
        const leadResult = await sendMessagingConversion(
          updated,
          "LeadSubmitted"
        );

        capi.lead = leadResult;

        if (leadResult.ok && !leadResult.skipped) {
          const sentAt = new Date().toISOString();

          await db
            .from("leads")
            .update({
              capi_lead_sent_at: sentAt,
              capi_last_error: null
            })
            .eq("id", id);

          updated.capi_lead_sent_at = sentAt;
          updated.capi_last_error = null;
        } else if (!leadResult.ok && !leadResult.skipped) {
          await db
            .from("leads")
            .update({
              capi_last_error:
                leadResult.reason ?? "LeadSubmitted failed"
            })
            .eq("id", id);

          updated.capi_last_error =
            leadResult.reason ?? "LeadSubmitted failed";
        }
      } catch (capiError: any) {
        capi.lead = {
          ok: false,
          reason:
            capiError?.message ||
            "Lead tersimpan, tetapi Meta CAPI error."
        };
      }
    }

    if (
      normalizeLeadStatus(updated.status) === "Closing" &&
      Number(updated.revenue || 0) > 0 &&
      !updated.capi_purchase_sent_at &&
      capiAllowed
    ) {
      try {
        const purchaseResult = await sendMessagingConversion(
          updated,
          "Purchase"
        );

        capi.purchase = purchaseResult;

        if (purchaseResult.ok && !purchaseResult.skipped) {
          const sentAt = new Date().toISOString();

          await db
            .from("leads")
            .update({
              capi_purchase_sent_at: sentAt,
              capi_last_error: null
            })
            .eq("id", id);

          updated.capi_purchase_sent_at = sentAt;
          updated.capi_last_error = null;
        } else if (!purchaseResult.ok && !purchaseResult.skipped) {
          await db
            .from("leads")
            .update({
              capi_last_error:
                purchaseResult.reason ?? "Purchase failed"
            })
            .eq("id", id);

          updated.capi_last_error =
            purchaseResult.reason ?? "Purchase failed";
        }
      } catch (capiError: any) {
        capi.purchase = {
          ok: false,
          reason:
            capiError?.message ||
            "Closing tersimpan, tetapi Meta CAPI error."
        };
      }
    }

    return NextResponse.json({
      ok: true,
      lead: updated,
      capi,
      saved: {
        source: updated.source,
        last_touch_source: updated.last_touch_source,
        status: updated.status,
        revenue: Number(updated.revenue || 0)
      }
    });
  } catch (error: any) {
    console.error("PATCH /api/leads/[id] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to update lead"
      },
      { status: 500 }
    );
  }
}
