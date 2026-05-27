import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listPhoneNumbers, sendSMS } from "@/lib/quo-api";
import { generateInitialSMS } from "@/lib/sms-ai";

export const dynamic = "force-dynamic";

/**
 * POST /api/sms/trigger
 *
 * Triggered when a voicemail is logged. Generates a personalized AI SMS
 * and sends it via Quo (same number the customer was called from).
 *
 * Body: { contactId: string, callRecordId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { contactId, callRecordId } = await req.json();
    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Get contact details
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Skip if contact is DNC or wrong number
    if (contact.status === "dnc" || contact.status === "closed") {
      return NextResponse.json({ status: "skipped", reason: "contact is DNC or closed" });
    }

    // Check if there is already an active SMS conversation for this contact
    const { data: existingConv } = await supabase
      .from("sms_conversations")
      .select("id, status")
      .eq("contact_id", contactId)
      .in("status", ["awaiting_reply", "active"])
      .limit(1)
      .single();

    if (existingConv) {
      return NextResponse.json({
        status: "skipped",
        reason: "active conversation exists",
        conversationId: existingConv.id,
      });
    }

    // Get call record notes if available
    let callNotes: string | null = null;
    let callSummary: string | null = null;
    if (callRecordId) {
      const { data: callRecord } = await supabase
        .from("call_records")
        .select("crm_notes, gpt_summary")
        .eq("id", callRecordId)
        .single();
      callNotes = callRecord?.crm_notes ?? null;
      callSummary = callRecord?.gpt_summary ?? null;
    }

    // Generate personalized SMS using AI
    const smsContent = await generateInitialSMS({
      firstName: contact.first_name,
      lastName: contact.last_name,
      phone: contact.phone,
      vehicleYear: contact.vehicle_year,
      vehicleMake: contact.vehicle_make,
      vehicleModel: contact.vehicle_model,
      callNotes,
      callSummary,
      interestLevel: contact.interest_level,
      vehicleOwnershipDuration: contact.vehicle_ownership_duration,
      tradeInAvailable: contact.trade_in_available,
      monthlyBudget: contact.monthly_budget,
    });

    // Send via Quo
    const phoneNumbers = await listPhoneNumbers();
    if (phoneNumbers.length === 0) {
      return NextResponse.json(
        { error: "No Quo phone numbers available" },
        { status: 500 }
      );
    }

    const phoneNumberId = phoneNumbers[0].id;
    const quoResult = await sendSMS(phoneNumberId, contact.phone, smsContent);

    // Create SMS conversation record
    const now = new Date().toISOString();
    const recirculateAfter = new Date();
    recirculateAfter.setDate(recirculateAfter.getDate() + 7 + 5); // 72h + 48h + 7 days
    const firstFollowupAt = new Date();
    firstFollowupAt.setHours(firstFollowupAt.getHours() + 72);

    const { data: conversation, error: convError } = await supabase
      .from("sms_conversations")
      .insert({
        contact_id: contactId,
        phone_number_id: phoneNumberId,
        status: "awaiting_reply",
        trigger_call_id: callRecordId ?? null,
        initial_sms_sent_at: now,
        recirculate_after: recirculateAfter.toISOString(),
      })
      .select()
      .single();

    if (convError) {
      console.error("Failed to create SMS conversation:", convError);
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }

    // Store the outbound message
    await supabase.from("sms_messages").insert({
      conversation_id: conversation.id,
      contact_id: contactId,
      direction: "outbound",
      content: smsContent,
      sent_by: "ai",
      quo_message_id: quoResult.id ?? null,
    });

    return NextResponse.json({
      status: "sent",
      conversationId: conversation.id,
      message: smsContent,
    });
  } catch (error) {
    console.error("SMS trigger error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send SMS" },
      { status: 500 }
    );
  }
}
