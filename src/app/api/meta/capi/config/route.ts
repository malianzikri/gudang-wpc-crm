import { NextResponse } from "next/server";
import { capiConfigStatus } from "@/lib/meta-capi";

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: capiConfigStatus()
  });
}
