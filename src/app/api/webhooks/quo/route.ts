import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeCall } from "@/lib/analyze-call";
import type {
  QuoWebhookPayload,
  QuoDialogueEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function dialogueToTranscript(dialogue: QuoDialogueEntry[]): string {
  return dialogue
    .map((entry) => {
      const speaker = entry.userId ? "Agent" : entry.identifier ?? "Customer";
      return `${speaker}: ${entry.content}`;
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as QuoWebhookPayload;
    const db = getSupabaseAdmin();

    if (payload.type === "call.transcript.completed") {
      const { resource, context } = payload.data;
      const callId = resource.callId;

      if (resource.processingStatus !== "completed" || !resource.dialogue) {
        return NextResponse.json({ success: true, skipped: true });
      }

      const transcript = dialogueToTranscript(resource.dialogue);
      const customerPhone =
        context.participants.external[0] ?? null;

      // Upsert call record
      const { data: existing } = await db
        .from("calls")
        .select("id")
        .eq("quo_call_id", callId)
        .single();

      const callData = {
        quo_call_id: callId,
        transcript,
        transcript_received: true,
        customer_phone: customerPhone,
        call_duration_seconds: resource.duration,
        call_started_at: resource.createdAt,
        updated_at: new Date().toISOString(),
      };

      let recordId: string;

      if (existing) {
        await db.from("calls").update(callData).eq("id", existing.id);
        recordId = existing.id;
      } else {
        const { data: inserted } = await db
          .from("calls")
          .insert(callData)
          .select("id")
          .single();
        recordId = inserted?.id ?? "";
      }

      // Try to analyze if we have the transcript now
      await tryAnalyze(db, recordId, callId);

    } else if (payload.type === "call.summary.completed") {
      const { resource, context } = payload.data;
      const callId = resource.callId;

      if (resource.processingStatus !== "completed") {
        return NextResponse.json({ success: true, skipped: true });
      }

      const summaryText = [
        ...(resource.summary ?? []),
        ...(resource.nextSteps?.map((s) => `Next: ${s}`) ?? []),
      ].join("\n");

      const customerPhone =
        context.participants.external[0] ?? null;

      // Upsert call record
      const { data: existing } = await db
        .from("calls")
        .select("id")
        .eq("quo_call_id", callId)
        .single();

      const callData = {
        quo_call_id: callId,
        quo_summary: summaryText,
        summary_received: true,
        customer_phone: customerPhone,
        updated_at: new Date().toISOString(),
      };

      let recordId: string;

      if (existing) {
        await db.from("calls").update(callData).eq("id", existing.id);
        recordId = existing.id;
      } else {
        const { data: inserted } = await db
          .from("calls")
          .insert(callData)
          .select("id")
          .single();
        recordId = inserted?.id ?? "";
      }

      // Try to analyze if we have the transcript now
      await tryAnalyze(db, recordId, callId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

async function tryAnalyze(
  db: ReturnType<typeof getSupabaseAdmin>,
  recordId: string,
  callId: string
) {
  // Re-fetch the call to check if transcript is available for analysis
  const { data: call } = await db
    .from("calls")
    .select("*")
    .eq("quo_call_id", callId)
    .single();

  if (!call?.transcript || call.analyzed_at) return;

  // Check for recent buyer
  let isRecentBuyer = false;
  let purchaseDate: string | null = null;

  if (call.customer_phone) {
    const { data: customer } = await db
      .from("customers")
      .select("purchase_date")
      .eq("phone", call.customer_phone)
      .order("purchase_date", { ascending: false })
      .limit(1)
      .single();

    if (customer?.purchase_date) {
      const purchaseDateObj = new Date(customer.purchase_date);
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      if (purchaseDateObj > twelveMonthsAgo) {
        isRecentBuyer = true;
        purchaseDate = customer.purchase_date;
      }
    }
  }

  // Run AI analysis
  try {
    const analysis = await analyzeCall(call.transcript, call.quo_summary);

    await db
      .from("calls")
      .update({
        ai_summary: analysis.ai_summary,
        crm_notes: analysis.crm_notes,
        next_action_type: analysis.next_action_type,
        next_action_date: analysis.next_action_date,
        next_action_details: analysis.next_action_details,
        coaching_positive: analysis.coaching_positive,
        coaching_improvement: analysis.coaching_improvement,
        is_recent_buyer: isRecentBuyer,
        purchase_date: purchaseDate,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);
  } catch (aiError) {
    console.error("AI analysis failed:", aiError);
    await db
      .from("calls")
      .update({
        is_recent_buyer: isRecentBuyer,
        purchase_date: purchaseDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);
  }
}
