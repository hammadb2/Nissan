import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/shadow-ban-check
 *
 * Extension reports shadow ban check result after verifying listing
 * visibility from an incognito window.
 *
 * Body: { listing_id, result: "visible" | "hidden", checked_at? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { listing_id, result, checked_at } = body;

  if (!listing_id || !result) {
    return NextResponse.json(
      { error: "listing_id and result required" },
      { status: 400 }
    );
  }

  if (result !== "visible" && result !== "hidden") {
    return NextResponse.json(
      { error: 'result must be "visible" or "hidden"' },
      { status: 400 }
    );
  }

  const now = checked_at || new Date().toISOString();

  if (result === "hidden") {
    await supabase
      .from("facebook_listings")
      .update({
        status: "shadow_banned",
        updated_at: now,
      })
      .eq("id", listing_id);

    await supabase.from("facebook_alerts").insert({
      alert_type: "shadow_ban",
      message: `Listing ${listing_id} is not publicly visible — possible shadow ban`,
      listing_id,
    });

    return NextResponse.json({
      status: "shadow_banned",
      listing_id,
      action: "all_posting_stopped",
    });
  }

  return NextResponse.json({
    status: "visible",
    listing_id,
  });
}
