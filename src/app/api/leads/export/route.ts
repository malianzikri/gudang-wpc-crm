import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  audienceLabel,
  isAudienceEligible,
  normalizePhone,
  splitName,
  validAudienceKey,
  validExportMode
} from "@/lib/meta-audience";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

function fileToken(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function POST(request: Request) {
  try {
    const db = supabaseAdmin();
    const body = await request.json().catch(() => ({}));
    const audienceKey = validAudienceKey(body?.type);
    const mode = validExportMode(body?.mode);

    const { data: leads, error: leadError } = await db
      .from("leads")
      .select("id,name,phone,wa_id,status,product_interest,updated_at")
      .order("updated_at", { ascending: false })
      .limit(10000);
    if (leadError) throw leadError;

    const { data: memberRows, error: memberError } = await db
      .from("meta_audience_members")
      .select("lead_id")
      .eq("audience_key", audienceKey)
      .limit(10000);
    if (memberError) throw memberError;

    const leadRows: any[] = (leads ?? []) as any[];
    const syncedIds = new Set<string>(((memberRows ?? []) as any[]).map((row: any) => String(row.lead_id)));
    const currentEligible = leadRows.filter((lead: any) => isAudienceEligible(lead, audienceKey));
    const eligibleIds = new Set<string>(currentEligible.map((lead: any) => String(lead.id)));

    let selected: any[] = [];
    if (mode === "full") {
      selected = currentEligible;
    } else if (mode === "add") {
      selected = currentEligible.filter((lead: any) => !syncedIds.has(String(lead.id)));
    } else {
      selected = leadRows.filter(
        (lead: any) => syncedIds.has(String(lead.id)) && !eligibleIds.has(String(lead.id))
      );
    }

    // One row per unique normalized phone. This avoids duplicate identifiers
    // when the CRM contains duplicate contacts from historical imports.
    const seenPhones = new Set<string>();
    const rows: string[][] = [];
    const exportedLeadIds: string[] = [];

    for (const lead of selected) {
      const phone = normalizePhone(lead.phone || lead.wa_id);
      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);

      const { fn, ln } = splitName(lead.name);
      rows.push([phone, fn, ln, "ID", String(lead.id)]);
      exportedLeadIds.push(String(lead.id));
    }

    const header = ["phone", "fn", "ln", "country", "external_id"];
    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(","))
    ].join("\r\n");

    const { data: exportLog, error: exportError } = await db
      .from("meta_audience_exports")
      .insert({
        audience_key: audienceKey,
        export_mode: mode,
        row_count: rows.length,
        lead_ids: exportedLeadIds
      })
      .select("id")
      .single();
    if (exportError) throw exportError;

    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    const filename = `META_CA_${fileToken(audienceLabel(audienceKey))}_${mode.toUpperCase()}_${date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Audience-Export-Id": String(exportLog.id),
        "X-Audience-Export-Count": String(rows.length),
        "X-Audience-Export-Filename": filename
      }
    });
  } catch (error: any) {
    console.error("Custom Audience export error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Gagal membuat CSV Custom Audience." },
      { status: 500 }
    );
  }
}
