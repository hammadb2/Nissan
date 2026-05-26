import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/call-list — Returns today's call list.
 * Contacts are sorted: callbacks/tasks first, hot leads, warm, then rest.
 * Excludes DNC contacts and those already called today.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const showCalled = searchParams.get("showCalled") === "true";

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // Get all active contacts
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get today's call records to know who was already called
  const { data: todayCalls } = await supabase
    .from("call_records")
    .select("contact_id, outcome, gpt_summary, quo_summary, called_at, duration_seconds")
    .gte("called_at", todayISO);

  const calledMap = new Map<string, {
    outcome: string | null;
    summary: string | null;
    calledAt: string;
    duration: number | null;
  }>();
  for (const call of todayCalls ?? []) {
    if (call.contact_id) {
      const existing = calledMap.get(call.contact_id);
      if (!existing || new Date(call.called_at) > new Date(existing.calledAt)) {
        calledMap.set(call.contact_id, {
          outcome: call.outcome,
          summary: call.gpt_summary ?? call.quo_summary,
          calledAt: call.called_at,
          duration: call.duration_seconds,
        });
      }
    }
  }

  // Filter out DNC contacts
  const now = new Date();
  const filtered = (contacts ?? []).filter((c) => {
    if (c.do_not_call_until && new Date(c.do_not_call_until) > now) return false;
    if (c.status === "dnc" || c.status === "recent_buyer") return false;
    const wasCalled = calledMap.has(c.id);
    if (!showCalled && wasCalled) return false;
    return true;
  });

  // Sort: callbacks first, hot leads, warm, cold, rest
  const sorted = filtered.sort((a, b) => {
    // Callbacks first
    if (a.next_action === "callback" && b.next_action !== "callback") return -1;
    if (a.next_action !== "callback" && b.next_action === "callback") return 1;

    // Hot leads
    if (a.interest_level === "hot" && b.interest_level !== "hot") return -1;
    if (a.interest_level !== "hot" && b.interest_level === "hot") return 1;

    // Warm leads
    if (a.interest_level === "warm" && b.interest_level !== "warm") return -1;
    if (a.interest_level !== "warm" && b.interest_level === "warm") return 1;

    // Never called first
    if (a.call_count === 0 && b.call_count > 0) return -1;
    if (a.call_count > 0 && b.call_count === 0) return 1;

    return 0;
  });

  // Build response with called status
  const list = sorted.map((c) => {
    const callResult = calledMap.get(c.id);
    return {
      ...c,
      called_today: !!callResult,
      today_outcome: callResult?.outcome ?? null,
      today_summary: callResult?.summary ?? null,
      today_called_at: callResult?.calledAt ?? null,
      today_duration: callResult?.duration ?? null,
    };
  });

  return NextResponse.json({
    contacts: list,
    total: list.length,
    calledToday: calledMap.size,
  });
}
