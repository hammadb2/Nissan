import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/call-list/outcome
 * Manually set the outcome of a call record for a contact.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { contactId, outcome, notes } = await req.json();
    if (!contactId || !outcome) {
      return NextResponse.json(
        { error: "contactId and outcome are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Find the most recent call record for this contact today
    const { data: callRecord } = await supabase
      .from("call_records")
      .select("id")
      .eq("contact_id", contactId)
      .gte("called_at", todayStart.toISOString())
      .order("called_at", { ascending: false })
      .limit(1)
      .single();

    if (callRecord) {
      const updateData: Record<string, unknown> = { outcome };
      if (notes) updateData.crm_notes = notes;
      await supabase
        .from("call_records")
        .update(updateData)
        .eq("id", callRecord.id);
    }

    // Update contact status based on outcome
    const contactUpdate: Record<string, unknown> = {};
    if (outcome === "booked") {
      contactUpdate.status = "appointment_booked";
      contactUpdate.interest_level = "hot";
    } else if (outcome === "not_interested" || outcome === "dnc") {
      contactUpdate.status = "dnc";
    } else if (outcome === "hot") {
      contactUpdate.interest_level = "hot";
      contactUpdate.next_action = "callback";
    } else if (outcome === "callback") {
      contactUpdate.next_action = "callback";
    }

    if (Object.keys(contactUpdate).length > 0) {
      await supabase
        .from("contacts")
        .update(contactUpdate)
        .eq("id", contactId);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Outcome update error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
