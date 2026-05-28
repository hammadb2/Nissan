import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/facebook/next-listing-job
 *
 * Extension polls this for the next vehicle to post on Facebook Marketplace.
 * Returns the oldest "ready" listing that has passed compliance checks.
 * Respects pacing rules: max 10 per day, no posting 11PM-8AM Calgary time.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();

  const now = new Date();
  const calgaryHour = parseInt(
    now.toLocaleString("en-CA", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Edmonton",
    })
  );

  if (calgaryHour >= 23 || calgaryHour < 8) {
    return NextResponse.json({
      job: null,
      reason: "Outside posting hours (11PM-8AM Calgary time)",
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCalgary = todayStart.toLocaleDateString("en-CA", {
    timeZone: "America/Edmonton",
  });

  const { count } = await supabase
    .from("facebook_listings")
    .select("*", { count: "exact", head: true })
    .eq("status", "posted")
    .gte("posted_at", `${todayCalgary}T00:00:00-07:00`);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({
      job: null,
      reason: "Daily limit reached (10 listings per day)",
    });
  }

  const { data: lastPosted } = await supabase
    .from("facebook_listings")
    .select("posted_at")
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(1)
    .single();

  if (lastPosted?.posted_at) {
    const lastTime = new Date(lastPosted.posted_at).getTime();
    const elapsed = now.getTime() - lastTime;
    const minGap = 15 * 60 * 1000;

    if (elapsed < minGap) {
      const waitMs = minGap - elapsed;
      return NextResponse.json({
        job: null,
        reason: `Must wait ${Math.ceil(waitMs / 60000)} more minutes before next listing`,
        retry_after_ms: waitMs,
      });
    }
  }

  const { data: job, error } = await supabase
    .from("facebook_listings")
    .select("*")
    .eq("status", "ready")
    .eq("compliance_passed", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !job) {
    return NextResponse.json({ job: null, reason: "No listings ready to post" });
  }

  await supabase
    .from("facebook_listings")
    .update({ status: "posting", updated_at: now.toISOString() })
    .eq("id", job.id);

  return NextResponse.json({ job });
}
