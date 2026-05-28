import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateCompliantDescription } from "@/lib/facebook-ai";

export const dynamic = "force-dynamic";

/**
 * POST /api/facebook/update-listing
 *
 * When a listing's price or other details change in the CRM,
 * this endpoint updates the Facebook listing record and regenerates
 * the description if needed. The extension will pick up the update
 * and re-post or edit the listing on Facebook.
 *
 * Body: { listing_id (CRM listings table ID), fields to update }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { listing_id, ...updates } = body;

  if (!listing_id) {
    return NextResponse.json({ error: "listing_id required" }, { status: 400 });
  }

  const { data: fbListing, error: fetchErr } = await supabase
    .from("facebook_listings")
    .select("*")
    .eq("listing_id", listing_id)
    .not("status", "in", '("sold")')
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchErr || !fbListing) {
    return NextResponse.json(
      { error: "No active Facebook listing found for this CRM listing" },
      { status: 404 }
    );
  }

  const updateFields: Record<string, unknown> = {};
  let needsNewDescription = false;

  const trackFields = ["price", "mileage", "vehicle_trim", "colour", "features", "image_urls"];
  for (const field of trackFields) {
    if (updates[field] !== undefined && updates[field] !== fbListing[field]) {
      updateFields[field] = updates[field];
      if (field !== "image_urls") {
        needsNewDescription = true;
      }
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({
      message: "No changes detected",
      listing_id: fbListing.id,
    });
  }

  if (needsNewDescription) {
    const mergedData = { ...fbListing, ...updateFields };
    const descResult = await generateCompliantDescription({
      year: mergedData.vehicle_year,
      make: mergedData.vehicle_make,
      model: mergedData.vehicle_model,
      trim: mergedData.vehicle_trim,
      mileage: mergedData.mileage,
      colour: mergedData.colour,
      transmission: mergedData.transmission,
      features: mergedData.features,
      condition_notes: null,
      price: mergedData.price ? Number(mergedData.price) : null,
    });

    updateFields.description = descResult.description;
    updateFields.compliance_passed = descResult.passed;
  }

  const now = new Date().toISOString();
  updateFields.status = "ready";
  updateFields.updated_at = now;

  if (fbListing.status === "posted") {
    updateFields.status = "updated";
  }

  const { error: updateErr } = await supabase
    .from("facebook_listings")
    .update(updateFields)
    .eq("id", fbListing.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    message: "Facebook listing updated",
    listing_id: fbListing.id,
    updated_fields: Object.keys(updateFields),
    needs_repost: fbListing.status === "posted",
  });
}
