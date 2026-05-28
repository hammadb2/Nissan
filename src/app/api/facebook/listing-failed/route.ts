import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/listing-failed
 *
 * Extension reports a listing posting failure.
 * Stores the error in facebook_listing_errors and requeues the listing.
 *
 * Body: { listing_id, error_message, screenshot?, timestamp? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { listing_id, error_message, screenshot, timestamp } = body;

  if (!listing_id || !error_message) {
    return NextResponse.json(
      { error: "listing_id and error_message required" },
      { status: 400 }
    );
  }

  const occurredAt = timestamp || new Date().toISOString();

  const { error: insertErr } = await supabase
    .from("facebook_listing_errors")
    .insert({
      listing_id,
      error_message,
      screenshot_base64: screenshot || null,
      occurred_at: occurredAt,
    });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("facebook_listings")
    .update({
      status: "queued",
      error_message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listing_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ status: "requeued", listing_id });
}
