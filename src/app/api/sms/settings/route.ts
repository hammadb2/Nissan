import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/sms/settings
 * Returns current SMS AI settings (programs, rules).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: settings } = await supabase
      .from("sms_settings")
      .select("key, value, updated_at");

    const result: Record<string, { value: string; updated_at: string }> = {};
    for (const s of settings ?? []) {
      result[s.key] = { value: s.value, updated_at: s.updated_at };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("SMS settings GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sms/settings
 * Update SMS AI settings. Body: { key: string, value: string }
 * Valid keys: "active_programs", "ai_rules"
 */
export async function POST(req: NextRequest) {
  try {
    const { key, value } = await req.json();
    const validKeys = ["active_programs", "ai_rules"];

    if (!key || !validKeys.includes(key)) {
      return NextResponse.json(
        { error: `Invalid key. Must be one of: ${validKeys.join(", ")}` },
        { status: 400 }
      );
    }

    if (typeof value !== "string") {
      return NextResponse.json({ error: "value must be a string" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("sms_settings")
      .upsert(
        { key, value, updated_at: now },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: "updated", key });
  } catch (error) {
    console.error("SMS settings POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 }
    );
  }
}
