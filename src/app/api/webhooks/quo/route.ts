import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeCall } from "@/lib/analyze-call";
import type {
  QuoWebhookPayload,
  QuoDialogueEntry,
} from "@/lib/types";
import { normalizePhone } from "@/lib/phone";
import { listPhoneNumbers, sendSMS } from "@/lib/quo-api";
import { generateConversationReply } from "@/lib/sms-ai";

export const dynamic = "force-dynamic";

/**
 * Extract the external phone number from a Quo webhook context.
 * Handles both legacy format ({ identifier: string }) and beta format (string).
 */
function getExternalPhone(context: QuoWebhookPayload["data"]["context"]): string | null {
  const ext = context.participants?.external?.[0];
  if (!ext) return null;
  if (typeof ext === "string") return ext;
  if (typeof ext === "object" && "identifier" in ext) return ext.identifier;
  return null;
}

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

    // Handle call.completed — immediately create a call record when a call ends
    if (eventType === "call.completed") {
      return handleCallCompleted(body);
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

    const externalRaw = getExternalPhone(context);
    const customerPhone = externalRaw ? normalizePhone(externalRaw) : null;

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
          // Check if the contact is manually tagged as callback — preserve it
          const { data: existingContact } = await supabase
            .from("contacts")
            .select("next_action")
            .eq("id", contactId)
            .single();

          const contactUpdate: Record<string, unknown> = {
            call_count: undefined,
            last_called_at: new Date().toISOString(),
            interest_level: analysis.interest_level,
            updated_at: new Date().toISOString(),
          };

          // Only update next_action if contact isn't manually set to callback,
          // or if GPT also says callback, or if the outcome is "booked"
          if (
            existingContact?.next_action !== "callback" ||
            analysis.next_action === "callback" ||
            analysis.outcome === "booked"
          ) {
            contactUpdate.next_action = analysis.next_action;
            contactUpdate.next_action_at = analysis.next_action_at;
          }

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
          if (analysis.outcome === "wrong_number") {
            contactUpdate.status = "closed";
            contactUpdate.assigned_call_date = null;
            contactUpdate.next_action = "no_action";
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
        // Auto-trigger SMS follow-up for voicemails
        if (analysis.outcome === "voicemail" && contactId) {
          try {
            const baseUrl = process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
            await fetch(`${baseUrl}/api/sms/trigger`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId,
                callRecordId: callRecord.id,
              }),
            });
          } catch (smsErr) {
            console.error("Auto SMS trigger failed:", smsErr);
          }
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

    const normalizedFrom = normalizePhone(from);
    const trimmed = messageBody.trim().toUpperCase();

    // Check for appointment confirmation first ("C")
    if (trimmed === "C") {
      const { data: appointment } = await supabase
        .from("appointments")
        .select("*")
        .eq("customer_phone", normalizedFrom)
        .eq("confirmed", false)
        .eq("sms_sent", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (appointment) {
        await supabase
          .from("appointments")
          .update({
            confirmed: true,
            sms_confirmed_at: new Date().toISOString(),
          })
          .eq("id", appointment.id);

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
      }
    }

    // Check for active AI SMS conversation
    return handleAISMSReply(normalizedFrom, messageBody, resource.id);
  } catch (error) {
    console.error("SMS handling error:", error);
    return NextResponse.json({ error: "Failed to process SMS" }, { status: 500 });
  }
}

/**
 * Handle an inbound SMS that is part of an AI conversation.
 * Reads conversation history, generates AI reply, sends it, and takes action.
 */
async function handleAISMSReply(
  normalizedFrom: string,
  messageBody: string,
  quoMessageId: string | null
): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();

  // Find contact by phone
  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("phone", normalizedFrom)
    .single();

  if (!contact) {
    return NextResponse.json({ status: "ignored", reason: "unknown sender" });
  }

  // Find active SMS conversation for this contact
  const { data: conversation } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("contact_id", contact.id)
    .in("status", ["awaiting_reply", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!conversation) {
    return NextResponse.json({ status: "ignored", reason: "no active conversation" });
  }

  const now = new Date().toISOString();

  // Store the inbound message
  await supabase.from("sms_messages").insert({
    conversation_id: conversation.id,
    contact_id: contact.id,
    direction: "inbound",
    content: messageBody,
    sent_by: "ai",
    quo_message_id: quoMessageId,
  });

  // Update conversation status
  await supabase
    .from("sms_conversations")
    .update({
      status: "active",
      customer_replied_at: conversation.customer_replied_at ?? now,
      updated_at: now,
    })
    .eq("id", conversation.id);

  // Load full conversation history
  const { data: messages } = await supabase
    .from("sms_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  const history = (messages ?? []).map((m) => ({
    role: m.direction === "inbound" ? "customer" as const : "ai" as const,
    content: m.content,
    created_at: m.created_at,
  }));

  // Generate AI reply
  const aiResult = await generateConversationReply(
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
    history
  );

  // Send AI reply via Quo
  await sendSMS(conversation.phone_number_id, contact.phone, aiResult.message);

  // Store outbound reply
  await supabase.from("sms_messages").insert({
    conversation_id: conversation.id,
    contact_id: contact.id,
    direction: "outbound",
    content: aiResult.message,
    sent_by: "ai",
  });

  // Update contact with extracted info
  if (aiResult.extractedInfo) {
    const contactUpdate: Record<string, unknown> = { updated_at: now };
    if (aiResult.extractedInfo.vehicleOwnershipDuration) {
      contactUpdate.vehicle_ownership_duration = aiResult.extractedInfo.vehicleOwnershipDuration;
    }
    if (aiResult.extractedInfo.tradeInAvailable !== undefined) {
      contactUpdate.trade_in_available = aiResult.extractedInfo.tradeInAvailable;
    }
    if (aiResult.extractedInfo.monthlyBudget) {
      contactUpdate.monthly_budget = aiResult.extractedInfo.monthlyBudget;
    }
    await supabase.from("contacts").update(contactUpdate).eq("id", contact.id);

    // Merge extracted info into conversation record
    const existingInfo = (conversation.ai_extracted_info as Record<string, unknown>) ?? {};
    await supabase
      .from("sms_conversations")
      .update({
        ai_extracted_info: { ...existingInfo, ...aiResult.extractedInfo },
        updated_at: now,
      })
      .eq("id", conversation.id);
  }

  // Handle actions
  if (aiResult.action === "book_appointment" && aiResult.appointmentDetails) {
    const details = aiResult.appointmentDetails;
    const { data: newAppt } = await supabase
      .from("appointments")
      .insert({
        contact_id: contact.id,
        customer_name: details.customerName || `${contact.first_name} ${contact.last_name}`,
        customer_phone: contact.phone,
        scheduled_at: `${details.date}T${details.time}:00`,
        appointment_type: "in_person",
        source: "outbound_call",
        vehicle_interested: details.vehicleInterested,
        budget: details.budget,
        trade_in: details.tradeIn,
        confirmed: false,
        sms_sent: true,
      })
      .select()
      .single();

    await supabase
      .from("sms_conversations")
      .update({
        status: "booked",
        appointment_id: newAppt?.id ?? null,
        updated_at: now,
      })
      .eq("id", conversation.id);

    await supabase
      .from("contacts")
      .update({ status: "appointment_booked", updated_at: now })
      .eq("id", contact.id);

    // Send WhatsApp notification (inline to match existing pattern)
    try {
      const whatsappUrl = process.env.WHATSAPP_WEBHOOK_URL;
      if (whatsappUrl) {
        const apptDate = new Date(`${details.date}T${details.time}:00`);
        const timeStr = apptDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/Edmonton",
        });
        const dateStr = apptDate.toLocaleDateString("en-CA", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "America/Edmonton",
        });
        const msg =
          `NEW APPOINTMENT (AI SMS)\n` +
          `${details.customerName || contact.first_name + " " + contact.last_name}\n` +
          `${dateStr} at ${timeStr}\n` +
          `Phone: ${contact.phone}\n` +
          `Vehicle: ${details.vehicleInterested ?? "N/A"}\n` +
          `Budget: ${details.budget ?? "N/A"}\n` +
          `Trade-in: ${details.tradeIn ? "Yes" : "No"}`;

        await fetch(whatsappUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        });
      }
    } catch (whatsappErr) {
      console.error("WhatsApp notification failed:", whatsappErr);
    }
  } else if (aiResult.action === "flag_hot_lead") {
    await supabase
      .from("sms_conversations")
      .update({
        status: "flagged_hot",
        flagged_reason: aiResult.flagReason ?? "AI flagged for human takeover",
        updated_at: now,
      })
      .eq("id", conversation.id);

    await supabase
      .from("contacts")
      .update({ interest_level: "hot", updated_at: now })
      .eq("id", contact.id);
  } else if (aiResult.action === "end_conversation") {
    await supabase
      .from("sms_conversations")
      .update({ status: "ended", updated_at: now })
      .eq("id", conversation.id);
  }

  return NextResponse.json({
    status: "replied",
    conversationId: conversation.id,
    action: aiResult.action,
  });
}

async function handleCallCompleted(
  body: QuoWebhookPayload
): Promise<NextResponse> {
  try {
    if (body.type !== "call.completed") {
      return NextResponse.json({ status: "ignored" });
    }

    const supabase = getSupabaseAdmin();
    const resource = body.data.resource;
    const callId = resource.id;
    const context = body.data.context;
    const direction = resource.direction;
    const duration = resource.duration ?? null;
    const calledAt = resource.createdAt;

    const externalRaw = getExternalPhone(context);
    const customerPhone = externalRaw ? normalizePhone(externalRaw) : null;

    const agentNumber = context.phoneNumber?.number ?? null;
    const fromNumber = direction === "outgoing" ? agentNumber : customerPhone;
    const toNumber = direction === "outgoing" ? customerPhone : agentNumber;

    let contactId: string | null = null;
    if (customerPhone) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone", customerPhone)
        .single();
      contactId = contact?.id ?? null;
    }

    // Upsert the call record immediately (transcript/summary arrive later)
    await supabase
      .from("call_records")
      .upsert(
        {
          quo_call_id: callId,
          contact_id: contactId,
          duration_seconds: duration,
          called_at: calledAt,
          direction,
          from_number: fromNumber,
          to_number: toNumber,
          transcript_received: false,
          summary_received: false,
          gpt_processed: false,
        },
        { onConflict: "quo_call_id" }
      );

    // Update contact call_count and last_called_at
    if (contactId) {
      const { count: callCount } = await supabase
        .from("call_records")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", contactId);

      await supabase
        .from("contacts")
        .update({
          call_count: callCount ?? 1,
          last_called_at: calledAt,
        })
        .eq("id", contactId);
    }

    // Increment daily_stats
    const today = new Date().toISOString().split("T")[0];
    const { data: existingStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", today)
      .eq("user_role", "jea")
      .single();

    if (existingStats) {
      await supabase
        .from("daily_stats")
        .update({ calls_made: (existingStats.calls_made ?? 0) + 1 })
        .eq("id", existingStats.id);
    } else {
      await supabase.from("daily_stats").insert({
        date: today,
        user_role: "jea",
        calls_made: 1,
      });
    }

    return NextResponse.json({ status: "ok", callId });
  } catch (error) {
    console.error("Call completed webhook error:", error);
    return NextResponse.json({ error: "Failed to process call.completed" }, { status: 500 });
  }
}
