import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/warning-detected
 *
 * Extension reports a Facebook warning, restriction, or unusual UI.
 * Pauses all activity by setting facebook_paused = true.
 * next-listing-job checks this flag and returns null when paused.
 *
 * Body: { warning_text, screenshot?, timestamp?, reason? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { warning_text, screenshot, timestamp, reason } = body;

  if (!warning_text && !reason) {
    return NextResponse.json(
      { error: "warning_text or reason required" },
      { status: 400 }
    );
  }

  const now = timestamp || new Date().toISOString();
  const message = warning_text || reason;

  await supabase.from("facebook_alerts").insert({
    alert_type: "warning_popup",
    message: `${message}${screenshot ? " [screenshot attached]" : ""}`,
  });

  await supabase
    .from("facebook_settings")
    .upsert({
      key: "facebook_paused",
      value: "true",
      updated_at: now,
    });

  await supabase.from("facebook_extension_logs").insert({
    log_level: "error",
    message: `WARNING DETECTED: ${message}`,
    occurred_at: now,
  });

  return NextResponse.json({
    status: "paused",
    message: "All activity paused. Resume from Boss dashboard.",
  });
}
