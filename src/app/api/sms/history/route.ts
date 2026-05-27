import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/sms/history?contactId=...
 *
 * Returns all SMS messages for a given contact, across all conversations.
 */
export async function GET(req: NextRequest) {
  try {
    const contactId = req.nextUrl.searchParams.get("contactId");
    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: messages, error } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get the conversation status
    const { data: conversations } = await supabase
      .from("sms_conversations")
      .select("id, status, initial_sms_sent_at, customer_replied_at, flagged_reason")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      messages: messages ?? [],
      conversations: conversations ?? [],
    });
  } catch (error) {
    console.error("SMS history error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch history" },
      { status: 500 }
    );
  }
}
