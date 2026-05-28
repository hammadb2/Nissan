import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateCompliantDescription } from "@/lib/facebook-ai";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/generate-description
 *
 * Generates an AI description for a Facebook listing and runs compliance check.
 * Body: { listing_id } (facebook_listings ID)
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { listing_id } = body;

  if (!listing_id) {
    return NextResponse.json({ error: "listing_id required" }, { status: 400 });
  }

  const { data: listing, error: fetchErr } = await supabase
    .from("facebook_listings")
    .select("*")
    .eq("id", listing_id)
    .single();

  if (fetchErr || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  await supabase
    .from("facebook_listings")
    .update({ status: "generating", updated_at: new Date().toISOString() })
    .eq("id", listing_id);

  const result = await generateCompliantDescription({
    year: listing.vehicle_year,
    make: listing.vehicle_make,
    model: listing.vehicle_model,
    trim: listing.vehicle_trim,
    mileage: listing.mileage,
    colour: listing.colour,
    transmission: listing.transmission,
    features: listing.features,
    condition_notes: null,
    price: listing.price ? Number(listing.price) : null,
  });

  const now = new Date().toISOString();

  await supabase
    .from("facebook_listings")
    .update({
      description: result.description,
      compliance_passed: result.passed,
      status: result.passed ? "ready" : "failed",
      error_message: result.passed ? null : "Description failed compliance check after 3 attempts",
      updated_at: now,
    })
    .eq("id", listing_id);

  return NextResponse.json({
    listing_id,
    description: result.description,
    compliance_passed: result.passed,
    attempts: result.attempts,
    status: result.passed ? "ready" : "failed",
  });
}
