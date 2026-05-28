import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateCompliantDescription } from "@/lib/facebook-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/facebook/next-listing-job
 *
 * Extension polls this for the next vehicle to post on Facebook Marketplace.
 * If a "queued" listing exists without a description, generates one first.
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

  // First check for a ready listing
  const { data: readyJob } = await supabase
    .from("facebook_listings")
    .select("*")
    .eq("status", "ready")
    .eq("compliance_passed", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (readyJob) {
    await supabase
      .from("facebook_listings")
      .update({ status: "posting", updated_at: now.toISOString() })
      .eq("id", readyJob.id);

    return NextResponse.json({ job: readyJob });
  }

  // No ready listing — check for queued listings that need description generation
  const { data: queued } = await supabase
    .from("facebook_listings")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!queued) {
    return NextResponse.json({ job: null, reason: "No listings ready to post" });
  }

  // Generate description for this queued listing
  await supabase
    .from("facebook_listings")
    .update({ status: "generating", updated_at: now.toISOString() })
    .eq("id", queued.id);

  try {
    const result = await generateCompliantDescription({
      year: queued.vehicle_year,
      make: queued.vehicle_make,
      model: queued.vehicle_model,
      trim: queued.vehicle_trim,
      mileage: queued.mileage,
      colour: queued.colour,
      transmission: queued.transmission,
      features: queued.features,
      condition_notes: null,
      price: queued.price ? Number(queued.price) : null,
    });

    if (result.passed) {
      await supabase
        .from("facebook_listings")
        .update({
          description: result.description,
          compliance_passed: true,
          status: "posting",
          updated_at: now.toISOString(),
        })
        .eq("id", queued.id);

      return NextResponse.json({
        job: { ...queued, description: result.description, status: "posting" },
      });
    }

    // Description failed compliance
    await supabase
      .from("facebook_listings")
      .update({
        description: result.description,
        compliance_passed: false,
        status: "failed",
        error_message: "Description failed compliance check after 3 attempts",
        updated_at: now.toISOString(),
      })
      .eq("id", queued.id);

    return NextResponse.json({
      job: null,
      reason: "Generated description failed compliance — skipping to next",
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("facebook_listings")
      .update({
        status: "failed",
        error_message: `Description generation error: ${errorMsg}`,
        updated_at: now.toISOString(),
      })
      .eq("id", queued.id);

    return NextResponse.json({
      job: null,
      reason: `Description generation failed: ${errorMsg}`,
    });
  }
}
