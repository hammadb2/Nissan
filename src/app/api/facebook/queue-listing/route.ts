import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateCompliantDescription } from "@/lib/facebook-ai";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/queue-listing
 *
 * Adds a vehicle from the CRM listings table to the Facebook posting queue.
 * Automatically generates an AI description and runs compliance check.
 *
 * Body: { listing_id } (from the main listings table)
 * OR a full vehicle object for manual queue:
 * { vehicle_year, vehicle_make, vehicle_model, vehicle_trim?, mileage?,
 *   price?, colour?, transmission?, fuel_type?, features?, image_urls? }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  let vehicleData: Record<string, unknown>;
  let crmListingId: string | null = null;

  if (body.listing_id) {
    crmListingId = body.listing_id;

    const { data: existing } = await supabase
      .from("facebook_listings")
      .select("id, status")
      .eq("listing_id", crmListingId)
      .not("status", "in", '("sold","failed")')
      .single();

    if (existing) {
      return NextResponse.json({
        error: "This vehicle is already queued or posted on Facebook",
        existing_id: existing.id,
        status: existing.status,
      }, { status: 409 });
    }

    const { data: listing, error: listErr } = await supabase
      .from("kijiji_listings")
      .select("*")
      .eq("listing_id", crmListingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (listing) {
      vehicleData = {
        listing_id: crmListingId,
        vehicle_year: listing.vehicle_year,
        vehicle_make: listing.vehicle_make,
        vehicle_model: listing.vehicle_model,
        vehicle_trim: listing.vehicle_trim,
        mileage: listing.mileage,
        price: listing.price,
        colour: listing.colour || listing.exterior_colour,
        transmission: listing.transmission,
        fuel_type: listing.fuel_type,
        features: listing.features,
        image_urls: listing.image_urls,
      };
    } else {
      const { data: crmListing, error: crmErr } = await supabase
        .from("listings")
        .select("*")
        .eq("id", crmListingId)
        .single();

      if (crmErr || !crmListing) {
        return NextResponse.json({ error: listErr?.message || "Listing not found" }, { status: 404 });
      }

      vehicleData = {
        listing_id: crmListingId,
        vehicle_year: crmListing.vehicle_year,
        vehicle_make: crmListing.vehicle_make,
        vehicle_model: crmListing.vehicle_model,
        vehicle_trim: crmListing.vehicle_trim,
        mileage: crmListing.mileage,
        price: crmListing.price,
        colour: crmListing.colour,
      };
    }
  } else {
    vehicleData = {
      vehicle_year: body.vehicle_year,
      vehicle_make: body.vehicle_make,
      vehicle_model: body.vehicle_model,
      vehicle_trim: body.vehicle_trim || null,
      mileage: body.mileage || null,
      price: body.price || null,
      colour: body.colour || null,
      transmission: body.transmission || "Automatic",
      fuel_type: body.fuel_type || null,
      features: body.features || null,
      image_urls: body.image_urls || null,
    };
  }

  if (!vehicleData.price || !vehicleData.image_urls ||
      (Array.isArray(vehicleData.image_urls) && vehicleData.image_urls.length === 0)) {
    const reasons: string[] = [];
    if (!vehicleData.price) reasons.push("no price");
    if (!vehicleData.image_urls || (Array.isArray(vehicleData.image_urls) && vehicleData.image_urls.length === 0)) {
      reasons.push("no photos");
    }
    return NextResponse.json({
      error: `Cannot queue listing: ${reasons.join(" and ")}`,
    }, { status: 400 });
  }

  const descResult = await generateCompliantDescription({
    year: vehicleData.vehicle_year as number,
    make: vehicleData.vehicle_make as string,
    model: vehicleData.vehicle_model as string,
    trim: (vehicleData.vehicle_trim as string) || null,
    mileage: (vehicleData.mileage as number) || null,
    colour: (vehicleData.colour as string) || null,
    transmission: (vehicleData.transmission as string) || null,
    features: (vehicleData.features as string) || null,
    condition_notes: null,
    price: (vehicleData.price as number) || null,
  });

  const { data: fbListing, error: insertErr } = await supabase
    .from("facebook_listings")
    .insert({
      ...vehicleData,
      description: descResult.description,
      compliance_passed: descResult.passed,
      status: descResult.passed ? "ready" : "failed",
      error_message: descResult.passed ? null : "Description failed compliance check",
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    listing: fbListing,
    description_passed: descResult.passed,
    description_attempts: descResult.attempts,
  }, { status: 201 });
}
