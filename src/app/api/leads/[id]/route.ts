import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMessagingConversion } from "@/lib/meta-capi";

const ALLOWED_STATUS = new Set([
  "Chat Builder",
  "Tanya Aja",
  "Qualified",
  "Quotation Dikirim",
  "Hot",
  "Closing",
  "Tidak Layak"
]);

const ALLOWED_SOURCE = new Set([
  "Meta Ads",
  "WhatsApp Organic"
]);

const LEAD_SIGNAL_STATUSES = new Set([
  "Qualified",
  "Quotation Dikirim",
  "Hot"
]);

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

    // Manual source changes from the dashboard are now actually persisted.
    if (body.source !== undefined) {
      if (!ALLOWED_SOURCE.has(body.source)) {
        return NextResponse.json(
          { ok: false, error: "Invalid source" },
          { status: 400 }
        );
      }

      patch.source = body.source;
    }

    // Source normalization:
    // A Meta Ad ID (source_id) or ctwa_clid is authoritative evidence
    // that this lead originated from Meta click-to-WhatsApp.
    // This prevents old/inconsistent rows from remaining "WhatsApp Organic".
    const hasMetaAttribution =
      Boolean(existing.source_id) ||
      Boolean(existing.ctwa_clid);

    if (hasMetaAttribution) {
      patch.source = "Meta Ads";
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

    // Send LeadSubmitted once when the lead reaches a meaningful
    // sales-qualified stage and has the required CTWA identifier.
    if (
      LEAD_SIGNAL_STATUSES.has(updated.status) &&
      !updated.capi_lead_sent_at &&
      updated.source === "Meta Ads" &&
      updated.ctwa_clid
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
    if (
      updated.status === "Closing" &&
      Number(updated.revenue || 0) > 0 &&
      !updated.capi_purchase_sent_at &&
      updated.source === "Meta Ads" &&
      updated.ctwa_clid
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
      capi,
      source_normalized:
        existing.source !== updated.source &&
        updated.source === "Meta Ads"
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "Failed to update lead" },
      { status: 500 }
    );
  }
}
