import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  kijijiLogin,
  kijijiDeleteAd,
  kijijiPostAd,
  kijijiEditAd,
  kijijiUploadImages,
  buildVehicleAttributes,
} from "@/lib/kijiji-api";
import {
  generateUniqueDescription,
  getPostingDelay,
  sleep,
} from "@/lib/kijiji-safety";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("kijiji_listings")
    .select("*, kijiji_accounts(employee_name, employee_email)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    vehicles: data ?? [],
    total: data?.length ?? 0,
  });
}

// Fields that the extension can update on each sync
const SYNC_FIELDS = [
  "autotrader_title",
  "kijiji_title",
  "vehicle_year",
  "vehicle_make",
  "vehicle_model",
  "vehicle_trim",
  "mileage",
  "price",
  "fuel_type",
  "transmission",
  "drivetrain",
  "body_type",
  "colour",
  "features",
  "autotrader_url",
  "image_urls",
  "carfax_url",
  "exterior_colour",
  "interior_colour",
  "engine",
  "doors",
  "seats",
  "vin",
  "stock_number",
  "body_style",
  "fuel_economy",
  "manufacturer_colour",
  "upholstery_colour",
  "cylinders",
  "displacement",
  "displacement_cc",
  "power_hp",
  "power_kw",
  "fuel_consumption_city",
  "fuel_consumption_highway",
  "vehicle_type",
  "had_accident",
  "is_damaged",
  "autotrader_id",
  "old_price",
  "price_evaluation",
  "seller_phone",
  "location_city",
  "location_province",
  "location_postal",
  "location_address",
  "num_images",
  "description_html",
] as const;

/**
 * POST /api/kijiji/inventory  —  Sync scraped vehicles from the extension
 *
 * Body: { vehicles: [...], sync: true }
 *
 * Logic:
 * 1. Match incoming vehicles to existing listings by autotrader_url
 * 2. Existing + still in scrape → update all fields; if posted & data changed → delete old ad, re-post
 * 3. Existing + NOT in scrape → mark as sold (and remove from Kijiji if posted)
 * 4. New vehicles → insert as drafts
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  if (!body.sync || !Array.isArray(body.vehicles)) {
    return NextResponse.json(
      { error: "Expected { sync: true, vehicles: [...] }" },
      { status: 400 }
    );
  }

  const incoming = body.vehicles as Record<string, unknown>[];

  // Build lookup of incoming vehicles by autotrader_url
  const incomingByUrl = new Map<string, Record<string, unknown>>();
  for (const v of incoming) {
    const url = v.autotrader_url as string | undefined;
    if (url) incomingByUrl.set(url, v);
  }

  // Fetch all existing listings
  const { data: existing, error: fetchErr } = await supabase
    .from("kijiji_listings")
    .select("*, kijiji_accounts(*)");

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const existingByUrl = new Map<string, (typeof existing)[number]>();
  for (const e of existing ?? []) {
    if (e.autotrader_url) existingByUrl.set(e.autotrader_url, e);
  }

  const results = {
    updated: 0,
    inserted: 0,
    marked_sold: 0,
    reposted: 0,
    repost_errors: [] as Array<{ id: string; error: string }>,
  };

  const password = process.env.KIJIJI_SHARED_PASSWORD;
  const sessionCache = new Map<string, Awaited<ReturnType<typeof kijijiLogin>>>();

  // ── 1. Handle existing listings no longer in scrape → mark sold ──
  for (const row of existing ?? []) {
    if (!row.autotrader_url) continue;
    if (incomingByUrl.has(row.autotrader_url)) continue;

    // Listing is gone from AutoTrader — mark sold
    if (row.kijiji_status === "posted" && row.kijiji_ad_id && password) {
      // Delete from Kijiji first
      const account = row.kijiji_accounts;
      if (account) {
        try {
          let session = sessionCache.get(account.employee_email);
          if (!session) {
            session = await kijijiLogin(account.employee_email, password);
            sessionCache.set(account.employee_email, session);
          }
          await kijijiDeleteAd(session, row.kijiji_ad_id);
        } catch {
          // best-effort delete
        }
      }
    }

    await supabase
      .from("kijiji_listings")
      .update({
        kijiji_status: "sold",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    results.marked_sold++;
  }

  // ── 2. Handle incoming vehicles ──
  let repostCount = 0;
  for (const v of incoming) {
    const url = v.autotrader_url as string | undefined;
    const existingRow = url ? existingByUrl.get(url) : undefined;

    if (existingRow) {
      // Build update payload with only changed fields
      const updates: Record<string, unknown> = {};
      let hasChanges = false;

      for (const field of SYNC_FIELDS) {
        const newVal = v[field];
        if (newVal === undefined) continue;

        const oldVal = existingRow[field];

        // Compare arrays (image_urls) by JSON
        if (Array.isArray(newVal) || Array.isArray(oldVal)) {
          if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
            updates[field] = newVal;
            hasChanges = true;
          }
        } else if (newVal !== oldVal) {
          updates[field] = newVal;
          hasChanges = true;
        }
      }

      if (!hasChanges) continue;

      updates.updated_at = new Date().toISOString();

      // Check if price or key data changed on a posted listing → needs re-post
      const needsRepost =
        existingRow.kijiji_status === "posted" &&
        existingRow.kijiji_ad_id &&
        (updates.price !== undefined ||
          updates.mileage !== undefined ||
          updates.kijiji_title !== undefined ||
          updates.image_urls !== undefined);

      if (needsRepost && password) {
        const account = existingRow.kijiji_accounts;
        if (account) {
          try {
            // Rate limit re-posts
            if (repostCount > 0) {
              const delay = getPostingDelay();
              await sleep(delay);
            }

            let session = sessionCache.get(account.employee_email);
            if (!session) {
              session = await kijijiLogin(account.employee_email, password);
              sessionCache.set(account.employee_email, session);
            }

            // Generate fresh description
            const merged = { ...existingRow, ...updates };
            const uniqueDesc = generateUniqueDescription(merged);

            const attrs = buildVehicleAttributes({
              year: (merged.vehicle_year as number) ?? existingRow.vehicle_year,
              make: (merged.vehicle_make as string) ?? existingRow.vehicle_make,
              model: (merged.vehicle_model as string) ?? existingRow.vehicle_model,
              mileage: (merged.mileage as number | null) ?? existingRow.mileage,
              transmission: (merged.transmission as string | null) ?? existingRow.transmission,
              fuel_type: (merged.fuel_type as string | null) ?? existingRow.fuel_type,
              drivetrain: (merged.drivetrain as string | null) ?? existingRow.drivetrain,
              body_type: (merged.body_type as string | null) ?? existingRow.body_type,
              colour: (merged.colour as string | null) ?? existingRow.colour,
            });

            // Upload images to Kijiji
            const mergedImages = (merged.image_urls as string[] | null) ?? [];
            let kijijiImageUrls: string[] = [];
            if (mergedImages.length > 0) {
              kijijiImageUrls = await kijijiUploadImages(session, mergedImages);
            }

            const adPayload = {
              title: (merged.kijiji_title as string) ?? existingRow.kijiji_title,
              description: uniqueDesc,
              price: (merged.price as number | null) ?? existingRow.price,
              attributes: attrs,
              imageUrls: kijijiImageUrls,
            };

            // Try editing the existing ad first; fall back to delete + repost
            try {
              await kijijiEditAd(session, existingRow.kijiji_ad_id, adPayload);
              updates.kijiji_description = uniqueDesc;
            } catch {
              // Edit failed — delete old ad and repost
              await kijijiDeleteAd(session, existingRow.kijiji_ad_id);
              const posted = await kijijiPostAd(session, adPayload);
              updates.kijiji_ad_id = posted.adId;
              updates.kijiji_description = uniqueDesc;
              updates.posted_at = new Date().toISOString();
              updates.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            }

            results.reposted++;
            repostCount++;
          } catch (err) {
            // If re-post fails, reset to draft so it can be manually re-posted
            updates.kijiji_status = "draft";
            updates.kijiji_ad_id = null;
            results.repost_errors.push({
              id: existingRow.id,
              error: err instanceof Error ? err.message : "Re-post failed",
            });
          }
        }
      }

      await supabase
        .from("kijiji_listings")
        .update(updates)
        .eq("id", existingRow.id);

      results.updated++;
    } else {
      // New vehicle — insert as draft
      const insert: Record<string, unknown> = {};
      for (const field of SYNC_FIELDS) {
        if (v[field] !== undefined) insert[field] = v[field];
      }

      // Required fields
      insert.autotrader_title =
        insert.autotrader_title ?? insert.kijiji_title ?? "Unknown";
      insert.kijiji_title =
        insert.kijiji_title ?? insert.autotrader_title ?? "Unknown";
      insert.kijiji_description = insert.kijiji_description ?? "";
      insert.vehicle_year = insert.vehicle_year ?? 0;
      insert.vehicle_make = insert.vehicle_make ?? "Unknown";
      insert.vehicle_model = insert.vehicle_model ?? "Unknown";
      insert.kijiji_status = "draft";

      const { error: insErr } = await supabase
        .from("kijiji_listings")
        .insert(insert);

      if (!insErr) results.inserted++;
    }
  }

  return NextResponse.json({
    ...results,
    total_incoming: incoming.length,
    total_existing: existing?.length ?? 0,
  });
}
