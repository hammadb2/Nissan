import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/reply-failed
 *
 * Extension reports a reply send failure.
 * Requeues the reply by clearing its fb_message_id so it reappears
 * on the next pending-replies poll.
 *
 * Body: { fb_conversation_id, error_message, timestamp? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { fb_conversation_id, error_message, timestamp } = body;

  if (!fb_conversation_id || !error_message) {
    return NextResponse.json(
      { error: "fb_conversation_id and error_message required" },
      { status: 400 }
    );
  }

  const { data: convo } = await supabase
    .from("facebook_conversations")
    .select("id")
    .eq("fb_conversation_id", fb_conversation_id)
    .single();

  if (!convo) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const { error: updateErr } = await supabase
    .from("facebook_messages")
    .update({ fb_message_id: null })
    .eq("conversation_id", convo.id)
    .eq("direction", "outbound")
    .not("message_body", "is", null)
    .is("fb_message_id", null)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await supabase.from("facebook_extension_logs").insert({
    log_level: "error",
    message: `Reply failed for conversation ${fb_conversation_id}: ${error_message}`,
    occurred_at: timestamp || new Date().toISOString(),
  });

  return NextResponse.json({
    status: "requeued",
    fb_conversation_id,
  });
}
