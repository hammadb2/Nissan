import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const dayStart = `${today}T00:00:00.000Z`;
  const dayEnd = `${today}T23:59:59.999Z`;

  // Total calls today
  const { count: totalCallsToday } = await getSupabaseAdmin()
    .from("calls")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);

  // Appointments booked today
  const { count: appointmentsToday } = await getSupabaseAdmin()
    .from("calls")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .eq("next_action_type", "schedule_appointment");

  // Recent buyer flags today
  const { count: recentBuyerFlags } = await getSupabaseAdmin()
    .from("calls")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .eq("is_recent_buyer", true);

  // Get daily target
  const { data: target } = await getSupabaseAdmin()
    .from("daily_targets")
    .select("target_calls")
    .eq("target_date", today)
    .single();

  const targetCalls =
    target?.target_calls ??
    parseInt(process.env.NEXT_PUBLIC_DAILY_CALL_TARGET ?? "200", 10);

  const callsMade = totalCallsToday ?? 0;

  return NextResponse.json({
    totalCallsToday: callsMade,
    targetCalls,
    callsRemaining: Math.max(0, targetCalls - callsMade),
    appointmentsToday: appointmentsToday ?? 0,
    recentBuyerFlags: recentBuyerFlags ?? 0,
  });
}
