import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateWeeklyReport } from "@/lib/analyze-call";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agentName = (body.agent_name as string) ?? "Jea";

    // Calculate week range (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Fetch all calls for this week
    const { data: calls, error } = await getSupabaseAdmin()
      .from("calls")
      .select(
        "ai_summary, coaching_positive, coaching_improvement, next_action_type, is_recent_buyer, created_at"
      )
      .eq("agent_name", agentName)
      .gte("created_at", weekStart.toISOString())
      .lte("created_at", weekEnd.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!calls || calls.length === 0) {
      return NextResponse.json(
        { error: "No calls found for this week" },
        { status: 404 }
      );
    }

    const reportContent = await generateWeeklyReport(calls, agentName);

    const appointmentsBooked = calls.filter(
      (c) => c.next_action_type === "schedule_appointment"
    ).length;
    const recentBuyerFlags = calls.filter((c) => c.is_recent_buyer).length;

    // Save the report
    const { data: report, error: saveError } = await getSupabaseAdmin()
      .from("weekly_reports")
      .insert({
        agent_name: agentName,
        week_start: weekStart.toISOString().split("T")[0],
        week_end: weekEnd.toISOString().split("T")[0],
        report_content: reportContent,
        total_calls: calls.length,
        appointments_booked: appointmentsBooked,
        recent_buyer_flags: recentBuyerFlags,
      })
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Weekly report error:", error);
    return NextResponse.json(
      { error: "Failed to generate weekly report" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("weekly_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reports: data });
}
