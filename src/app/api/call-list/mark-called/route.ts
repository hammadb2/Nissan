import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * POST /api/call-list/mark-called
 * Manually mark a contact as called with optional notes + outcome.
 * When Quo eventually syncs the real call, it merges with this record.
 */
export async function POST(req: NextRequest) {
  try {
    const { contactId, phone, notes, outcome } = await req.json();
    if (!contactId || !phone) {
      return NextResponse.json({ error: "contactId and phone are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const normalizedPhone = normalizePhone(phone);
    const now = new Date().toISOString();

    // Insert a manual call record (no quo_call_id — will be filled by sync later)
    const { data: record, error } = await supabase
      .from("call_records")
      .insert({
        contact_id: contactId,
        called_at: now,
        from_number: null,
        to_number: normalizedPhone,
        direction: "outgoing",
        manually_marked: true,
        manual_notes: notes || null,
        outcome: outcome || null,
        transcript_received: false,
        summary_received: false,
        gpt_processed: false,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update contact stats
    const { count: callCount } = await supabase
      .from("call_records")
      .select("*", { count: "exact", head: true })
      .eq("contact_id", contactId);

    await supabase
      .from("contacts")
      .update({
        call_count: callCount ?? 1,
        last_called_at: now,
      })
      .eq("id", contactId);

    return NextResponse.json({
      status: "marked",
      callRecordId: record.id,
    });
  } catch (error) {
    console.error("Mark called error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
