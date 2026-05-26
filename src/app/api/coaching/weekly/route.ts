import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateWeeklyReport } from "@/lib/analyze-call";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  // Get last 7 days of calls
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: calls, error } = await supabase
    .from("call_records")
    .select(
      "gpt_summary, what_went_well, coaching_tip, outcome, interest_level, is_recent_buyer_flag, created_at"
    )
    .gte("called_at", weekAgo.toISOString())
    .eq("gpt_processed", true)
    .order("called_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!calls || calls.length === 0) {
    return NextResponse.json({
      report: "No calls processed this week.",
      call_count: 0,
    });
  }

  const report = await generateWeeklyReport(calls, "Jea");

  return NextResponse.json({
    report,
    call_count: calls.length,
    week_start: weekAgo.toISOString(),
    week_end: new Date().toISOString(),
  });
}
