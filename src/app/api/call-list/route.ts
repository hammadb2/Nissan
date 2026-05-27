import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DAILY_LIMIT = 200;

/**
 * GET /api/call-list — Returns today's call list (max 200/day).
 *
 * Assignment logic:
 * 1. Contacts assigned to previous days that were never called are returned
 *    to the pool (assigned_call_date cleared).
 * 2. 200 fresh untouched leads are pulled from the pool each day.
 * 3. Contacts are sorted: callbacks first, hot, warm, then rest.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const showCalled = searchParams.get("showCalled") === "true";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();
  const todayDate = todayISO.split("T")[0]; // YYYY-MM-DD

  // --- Step 1: Return uncalled contacts from previous days to the pool ---
  await supabase
    .from("contacts")
    .update({ assigned_call_date: null })
    .eq("status", "active")
    .lt("assigned_call_date", todayDate)
    .eq("call_count", 0);

  // --- Step 2: Count how many are already assigned to today ---
  const { count: assignedToday } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("assigned_call_date", todayDate);

  const currentAssigned = assignedToday ?? 0;
  const slotsAvailable = Math.max(0, DAILY_LIMIT - currentAssigned);

  // --- Step 3: Assign new contacts to fill remaining slots ---
  if (slotsAvailable > 0) {
    const { data: unassigned } = await supabase
      .from("contacts")
      .select("id")
      .eq("status", "active")
      .is("assigned_call_date", null)
      .eq("call_count", 0)
      .order("created_at", { ascending: true })
      .limit(slotsAvailable);

    if (unassigned && unassigned.length > 0) {
      const ids = unassigned.map((c) => c.id);
      await supabase
        .from("contacts")
        .update({ assigned_call_date: todayDate })
        .in("id", ids);
    }
  }

  // --- Step 4: Fetch today's assigned contacts (hard cap at 200) ---
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("assigned_call_date", todayDate)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(DAILY_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // --- Step 5: Get ALL today's call records (not just linked ones) ---
  const { data: todayCalls } = await supabase
    .from("call_records")
    .select("id, contact_id, outcome, gpt_summary, quo_summary, called_at, duration_seconds")
    .gte("called_at", todayISO);

  // Build map of contact_id -> most recent call result
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

  // Total calls today from call_records (accurate count regardless of contact linking)
  const totalCallsToday = (todayCalls ?? []).length;

  // --- Step 6: Filter and sort ---
  const now = new Date();
  const filtered = (contacts ?? []).filter((c) => {
    if (c.do_not_call_until && new Date(c.do_not_call_until) > now) return false;
    if (c.status === "dnc" || c.status === "recent_buyer") return false;
    const wasCalled = calledMap.has(c.id);
    if (!showCalled && wasCalled) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    // Callback contacts first
    if (a.next_action === "callback" && b.next_action !== "callback") return -1;
    if (a.next_action !== "callback" && b.next_action === "callback") return 1;
    if (a.interest_level === "hot" && b.interest_level !== "hot") return -1;
    if (a.interest_level !== "hot" && b.interest_level === "hot") return 1;
    if (a.interest_level === "warm" && b.interest_level !== "warm") return -1;
    if (a.interest_level !== "warm" && b.interest_level === "warm") return 1;
    if (a.call_count === 0 && b.call_count > 0) return -1;
    if (a.call_count > 0 && b.call_count === 0) return 1;
    return 0;
  });

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

  // Count contacts that were called today (linked to contacts in list)
  const calledContactsCount = calledMap.size;

  // --- Step 7: Get total pool stats ---
  const { count: totalPool } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .is("assigned_call_date", null)
    .eq("call_count", 0);

  return NextResponse.json({
    contacts: list,
    total: list.length,
    calledToday: calledContactsCount,
    callsToday: totalCallsToday,
    dailyLimit: DAILY_LIMIT,
    remainingPool: totalPool ?? 0,
  });
}
