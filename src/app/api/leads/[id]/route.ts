import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMessagingConversion } from "@/lib/meta-capi";
import { QUALIFIED_STATUSES, STATUSES, TOUCH_OPTIONS } from "@/lib/lead-pipeline";

const ALLOWED_STATUS = new Set<string>(STATUSES as readonly string[]);

const LEAD_SIGNAL_STATUSES = QUALIFIED_STATUSES;
const ALLOWED_TOUCH = new Set<string>(TOUCH_OPTIONS as readonly string[]);

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
      if (!ALLOWED_STATUS.has(body.status)) {
        return NextResponse.json(
          { ok: false, error: "Invalid status" },
          { status: 400 }
        );
      }

      patch.status = body.status;

      if (body.status === "Closing" && existing.status !== "Closing") {
        patch.closed_at = new Date().toISOString();
      }

      if (body.status !== "Closing" && existing.status === "Closing") {
        patch.closed_at = null;
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

    if (body.closing_trigger !== undefined) {
      patch.closing_trigger = String(body.closing_trigger ?? "").slice(0, 120) || null;
    }

    if (body.last_touch_source !== undefined) {
      const touch = String(body.last_touch_source ?? "").trim();

      if (touch && !ALLOWED_TOUCH.has(touch)) {
        return NextResponse.json(
          { ok: false, error: "Invalid touch source" },
          { status: 400 }
        );
      }

      patch.last_touch_source = touch || null;
      patch.last_touch_at = new Date().toISOString();
    }

    if (body.is_historical !== undefined) {
      patch.is_historical = Boolean(body.is_historical);
      if (patch.is_historical && !existing.historical_imported_at) {
        patch.historical_imported_at = new Date().toISOString();
      }
    }

    const { data: updated, error: updateError } = await db
      .from("leads")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    if (patch.status !== undefined && patch.status !== existing.status) {
      await db.from("lead_status_events").insert({
        lead_id: id,
        old_status: existing.status,
        new_status: patch.status,
        revenue: updated.revenue ?? 0
      });
    }

    const capi: Record<string, any> = {};

    // Send LeadSubmitted once when the lead reaches a meaningful sales-qualified stage.
    // We intentionally do NOT send LeadSubmitted when moving directly to Closing;
    // Purchase is the higher-value outcome in that case.
    if (
      LEAD_SIGNAL_STATUSES.has(updated.status) &&
      !updated.capi_lead_sent_at &&
      updated.source === "Meta Ads" &&
      updated.ctwa_clid &&
      !updated.suppress_capi
    ) {
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
            capi_last_error: leadResult.reason ?? "LeadSubmitted failed"
          })
          .eq("id", id);

        updated.capi_last_error =
          leadResult.reason ?? "LeadSubmitted failed";
      }
    }

    // Purchase is sent once when Closing has a positive revenue value.
    // If a user marks Closing first and fills revenue later, the later save will send it.
    if (
      updated.status === "Closing" &&
      Number(updated.revenue || 0) > 0 &&
      !updated.capi_purchase_sent_at &&
      updated.source === "Meta Ads" &&
      updated.ctwa_clid &&
      !updated.suppress_capi
    ) {
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
            capi_last_error: purchaseResult.reason ?? "Purchase failed"
          })
          .eq("id", id);

        updated.capi_last_error =
          purchaseResult.reason ?? "Purchase failed";
      }
    }

    return NextResponse.json({
      ok: true,
      lead: updated,
      capi
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "Failed to update lead" },
      { status: 500 }
    );
  }
}
