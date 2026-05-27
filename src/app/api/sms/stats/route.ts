import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SMSStats } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/sms/stats
 *
 * Returns SMS conversation metrics for the boss dashboard.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Active conversations (awaiting_reply or active)
    const { count: activeConversations } = await supabase
      .from("sms_conversations")
      .select("*", { count: "exact", head: true })
      .in("status", ["awaiting_reply", "active"]);

    // Replies received today
    const { count: repliesToday } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("direction", "inbound")
      .gte("created_at", todayISO);

    // Appointments booked by AI (all time for conversations)
    const { count: appointmentsBookedByAI } = await supabase
      .from("sms_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "booked");

    // Flagged for human takeover
    const { count: flaggedForHuman } = await supabase
      .from("sms_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "flagged_hot");

    // Awaiting reply
    const { count: awaitingReply } = await supabase
      .from("sms_conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "awaiting_reply");

    // Total SMS sent today
    const { count: totalSentToday } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("direction", "outbound")
      .gte("created_at", todayISO);

    const stats: SMSStats = {
      active_conversations: activeConversations ?? 0,
      replies_today: repliesToday ?? 0,
      appointments_booked_by_ai: appointmentsBookedByAI ?? 0,
      flagged_for_human: flaggedForHuman ?? 0,
      awaiting_reply: awaitingReply ?? 0,
      total_sent_today: totalSentToday ?? 0,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("SMS stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
