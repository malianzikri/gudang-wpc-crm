import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  META_AUDIENCES,
  isAudienceEligible,
  validAudienceKey,
  type MetaAudienceKey
} from "@/lib/meta-audience";

export const runtime = "nodejs";


function isMissingTable(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("could not find the table");
}

function asIdSet(rows: any[] | null | undefined) {
  return new Set((rows ?? []).map((row) => String(row.lead_id)));
}

export async function GET() {
  try {
    const db = supabaseAdmin();

    const { data: leads, error: leadError } = await db
      .from("leads")
      .select("id,phone,wa_id,status,product_interest,updated_at")
      .order("updated_at", { ascending: false })
      .limit(10000);
    if (leadError) throw leadError;

    let members: any[] = [];
    let exports: any[] = [];
    let trackingReady = true;

    const memberResult = await db
      .from("meta_audience_members")
      .select("audience_key,lead_id,synced_at")
      .limit(50000);

    if (memberResult.error) {
      if (isMissingTable(memberResult.error)) trackingReady = false;
      else throw memberResult.error;
    } else {
      members = memberResult.data ?? [];
    }

    const exportResult = await db
      .from("meta_audience_exports")
      .select("id,audience_key,export_mode,row_count,downloaded_at,uploaded_at")
      .order("downloaded_at", { ascending: false })
      .limit(500);

    if (exportResult.error) {
      if (isMissingTable(exportResult.error)) trackingReady = false;
      else throw exportResult.error;
    } else {
      exports = exportResult.data ?? [];
    }

    const memberByAudience = new Map<MetaAudienceKey, Set<string>>();
    for (const item of META_AUDIENCES) {
      memberByAudience.set(
        item.key,
        asIdSet(members.filter((row) => row.audience_key === item.key))
      );
    }

    const leadRows: any[] = (leads ?? []) as any[];
    const audienceRows = META_AUDIENCES.map((item) => {
      const eligible = leadRows.filter((lead: any) => isAudienceEligible(lead, item.key));
      const eligibleIds = new Set<string>(eligible.map((lead: any) => String(lead.id)));
      const synced = memberByAudience.get(item.key) ?? new Set<string>();
      const additions = [...eligibleIds].filter((id) => !synced.has(id)).length;
      const removals = [...synced].filter((id) => !eligibleIds.has(id)).length;
      const latestUploaded = exports.find(
        (row) => row.audience_key === item.key && row.uploaded_at
      );
      const latestDownloaded = exports.find(
        (row) => row.audience_key === item.key
      );

      return {
        key: item.key,
        label: item.label,
        current_count: eligible.length,
        synced_count: synced.size,
        additions,
        removals,
        last_uploaded_at: latestUploaded?.uploaded_at ?? null,
        last_downloaded_at: latestDownloaded?.downloaded_at ?? null,
        last_export_mode: latestDownloaded?.export_mode ?? null,
        last_export_count: Number(latestDownloaded?.row_count || 0)
      };
    });

    return NextResponse.json({
      ok: true,
      tracking_ready: trackingReady,
      audiences: audienceRows
    });
  } catch (error: any) {
    console.error("Meta audience summary error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Gagal membaca data Custom Audience." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const exportId = String(body?.export_id || "");
    if (!exportId) {
      return NextResponse.json({ ok: false, error: "export_id wajib diisi." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: exportRow, error: exportError } = await db
      .from("meta_audience_exports")
      .select("*")
      .eq("id", exportId)
      .single();
    if (exportError) throw exportError;

    if (exportRow.uploaded_at) {
      return NextResponse.json({ ok: true, already_uploaded: true, export: exportRow });
    }

    const audienceKey = validAudienceKey(exportRow.audience_key);
    const mode = String(exportRow.export_mode || "full");
    const leadIds = Array.isArray(exportRow.lead_ids)
      ? exportRow.lead_ids.map((id: unknown) => String(id))
      : [];
    const now = new Date().toISOString();

    if (mode === "full") {
      const { error: deleteError } = await db
        .from("meta_audience_members")
        .delete()
        .eq("audience_key", audienceKey);
      if (deleteError) throw deleteError;

      if (leadIds.length > 0) {
        const { error: insertError } = await db
          .from("meta_audience_members")
          .upsert(
            leadIds.map((leadId: string) => ({
              audience_key: audienceKey,
              lead_id: leadId,
              synced_at: now
            })),
            { onConflict: "audience_key,lead_id" }
          );
        if (insertError) throw insertError;
      }
    } else if (mode === "add") {
      if (leadIds.length > 0) {
        const { error: insertError } = await db
          .from("meta_audience_members")
          .upsert(
            leadIds.map((leadId: string) => ({
              audience_key: audienceKey,
              lead_id: leadId,
              synced_at: now
            })),
            { onConflict: "audience_key,lead_id" }
          );
        if (insertError) throw insertError;
      }
    } else if (mode === "remove") {
      if (leadIds.length > 0) {
        const { error: deleteError } = await db
          .from("meta_audience_members")
          .delete()
          .eq("audience_key", audienceKey)
          .in("lead_id", leadIds);
        if (deleteError) throw deleteError;
      }
    }

    const { data: updated, error: updateError } = await db
      .from("meta_audience_exports")
      .update({ uploaded_at: now })
      .eq("id", exportId)
      .select("id,audience_key,export_mode,row_count,downloaded_at,uploaded_at")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, export: updated });
  } catch (error: any) {
    console.error("Meta audience confirm upload error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Gagal menandai upload Custom Audience." },
      { status: 500 }
    );
  }
}
