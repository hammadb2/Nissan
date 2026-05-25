import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeCall } from "@/lib/analyze-call";
import type { QuoWebhookPayload } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as QuoWebhookPayload;
    const callId = payload.call_id ?? crypto.randomUUID();

    // Check if call record already exists
    const { data: existing } = await getSupabaseAdmin()
      .from("calls")
      .select("id, transcript, quo_summary, transcript_received, summary_received")
      .eq("quo_call_id", callId)
      .single();

    if (payload.type === "transcript") {
      // Upsert call with transcript
      const updateData = {
        quo_call_id: callId,
        transcript: payload.transcript,
        transcript_received: true,
        customer_name: payload.caller_name ?? null,
        customer_phone: payload.caller_phone ?? null,
        agent_name: payload.agent_name ?? "Jea",
        call_duration_seconds: payload.duration_seconds ?? null,
        call_started_at: payload.started_at ?? null,
        call_ended_at: payload.ended_at ?? null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await getSupabaseAdmin()
          .from("calls")
          .update(updateData)
          .eq("id", existing.id);
      } else {
        await getSupabaseAdmin().from("calls").insert(updateData);
      }
    } else if (payload.type === "summary") {
      // Upsert call with summary
      const updateData = {
        quo_call_id: callId,
        quo_summary: payload.summary,
        summary_received: true,
        customer_name: payload.caller_name ?? existing?.transcript ? undefined : (payload.caller_name ?? null),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await getSupabaseAdmin()
          .from("calls")
          .update(updateData)
          .eq("id", existing.id);
      } else {
        await getSupabaseAdmin().from("calls").insert({
          ...updateData,
          quo_call_id: callId,
          agent_name: payload.agent_name ?? "Jea",
        });
      }
    }

    // Re-fetch the call to check if both parts are in
    const { data: call } = await getSupabaseAdmin()
      .from("calls")
      .select("*")
      .eq("quo_call_id", callId)
      .single();

    if (call?.transcript && !call.analyzed_at) {
      // Check for recent buyer
      let isRecentBuyer = false;
      let purchaseDate: string | null = null;

      if (call.customer_phone) {
        const { data: customer } = await getSupabaseAdmin()
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
        const analysis = await analyzeCall(
          call.transcript,
          call.quo_summary
        );

        await getSupabaseAdmin()
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
          .eq("id", call.id);
      } catch (aiError) {
        console.error("AI analysis failed:", aiError);
        // Still save the recent buyer flag even if AI fails
        await getSupabaseAdmin()
          .from("calls")
          .update({
            is_recent_buyer: isRecentBuyer,
            purchase_date: purchaseDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", call.id);
      }
    }

    return NextResponse.json({ success: true, call_id: callId });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
