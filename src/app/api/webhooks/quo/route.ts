import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeCall } from "@/lib/analyze-call";
import type {
  QuoWebhookPayload,
  QuoDialogueEntry,
} from "@/lib/types";
import { normalizePhone } from "@/lib/phone";
import { listPhoneNumbers, sendSMS } from "@/lib/quo-api";

export const dynamic = "force-dynamic";

function dialogueToTranscript(dialogue: QuoDialogueEntry[]): string {
  return dialogue
    .map((entry) => {
      const speaker = entry.userId ? "Agent" : entry.identifier ?? "Customer";
      return `${speaker}: ${entry.content}`;
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QuoWebhookPayload;
    const eventType = body.type;

    // Handle incoming SMS for appointment confirmation
    if (eventType === "message.received") {
      return handleIncomingSMS(body);
    }

    if (
      eventType !== "call.transcript.completed" &&
      eventType !== "call.summary.completed"
    ) {
      return NextResponse.json({ status: "ignored", event: eventType });
    }

    const supabase = getSupabaseAdmin();
    const callId = body.data.resource.callId;
    const context = body.data.context;

    const externalParticipant = context.participants?.external?.[0];
    const customerPhone = externalParticipant?.identifier
      ? normalizePhone(externalParticipant.identifier)
      : null;

    // Look up contact by phone
    let contactId: string | null = null;
    if (customerPhone) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone", customerPhone)
        .single();
      contactId = contact?.id ?? null;
    }

    if (eventType === "call.transcript.completed") {
      const resource = body.data.resource;
      const dialogue = resource.dialogue;
      const transcript = dialogue ? dialogueToTranscript(dialogue) : null;

      await supabase
        .from("call_records")
        .upsert(
          {
            quo_call_id: callId,
            contact_id: contactId,
            duration_seconds: resource.duration ?? null,
            called_at: resource.createdAt ?? new Date().toISOString(),
            transcript,
            transcript_received: true,
          },
          { onConflict: "quo_call_id" }
        );
    }

    if (eventType === "call.summary.completed") {
      const resource = body.data.resource;
      const summaryParts = resource.summary ?? [];
      const nextStepsParts = resource.nextSteps ?? [];
      const quoSummary = [...summaryParts, ...nextStepsParts].join("\n");

      await supabase
        .from("call_records")
        .upsert(
          {
            quo_call_id: callId,
            contact_id: contactId,
            called_at: new Date().toISOString(),
            quo_summary: quoSummary || null,
            summary_received: true,
          },
          { onConflict: "quo_call_id" }
        );
    }

    // Check if both transcript and summary are present
    const { data: callRecord } = await supabase
      .from("call_records")
      .select("*")
      .eq("quo_call_id", callId)
      .single();

    if (
      callRecord &&
      callRecord.transcript_received &&
      callRecord.transcript &&
      !callRecord.gpt_processed
    ) {
      try {
        const analysis = await analyzeCall(
          callRecord.transcript,
          callRecord.quo_summary
        );

        // Update call record with GPT analysis
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
          .eq("id", callRecord.id);

        // Update contact record with extracted intelligence
        if (contactId) {
          const contactUpdate: Record<string, unknown> = {
            call_count: undefined,
            last_called_at: new Date().toISOString(),
            interest_level: analysis.interest_level,
            next_action: analysis.next_action,
            next_action_at: analysis.next_action_at,
            updated_at: new Date().toISOString(),
          };

          if (analysis.vehicle_ownership_duration) {
            contactUpdate.vehicle_ownership_duration = analysis.vehicle_ownership_duration;
          }
          if (analysis.trade_in_available !== null) {
            contactUpdate.trade_in_available = analysis.trade_in_available;
          }
          if (analysis.monthly_budget) {
            contactUpdate.monthly_budget = analysis.monthly_budget;
          }
          if (analysis.is_recent_buyer) {
            contactUpdate.is_recent_buyer = true;
            contactUpdate.status = "recent_buyer";
            const sixMonthsFromNow = new Date();
            sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
            contactUpdate.do_not_call_until = sixMonthsFromNow.toISOString().split("T")[0];
          }
          if (analysis.outcome === "booked") {
            contactUpdate.status = "appointment_booked";
          }
          if (analysis.outcome === "dnc") {
            contactUpdate.status = "dnc";
          }

          delete contactUpdate.call_count;
          await supabase
            .from("contacts")
            .update(contactUpdate)
            .eq("id", contactId);

          // Increment call count
          const { data: currentContact } = await supabase
            .from("contacts")
            .select("call_count")
            .eq("id", contactId)
            .single();
          if (currentContact) {
            await supabase
              .from("contacts")
              .update({ call_count: (currentContact.call_count ?? 0) + 1 })
              .eq("id", contactId);
          }
        }

        // Create task if GPT recommends follow-up
        if (analysis.next_action !== "no_action" && analysis.next_action_at) {
          await supabase.from("tasks").insert({
            contact_id: contactId,
            call_record_id: callRecord.id,
            assigned_to: "jea",
            task_type: analysis.next_action,
            due_at: analysis.next_action_at,
            details: analysis.next_action_details,
          });
        }

        // Increment daily stats
        const today = new Date().toISOString().split("T")[0];
        const { data: existingStats } = await supabase
          .from("daily_stats")
          .select("*")
          .eq("date", today)
          .eq("user_role", "jea")
          .single();

        if (existingStats) {
          const updates: Record<string, number> = {
            calls_made: (existingStats.calls_made ?? 0) + 1,
          };
          if (analysis.outcome === "booked") {
            updates.appointments_booked = (existingStats.appointments_booked ?? 0) + 1;
          }
          if (analysis.interest_level === "hot" && analysis.outcome !== "booked") {
            updates.hot_leads = (existingStats.hot_leads ?? 0) + 1;
          }
          await supabase
            .from("daily_stats")
            .update(updates)
            .eq("id", existingStats.id);
        } else {
          await supabase.from("daily_stats").insert({
            date: today,
            user_role: "jea",
            calls_made: 1,
            appointments_booked: analysis.outcome === "booked" ? 1 : 0,
            hot_leads: analysis.interest_level === "hot" && analysis.outcome !== "booked" ? 1 : 0,
          });
        }
      } catch (analysisError) {
        console.error("GPT-4o analysis failed:", analysisError);
      }
    }

    return NextResponse.json({ status: "ok", callId });
  } catch (error) {
    console.error("Quo webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleIncomingSMS(
  body: QuoWebhookPayload
): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();
    if (body.type !== "message.received") {
      return NextResponse.json({ status: "ignored" });
    }
    const resource = body.data.resource;
    const messageBody = resource.body;
    const from = resource.from;

    if (!messageBody || !from) {
      return NextResponse.json({ status: "ignored", reason: "no body or from" });
    }

    const trimmed = messageBody.trim().toUpperCase();
    if (trimmed !== "C") {
      return NextResponse.json({ status: "ignored", reason: "not a confirmation" });
    }

    const normalizedFrom = normalizePhone(from);

    // Find the most recent unconfirmed appointment for this phone
    const { data: appointment } = await supabase
      .from("appointments")
      .select("*")
      .eq("customer_phone", normalizedFrom)
      .eq("confirmed", false)
      .eq("sms_sent", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!appointment) {
      return NextResponse.json({ status: "ignored", reason: "no matching appointment" });
    }

    // Mark as confirmed
    await supabase
      .from("appointments")
      .update({
        confirmed: true,
        sms_confirmed_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);

    // Send confirmation SMS
    try {
      const scheduledAt = new Date(appointment.scheduled_at);
      const dateStr = scheduledAt.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "America/Edmonton",
      });
      const timeStr = scheduledAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Edmonton",
      });

      const confirmMsg =
        `Appointment confirmed! ${dateStr} at ${timeStr} ` +
        `-South Trail Nissan with Hammad ` +
        `We look forward to seeing you!`;

      const phoneNumbers = await listPhoneNumbers();
      if (phoneNumbers.length > 0) {
        await sendSMS(phoneNumbers[0].id, normalizedFrom, confirmMsg);
      }
    } catch (smsError) {
      console.error("Confirmation SMS send failed:", smsError);
    }

    return NextResponse.json({ status: "confirmed", appointmentId: appointment.id });
  } catch (error) {
    console.error("SMS confirmation error:", error);
    return NextResponse.json({ error: "Failed to process SMS" }, { status: 500 });
  }
}
