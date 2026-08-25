import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMessagingConversion } from "@/lib/meta-capi";

const ALLOWED_STATUS = new Set([
  // Funnel baru
  "Chat Builder",
  "Kebutuhan",
  "Estimasi Dikirim",
  "Survey",
  "Quotation Final",
  "Hot",
  "Closing",
  "Tidak Layak",

  // Backward compatibility untuk data/status lama
  "Tanya Aja",
  "Qualified",
  "Quotation Dikirim"
]);

const ALLOWED_SOURCE = new Set([
  "Meta Ads",
  "WhatsApp Organic"
]);

const LEAD_SIGNAL_STATUSES = new Set([
  // Funnel baru: mulai dianggap high-intent setelah estimasi dikirim.
  "Estimasi Dikirim",
  "Survey",
  "Quotation Final",
  "Hot",

  // Backward compatibility
  "Qualified",
  "Quotation Dikirim"
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
          { ok: false, error: `Invalid status: ${body.status}` },
          { status: 400 }
        );
      }

      patch.status = body.status;

      if (body.status === "Closing" && existing.status !== "Closing") {
        patch.closed_at = new Date().toISOString();
      } else if (
        body.status !== "Closing" &&
        existing.status === "Closing"
      ) {
        patch.closed_at = null;
      }
    }

    if (body.source !== undefined) {
      if (!ALLOWED_SOURCE.has(body.source)) {
        return NextResponse.json(
          { ok: false, error: `Invalid source: ${body.source}` },
          { status: 400 }
        );
      }

      patch.source = body.source;
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

    // Attribution is authoritative:
    // once an actual Meta Ad ID or CTWA click ID exists, this cannot be
    // classified as WhatsApp Organic.
    if (existing.source_id || existing.ctwa_clid) {
      patch.source = "Meta Ads";
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

    // Verify what Supabase actually persisted before telling the UI "success".
    if (
      patch.status !== undefined &&
      updated.status !== patch.status
    ) {
      throw new Error(
        `Status tidak tersimpan. Requested=${patch.status}, DB=${updated.status}`
      );
    }

    if (
      patch.source !== undefined &&
      updated.source !== patch.source
    ) {
      throw new Error(
        `Source tidak tersimpan. Requested=${patch.source}, DB=${updated.source}`
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

    if (
      patch.status !== undefined &&
      patch.status !== existing.status
    ) {
      const { error: eventError } = await db
        .from("lead_status_events")
        .insert({
          lead_id: id,
          old_status: existing.status,
          new_status: patch.status,
          revenue: updated.revenue ?? 0
        });

      // Status itself has already been saved; an audit-log problem must not
      // make the user think the lead update failed.
      if (eventError) {
        console.error("lead_status_events insert failed:", eventError);
      }
    }

    const capi: Record<string, any> = {};

    if (
      LEAD_SIGNAL_STATUSES.has(updated.status) &&
      !updated.capi_lead_sent_at &&
      updated.source === "Meta Ads" &&
      updated.ctwa_clid
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
        // Never roll back / hide a successfully saved CRM status because
        // Meta CAPI happened to be unavailable.
        capi.lead = {
          ok: false,
          reason:
            capiError?.message ||
            "Lead tersimpan, tetapi Meta CAPI error."
        };
      }
    }

    if (
      updated.status === "Closing" &&
      Number(updated.revenue || 0) > 0 &&
      !updated.capi_purchase_sent_at &&
      updated.source === "Meta Ads" &&
      updated.ctwa_clid
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
        status: updated.status,
        revenue: Number(updated.revenue || 0)
      }
    });
  } catch (error: any) {
    console.error("PATCH /api/leads/[id] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Failed to update lead"
      },
      { status: 500 }
    );
  }
}
