import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/extension-log
 *
 * Extension sends log entries for the audit trail.
 * Keeps the last 30 days of logs (old entries pruned on each write).
 *
 * Body: { log_level: "info"|"warning"|"error", message, timestamp? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { log_level, message, timestamp } = body;

  if (!log_level || !message) {
    return NextResponse.json(
      { error: "log_level and message required" },
      { status: 400 }
    );
  }

  if (!["info", "warning", "error"].includes(log_level)) {
    return NextResponse.json(
      { error: "log_level must be info, warning, or error" },
      { status: 400 }
    );
  }

  const occurredAt = timestamp || new Date().toISOString();

  const { error: insertErr } = await supabase
    .from("facebook_extension_logs")
    .insert({
      log_level,
      message,
      occurred_at: occurredAt,
    });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  await supabase
    .from("facebook_extension_logs")
    .delete()
    .lt("occurred_at", thirtyDaysAgo.toISOString());

  return NextResponse.json({ status: "logged" });
}
