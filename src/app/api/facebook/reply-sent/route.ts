import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/reply-sent
 *
 * Extension confirms that an AI reply was successfully sent on Facebook.
 * Body: { message_id, fb_message_id? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { message_id, fb_message_id } = body;

  if (!message_id) {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("facebook_messages")
    .update({
      fb_message_id: fb_message_id || `sent-${Date.now()}`,
      sent_at: now,
    })
    .eq("id", message_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "confirmed", message_id });
}
