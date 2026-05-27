import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendSMS } from "@/lib/quo-api";
import { generateFollowUpSMS } from "@/lib/sms-ai";

export const dynamic = "force-dynamic";

/**
 * POST /api/sms/follow-up
 *
 * Cron-triggered: sends follow-up SMS messages for conversations
 * that have not received a reply.
 *
 * Follow-up 1: 72 hours after initial SMS
 * Follow-up 2: 48 hours after first follow-up (120h total)
 * After follow-up 2 with no reply: mark as no_reply
 */
export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const results = { followup1: 0, followup2: 0, marked_no_reply: 0, errors: 0 };

    // --- Follow-up 1: Conversations 72+ hours old with no reply and no follow-up sent ---
    const followup1Cutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

    const { data: needsFollowup1 } = await supabase
      .from("sms_conversations")
      .select("*, contacts(*)")
      .eq("status", "awaiting_reply")
      .is("first_followup_sent_at", null)
      .is("customer_replied_at", null)
      .lt("initial_sms_sent_at", followup1Cutoff);

    if (needsFollowup1) {
      for (const conv of needsFollowup1) {
        try {
          const contact = conv.contacts;
          if (!contact) continue;

          // Get the first message we sent
          const { data: firstMsg } = await supabase
            .from("sms_messages")
            .select("content")
            .eq("conversation_id", conv.id)
            .eq("direction", "outbound")
            .order("created_at", { ascending: true })
            .limit(1)
            .single();

          const followupText = await generateFollowUpSMS(
            {
              firstName: contact.first_name,
              lastName: contact.last_name,
              phone: contact.phone,
              vehicleYear: contact.vehicle_year,
              vehicleMake: contact.vehicle_make,
              vehicleModel: contact.vehicle_model,
              callNotes: null,
              callSummary: null,
              interestLevel: contact.interest_level,
              vehicleOwnershipDuration: contact.vehicle_ownership_duration,
              tradeInAvailable: contact.trade_in_available,
              monthlyBudget: contact.monthly_budget,
            },
            firstMsg?.content ?? ""
          );

          await sendSMS(conv.phone_number_id, contact.phone, followupText);

          await supabase
            .from("sms_conversations")
            .update({
              first_followup_sent_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", conv.id);

          await supabase.from("sms_messages").insert({
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            direction: "outbound",
            content: followupText,
            sent_by: "ai",
          });

          results.followup1++;
        } catch (err) {
          console.error(`Follow-up 1 failed for conversation ${conv.id}:`, err);
          results.errors++;
        }
      }
    }

    // --- Follow-up 2: Conversations 48+ hours after first follow-up with no reply ---
    const followup2Cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    const { data: needsFollowup2 } = await supabase
      .from("sms_conversations")
      .select("*, contacts(*)")
      .eq("status", "awaiting_reply")
      .not("first_followup_sent_at", "is", null)
      .is("second_followup_sent_at", null)
      .is("customer_replied_at", null)
      .lt("first_followup_sent_at", followup2Cutoff);

    if (needsFollowup2) {
      for (const conv of needsFollowup2) {
        try {
          const contact = conv.contacts;
          if (!contact) continue;

          // Get the first message for context
          const { data: firstMsg } = await supabase
            .from("sms_messages")
            .select("content")
            .eq("conversation_id", conv.id)
            .eq("direction", "outbound")
            .order("created_at", { ascending: true })
            .limit(1)
            .single();

          const followupText = await generateFollowUpSMS(
            {
              firstName: contact.first_name,
              lastName: contact.last_name,
              phone: contact.phone,
              vehicleYear: contact.vehicle_year,
              vehicleMake: contact.vehicle_make,
              vehicleModel: contact.vehicle_model,
              callNotes: null,
              callSummary: null,
              interestLevel: contact.interest_level,
              vehicleOwnershipDuration: contact.vehicle_ownership_duration,
              tradeInAvailable: contact.trade_in_available,
              monthlyBudget: contact.monthly_budget,
            },
            firstMsg?.content ?? ""
          );

          await sendSMS(conv.phone_number_id, contact.phone, followupText);

          // Set recirculation date: 7 days from now
          const recirculateAfter = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          await supabase
            .from("sms_conversations")
            .update({
              second_followup_sent_at: now.toISOString(),
              status: "no_reply",
              recirculate_after: recirculateAfter.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", conv.id);

          await supabase.from("sms_messages").insert({
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            direction: "outbound",
            content: followupText,
            sent_by: "ai",
          });

          results.followup2++;
          results.marked_no_reply++;
        } catch (err) {
          console.error(`Follow-up 2 failed for conversation ${conv.id}:`, err);
          results.errors++;
        }
      }
    }

    return NextResponse.json({ status: "ok", results });
  } catch (error) {
    console.error("SMS follow-up cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Follow-up failed" },
      { status: 500 }
    );
  }
}
