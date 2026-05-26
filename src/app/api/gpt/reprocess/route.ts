import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeCall } from "@/lib/analyze-call";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const callRecordId = body.call_record_id;

  if (!callRecordId) {
    return NextResponse.json(
      { error: "call_record_id required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: callRecord, error } = await supabase
    .from("call_records")
    .select("*")
    .eq("id", callRecordId)
    .single();

  if (error || !callRecord) {
    return NextResponse.json(
      { error: "Call record not found" },
      { status: 404 }
    );
  }

  if (!callRecord.transcript) {
    return NextResponse.json(
      { error: "No transcript available for reprocessing" },
      { status: 400 }
    );
  }

  const analysis = await analyzeCall(callRecord.transcript, callRecord.quo_summary);

  await supabase
    .from("call_records")
    .update({
      gpt_summary: analysis.gpt_summary,
      crm_notes: analysis.crm_notes,
      outcome: analysis.outcome,
      sentiment: analysis.sentiment,
      interest_level: analysis.interest_level,
      next_action: analysis.next_action,
      next_action_at: analysis.next_action_at,
      next_action_details: analysis.next_action_details,
      what_went_well: analysis.what_went_well,
      coaching_tip: analysis.coaching_tip,
      is_recent_buyer_flag: analysis.is_recent_buyer,
      recent_buyer_flag_reason: analysis.recent_buyer_flag_reason,
      vehicle_ownership_duration: analysis.vehicle_ownership_duration,
      trade_in_available: analysis.trade_in_available,
      monthly_budget: analysis.monthly_budget,
      gpt_processed: true,
    })
    .eq("id", callRecordId);

  return NextResponse.json({ status: "reprocessed", analysis });
}
