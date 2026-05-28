import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateFBReply } from "@/lib/facebook-ai";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/new-message
 *
 * Extension sends a new buyer message from Facebook Marketplace.
 * CRM stores it and generates an AI reply.
 *
 * Body: {
 *   fb_conversation_id, buyer_name, message, listing_fb_id?,
 *   buyer_profile_url?, buyer_profile_info?, fb_message_id?
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const {
    fb_conversation_id,
    buyer_name,
    message,
    listing_fb_id,
    buyer_profile_url,
    buyer_profile_info,
    fb_message_id,
  } = body;

  if (!fb_conversation_id || !message) {
    return NextResponse.json(
      { error: "fb_conversation_id and message required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  let fbListing = null;
  if (listing_fb_id) {
    const { data } = await supabase
      .from("facebook_listings")
      .select("*")
      .eq("listing_id_fb", listing_fb_id)
      .limit(1)
      .single();
    fbListing = data;
  }

  const { data: existingConvo } = await supabase
    .from("facebook_conversations")
    .select("*")
    .eq("fb_conversation_id", fb_conversation_id)
    .single();

  let conversationId: string;

  if (existingConvo) {
    conversationId = existingConvo.id;
    await supabase
      .from("facebook_conversations")
      .update({
        last_message_at: now,
        message_count: (existingConvo.message_count || 0) + 1,
        status: "active",
        updated_at: now,
        ...(buyer_profile_url ? { buyer_profile_url } : {}),
        ...(buyer_profile_info ? { buyer_profile_info } : {}),
      })
      .eq("id", conversationId);
  } else {
    const { data: newConvo, error: convError } = await supabase
      .from("facebook_conversations")
      .insert({
        fb_conversation_id,
        buyer_name: buyer_name || null,
        buyer_profile_url: buyer_profile_url || null,
        buyer_profile_info: buyer_profile_info || null,
        listing_id: fbListing?.id || null,
        last_message_at: now,
        status: "active",
        message_count: 1,
        ai_sequence_step: 0,
      })
      .select()
      .single();

    if (convError || !newConvo) {
      return NextResponse.json(
        { error: convError?.message || "Failed to create conversation" },
        { status: 500 }
      );
    }
    conversationId = newConvo.id;
  }

  await supabase.from("facebook_messages").insert({
    conversation_id: conversationId,
    direction: "inbound",
    message_body: message,
    sent_at: now,
    sent_by: "human",
    fb_message_id: fb_message_id || null,
  });

  const { data: history } = await supabase
    .from("facebook_messages")
    .select("direction, message_body, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  const convo = existingConvo || (
    await supabase
      .from("facebook_conversations")
      .select("*")
      .eq("id", conversationId)
      .single()
  ).data;

  const vehicleDesc = fbListing
    ? `${fbListing.vehicle_year} ${fbListing.vehicle_make} ${fbListing.vehicle_model}${fbListing.vehicle_trim ? " " + fbListing.vehicle_trim : ""}`
    : null;

  const aiResult = await generateFBReply({
    buyerName: buyer_name || convo?.buyer_name || null,
    buyerProfileInfo: buyer_profile_info || convo?.buyer_profile_info || null,
    vehicleAskedAbout: vehicleDesc,
    vehiclePrice: fbListing?.price ? Number(fbListing.price) : null,
    vehicleAvailable: fbListing ? fbListing.status !== "sold" : true,
    conditionNotes: null,
    conversationHistory: (history ?? []).map((m) => ({
      direction: m.direction as "inbound" | "outbound",
      message_body: m.message_body,
      sent_at: m.sent_at,
    })),
    sequenceStep: convo?.ai_sequence_step || 0,
    extractedPhone: convo?.extracted_phone || null,
    extractedBudget: convo?.extracted_budget || null,
    extractedTradeIn: convo?.extracted_trade_in ?? null,
  });

  await supabase.from("facebook_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    message_body: aiResult.message,
    sent_at: now,
    sent_by: "ai",
  });

  const updateData: Record<string, unknown> = {
    ai_sequence_step: (convo?.ai_sequence_step || 0) + 1,
    status: aiResult.action === "flag_human" ? "needs_human" : "replied",
    updated_at: now,
  };

  if (aiResult.extractedInfo?.phone) {
    updateData.extracted_phone = aiResult.extractedInfo.phone;
  }
  if (aiResult.extractedInfo?.budget) {
    updateData.extracted_budget = aiResult.extractedInfo.budget;
  }
  if (aiResult.extractedInfo?.tradeIn !== undefined) {
    updateData.extracted_trade_in = aiResult.extractedInfo.tradeIn;
  }
  if (aiResult.extractedInfo?.timeline) {
    updateData.extracted_timeline = aiResult.extractedInfo.timeline;
  }

  await supabase
    .from("facebook_conversations")
    .update(updateData)
    .eq("id", conversationId);

  if (aiResult.action === "book_appointment" && aiResult.appointmentDetails) {
    const details = aiResult.appointmentDetails;

    let contactId: string | null = null;
    if (details.phone) {
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone", details.phone)
        .single();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const nameParts = (details.customerName || buyer_name || "").split(" ");
        const { data: newContact } = await supabase
          .from("contacts")
          .insert({
            first_name: nameParts[0] || "Facebook",
            last_name: nameParts.slice(1).join(" ") || "Buyer",
            phone: details.phone,
            status: "appointment_booked",
            interest_level: "hot",
          })
          .select()
          .single();
        contactId = newContact?.id || null;
      }
    }

    const scheduledAt = `${details.date}T${details.time}:00-07:00`;
    const { data: appointment } = await supabase
      .from("appointments")
      .insert({
        contact_id: contactId,
        listing_id: fbListing?.listing_id || null,
        source: "marketplace",
        appointment_type: "in_person",
        scheduled_at: scheduledAt,
        customer_name: details.customerName || buyer_name,
        customer_phone: details.phone || null,
        vehicle_interested: details.vehicleInterested || vehicleDesc,
      })
      .select()
      .single();

    if (appointment) {
      await supabase
        .from("facebook_conversations")
        .update({
          status: "booked",
          appointment_id: appointment.id,
          contact_id: contactId,
        })
        .eq("id", conversationId);

      const { sendAppointmentToWhatsApp } = await import("@/lib/whatsapp");
      await sendAppointmentToWhatsApp(appointment).catch(() => {});
    }
  }

  return NextResponse.json({
    conversation_id: conversationId,
    reply: aiResult.message,
    action: aiResult.action,
  });
}
