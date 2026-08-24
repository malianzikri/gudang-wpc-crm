import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type ExportType = "all" | "high_intent" | "closing";

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validType(value: string | null): ExportType {
  if (value === "high_intent" || value === "closing") return value;
  return "all";
}

function normalizePhone(raw: string | null | undefined) {
  if (!raw) return "";

  let digits = String(raw).replace(/\D/g, "");

  if (!digits) return "";

  // Indonesian local numbers -> country code 62.
  if (digits.startsWith("0")) {
    digits = `62${digits.slice(1)}`;
  }

  // Handles accidental 6208... style input.
  if (digits.startsWith("620")) {
    digits = `62${digits.slice(3)}`;
  }

  // If the CRM stores WA ID as 62..., this remains unchanged.
  return digits;
}

function splitName(raw: string | null | undefined) {
  const name = String(raw || "").trim().replace(/\s+/g, " ");

  if (!name) {
    return { fn: "", ln: "" };
  }

  const parts = name.split(" ");

  if (parts.length === 1) {
    return { fn: parts[0], ln: "" };
  }

  return {
    fn: parts[0],
    ln: parts.slice(1).join(" ")
  };
}

function csvCell(value: unknown) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

function audienceLabel(type: ExportType) {
  if (type === "high_intent") return "HIGH_INTENT";
  if (type === "closing") return "CLOSING";
  return "ALL_LEADS";
}

export async function GET(request: Request) {
  try {
    const db = supabaseAdmin();
    const url = new URL(request.url);

    const since = validDate(url.searchParams.get("since"));
    const until = validDate(url.searchParams.get("until"));
    const type = validType(url.searchParams.get("type"));

    let query = db
      .from("leads")
      .select("id,name,phone,wa_id,status,first_seen_at")
      .order("first_seen_at", { ascending: false })
      .limit(5000);

    if (since) {
      query = query.gte(
        "first_seen_at",
        `${since}T00:00:00.000+07:00`
      );
    }

    if (until) {
      query = query.lte(
        "first_seen_at",
        `${until}T23:59:59.999+07:00`
      );
    }

    if (type === "high_intent") {
      query = query.in("status", [
        "Foto Area Diterima",
        "Qualified",
        "Survey Ditawarkan",
        "Survey Terjadwal",
        "Quotation Final",
        "Hot"
      ]);
    } else if (type === "closing") {
      query = query.eq("status", "Closing");
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // One row per unique phone number.
    const seenPhones = new Set<string>();
    const rows: string[][] = [];

    for (const lead of data ?? []) {
      const phone = normalizePhone(lead.phone || lead.wa_id);

      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);

      const { fn, ln } = splitName(lead.name);

      rows.push([
        phone,
        fn,
        ln,
        "ID",
        String(lead.id)
      ]);
    }

    // Meta Customer List friendly identifiers.
    // Meta's upload UI can map these columns automatically/manually.
    const header = ["phone", "fn", "ln", "country", "external_id"];

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(","))
    ].join("\r\n");

    const filename = [
      "META_CA",
      audienceLabel(type),
      since || "ALL",
      until || "ALL"
    ].join("_") + ".csv";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error: any) {
    console.error("Custom Audience export error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Gagal membuat CSV Custom Audience."
      },
      { status: 500 }
    );
  }
}
