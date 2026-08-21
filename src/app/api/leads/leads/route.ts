import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = supabaseAdmin();
    const url = new URL(request.url);

    const status = url.searchParams.get("status");
    const source = url.searchParams.get("source");
    const q = url.searchParams.get("q")?.trim();

    let query = db
      .from("leads")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(500);

    if (status) query = query.eq("status", status);
    if (source) query = query.eq("source", source);

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
