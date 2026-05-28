import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/listing-posted
 *
 * Extension reports back when a listing has been posted (or failed).
 * Body: { listing_id, fb_listing_id?, fb_listing_url?, success, error? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { listing_id, fb_listing_id, fb_listing_url, success, error: errorMsg } = body;

  if (!listing_id) {
    return NextResponse.json({ error: "listing_id required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (success) {
    const { error } = await supabase
      .from("facebook_listings")
      .update({
        status: "posted",
        listing_id_fb: fb_listing_id || null,
        fb_listing_url: fb_listing_url || null,
        posted_at: now,
        updated_at: now,
        error_message: null,
      })
      .eq("id", listing_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: "posted", listing_id });
  }

  const { error } = await supabase
    .from("facebook_listings")
    .update({
      status: "failed",
      error_message: errorMsg || "Unknown posting error",
      updated_at: now,
    })
    .eq("id", listing_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (errorMsg && /warning|restriction|banned|blocked/i.test(errorMsg)) {
    await supabase.from("facebook_alerts").insert({
      alert_type: "posting_error",
      message: errorMsg,
      listing_id,
    });
  }

  return NextResponse.json({ status: "failed", listing_id, error: errorMsg });
}
