import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SLOTS_MON_THU = ["9:15 AM", "10:15 AM", "11:45 AM", "1:00 PM", "2:30 PM", "4:00 PM", "5:45 PM"];
const SLOTS_FRI_SAT = ["9:15 AM", "10:15 AM", "11:45 AM", "1:00 PM", "2:30 PM", "4:00 PM"];

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const daysAhead = parseInt(url.searchParams.get("days") ?? "14");

  // Get blackout dates
  const { data: blackouts } = await supabase
    .from("blackout_dates")
    .select("date, reason")
    .gte("date", new Date().toISOString().split("T")[0]);

  const blackoutSet = new Set((blackouts ?? []).map((b: { date: string }) => b.date));

  // Get existing appointments to mark booked slots
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysAhead);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("scheduled_at")
    .gte("scheduled_at", startDate.toISOString())
    .lte("scheduled_at", endDate.toISOString());

  const bookedSlots = new Set(
    (appointments ?? []).map((a: { scheduled_at: string }) => {
      const d = new Date(a.scheduled_at);
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
      const timeStr = d.toLocaleTimeString("en-US", {
        timeZone: "America/Edmonton",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return `${dateStr}|${timeStr}`;
    })
  );

  // Build available days
  const days: Array<{
    date: string;
    dayName: string;
    slots: Array<{ time: string; available: boolean }>;
    blackedOut: boolean;
    reason?: string;
  }> = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay(); // 0=Sun
    const dateStr = date.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
    const dayName = date.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "America/Edmonton",
    });

    if (dayOfWeek === 0) continue; // Sunday — closed

    const isBlackedOut = blackoutSet.has(dateStr);
    const blackoutEntry = (blackouts ?? []).find(
      (b: { date: string; reason?: string }) => b.date === dateStr
    );

    const slotTimes = dayOfWeek >= 1 && dayOfWeek <= 4 ? SLOTS_MON_THU : SLOTS_FRI_SAT;
    const slots = slotTimes.map((time) => ({
      time,
      available: !isBlackedOut && !bookedSlots.has(`${dateStr}|${time}`),
    }));

    days.push({
      date: dateStr,
      dayName,
      slots,
      blackedOut: isBlackedOut,
      reason: (blackoutEntry as { reason?: string } | undefined)?.reason ?? undefined,
    });
  }

  return NextResponse.json({
    days,
    blackout_dates: blackouts ?? [],
  });
}
