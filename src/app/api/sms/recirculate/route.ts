import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/sms/recirculate
 *
 * Cron-triggered: re-adds contacts who finished the SMS sequence
 * without replying back to Jea's call list after 7 days.
 * Preserves full SMS history so she has context.
 */
export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    let recirculated = 0;

    // Find conversations marked no_reply where recirculate_after has passed
    const { data: readyToRecirculate } = await supabase
      .from("sms_conversations")
      .select("id, contact_id")
      .eq("status", "no_reply")
      .lt("recirculate_after", now);

    if (readyToRecirculate && readyToRecirculate.length > 0) {
      for (const conv of readyToRecirculate) {
        // Mark conversation as recirculated
        await supabase
          .from("sms_conversations")
          .update({
            status: "recirculated",
            updated_at: now,
          })
          .eq("id", conv.id);

        // Clear assigned_call_date so the contact goes back into the pool
        // and will be picked up in the next day's fresh 200
        await supabase
          .from("contacts")
          .update({
            assigned_call_date: null,
            next_action: "callback",
            next_action_details: "SMS follow-up completed with no reply. Contact was texted twice after voicemail. Warm follow-up recommended.",
            updated_at: now,
          })
          .eq("id", conv.contact_id)
          .in("status", ["active", "appointment_booked"]);

        recirculated++;
      }
    }

    return NextResponse.json({ status: "ok", recirculated });
  } catch (error) {
    console.error("SMS recirculation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recirculation failed" },
      { status: 500 }
    );
  }
}
