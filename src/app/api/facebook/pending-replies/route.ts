import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/facebook/pending-replies
 *
 * Extension polls this every 10 seconds for AI replies ready to send.
 * Returns outbound messages that have not been sent yet (no fb_message_id).
 */
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: pendingMessages, error } = await supabase
    .from("facebook_messages")
    .select(`
      id,
      conversation_id,
      message_body,
      sent_at,
      facebook_conversations!inner(
        fb_conversation_id,
        buyer_name,
        status
      )
    `)
    .eq("direction", "outbound")
    .is("fb_message_id", null)
    .in("sent_by", ["ai"])
    .order("sent_at", { ascending: true })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const replies = (pendingMessages ?? []).map((msg) => {
    const convo = msg.facebook_conversations as unknown as {
      fb_conversation_id: string;
      buyer_name: string | null;
      status: string;
    };
    return {
      message_id: msg.id,
      conversation_id: msg.conversation_id,
      fb_conversation_id: convo.fb_conversation_id,
      buyer_name: convo.buyer_name,
      message: msg.message_body,
    };
  });

  return NextResponse.json({ replies });
}
