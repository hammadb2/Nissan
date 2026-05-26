import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // Get first day of month
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Jea's stats
  const { data: jeaDailyStats } = await supabase
    .from("daily_stats")
    .select("*")
    .eq("date", todayStr)
    .eq("user_role", "jea")
    .single();

  const callsMade = jeaDailyStats?.calls_made ?? 0;
  const callsTarget = 200;

  // Pace calculation: based on current time vs 6PM MST
  const now = new Date();
  const startHour = 9;
  const endHour = 18;
  const mstOffset = -6;
  const mstHour = (now.getUTCHours() + mstOffset + 24) % 24;
  const hoursWorked = Math.max(0, mstHour - startHour);
  const totalHours = endHour - startHour;
  const expectedProgress = totalHours > 0 ? hoursWorked / totalHours : 0;
  const actualProgress = callsTarget > 0 ? callsMade / callsTarget : 0;

  let paceStatus: "green" | "amber" | "red" = "green";
  if (actualProgress < expectedProgress * 0.7) paceStatus = "red";
  else if (actualProgress < expectedProgress * 0.9) paceStatus = "amber";

  // Dann's stats
  const { data: dannDailyStats } = await supabase
    .from("daily_stats")
    .select("*")
    .eq("date", todayStr)
    .eq("user_role", "dann")
    .single();

  const { count: listingsLive } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("status", "listed");

  const { count: newListingsToday } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .gte("listed_at", today.toISOString());

  // Pipeline stats - today
  const { data: todayAppointments } = await supabase
    .from("appointments")
    .select("*")
    .gte("scheduled_at", today.toISOString());

  const todayAppts = todayAppointments ?? [];
  const showedUp = todayAppts.filter((a) => a.showed_up === true).length;
  const closed = todayAppts.filter((a) => a.closed === true).length;
  const commissionToday = todayAppts
    .filter((a) => a.closed && a.commission_amount)
    .reduce((sum, a) => sum + (a.commission_amount ?? 0), 0);

  // Pipeline stats - month
  const { data: monthAppointments } = await supabase
    .from("appointments")
    .select("*")
    .gte("scheduled_at", monthStart.toISOString());

  const monthAppts = monthAppointments ?? [];
  const dealsClosed = monthAppts.filter((a) => a.closed === true).length;
  const closeRate = monthAppts.length > 0
    ? Math.round((dealsClosed / monthAppts.length) * 100)
    : 0;
  const totalCommission = monthAppts
    .filter((a) => a.closed && a.commission_amount)
    .reduce((sum, a) => sum + (a.commission_amount ?? 0), 0);

  return NextResponse.json({
    jea: {
      calls_made: callsMade,
      calls_target: callsTarget,
      calls_remaining: Math.max(0, callsTarget - callsMade),
      appointments_booked: jeaDailyStats?.appointments_booked ?? 0,
      hot_leads: jeaDailyStats?.hot_leads ?? 0,
      pace_status: paceStatus,
    },
    dann: {
      listings_live: listingsLive ?? 0,
      new_listings_today: newListingsToday ?? 0,
      listings_target: 35,
      inquiries_today: dannDailyStats?.phone_numbers_collected ?? 0,
      phone_numbers_collected: dannDailyStats?.phone_numbers_collected ?? 0,
      appointments_booked: dannDailyStats?.appointments_booked ?? 0,
    },
    pipeline: {
      total_appointments_today: todayAppts.length,
      showed_up: showedUp,
      closed,
      commission_today: commissionToday,
      total_appointments_month: monthAppts.length,
      close_rate_month: closeRate,
      deals_closed_month: dealsClosed,
      total_commission_month: totalCommission,
    },
  });
}
