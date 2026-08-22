import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
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

    let query = db
      .from("leads")
      .select("*")
      // Acquisition list: newest lead first, not most recently chatted lead.
      .order("first_seen_at", { ascending: false })
      .limit(500);

    if (status) query = query.eq("status", status);
    if (source) query = query.eq("source", source);

    // Dashboard dates are interpreted in WIB / Asia-Jakarta.
    // Postgres timestamptz will normalize these offsets correctly.
    if (since) {
      query = query.gte("first_seen_at", `${since}T00:00:00.000+07:00`);
    }

    if (until) {
      query = query.lte("first_seen_at", `${until}T23:59:59.999+07:00`);
    }

    if (q) {
      const escaped = q.replace(/[%_,()]/g, "");
      query = query.or(
        `name.ilike.%${escaped}%,phone.ilike.%${escaped}%,last_message.ilike.%${escaped}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase /api/leads error:", error);
      return NextResponse.json(
        {
          ok: false,
          error: error.message || "Supabase query failed",
          code: error.code || null
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      since,
      until,
      leads: data ?? []
    });
  } catch (error: any) {
    console.error("/api/leads fatal error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to load leads"
      },
      { status: 500 }
    );
  }
}
