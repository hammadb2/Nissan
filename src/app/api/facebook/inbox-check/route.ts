import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/facebook/inbox-check
 *
 * Returns { should_check: true/false } based on whether 5 minutes
 * have passed since the last inbox check. Updates the timestamp
 * when returning true.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: setting } = await supabase
    .from("facebook_settings")
    .select("value")
    .eq("key", "last_inbox_check")
    .single();

  const lastCheck = setting?.value
    ? new Date(setting.value).getTime()
    : 0;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (now - lastCheck < fiveMinutes) {
    return NextResponse.json({ should_check: false });
  }

  await supabase
    .from("facebook_settings")
    .upsert({
      key: "last_inbox_check",
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  return NextResponse.json({ should_check: true });
}
