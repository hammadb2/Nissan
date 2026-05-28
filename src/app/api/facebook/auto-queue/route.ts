import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/auto-queue
 *
 * Pulls all inventory from kijiji_listings that has photos and price,
 * skips any already queued/posted to facebook_listings, and inserts
 * the rest as "queued" so the extension can start posting.
 *
 * Descriptions are generated lazily by next-listing-job or generate-description.
 */
export async function POST() {
  const supabase = getSupabaseAdmin();

  // Get all kijiji listings with photos and price
  const { data: inventory, error: invErr } = await supabase
    .from("kijiji_listings")
    .select(
      "id, vehicle_year, vehicle_make, vehicle_model, vehicle_trim, mileage, price, colour, exterior_colour, transmission, fuel_type, features, image_urls"
    )
    .not("price", "is", null)
    .not("image_urls", "is", null);

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  // Filter out entries with empty image arrays
  const eligible = (inventory ?? []).filter(
    (v) => Array.isArray(v.image_urls) && v.image_urls.length > 0 && v.price
  );

  if (eligible.length === 0) {
    return NextResponse.json({
      queued: 0,
      skipped: 0,
      message: "No eligible listings found (need photos and price)",
    });
  }

  // Get already-queued kijiji_listing_ids
  const { data: existing } = await supabase
    .from("facebook_listings")
    .select("kijiji_listing_id")
    .not("status", "in", '("sold","failed")');

  const alreadyQueued = new Set(
    (existing ?? [])
      .map((e) => e.kijiji_listing_id)
      .filter(Boolean)
  );

  const toQueue = eligible.filter((v) => !alreadyQueued.has(v.id));

  if (toQueue.length === 0) {
    return NextResponse.json({
      queued: 0,
      skipped: eligible.length,
      message: "All eligible listings are already queued or posted",
    });
  }

  // Insert new listings in batch
  const rows = toQueue.map((v) => ({
    kijiji_listing_id: v.id,
    vehicle_year: v.vehicle_year,
    vehicle_make: v.vehicle_make,
    vehicle_model: v.vehicle_model,
    vehicle_trim: v.vehicle_trim || null,
    mileage: v.mileage || null,
    price: v.price,
    colour: v.colour || v.exterior_colour || null,
    transmission: v.transmission || "Automatic",
    fuel_type: v.fuel_type || null,
    features: v.features || null,
    image_urls: v.image_urls,
    status: "queued",
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("facebook_listings")
    .insert(rows)
    .select("id, vehicle_year, vehicle_make, vehicle_model, status");

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    queued: inserted?.length ?? 0,
    skipped: eligible.length - toQueue.length,
    total_inventory: eligible.length,
    message: `Queued ${inserted?.length ?? 0} listings for Facebook Marketplace`,
  });
}
