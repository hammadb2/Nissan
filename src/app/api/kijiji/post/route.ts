import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  kijijiLogin,
  kijijiPostAd,
  buildVehicleAttributes,
} from "@/lib/kijiji-api";
import {
  generateUniqueDescription,
  getPostingDelay,
  checkServerLocation,
  sleep,
} from "@/lib/kijiji-safety";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  // IP check before any posting
  if (body.check_ip) {
    const loc = await checkServerLocation();
    return NextResponse.json(loc);
  }

  if (body.post_all_drafts) {
    const { data: drafts, error: draftErr } = await supabase
      .from("kijiji_listings")
      .select("*, kijiji_accounts(*)")
      .eq("kijiji_status", "draft");

    if (draftErr) {
      return NextResponse.json({ error: draftErr.message }, { status: 500 });
    }

    if (!drafts?.length) {
      return NextResponse.json({ message: "No drafts to post", posted: 0 });
    }

    const results: Array<{ listing_id: string; success: boolean; error?: string; delay_ms?: number }> = [];
    const sessionCache = new Map<string, Awaited<ReturnType<typeof kijijiLogin>>>();

    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      const account = draft.kijiji_accounts;
      if (!account) {
        results.push({
          listing_id: draft.id,
          success: false,
          error: "No account linked",
        });
        continue;
      }

      const password = process.env.KIJIJI_SHARED_PASSWORD;

      if (!password) {
        results.push({
          listing_id: draft.id,
          success: false,
          error: "KIJIJI_SHARED_PASSWORD env var not set",
        });
        continue;
      }

      // Rate limiting: random delay between posts (skip for first)
      if (i > 0) {
        const delay = getPostingDelay();
        await sleep(delay);
        results[results.length - 1].delay_ms = delay;
      }

      try {
        let session = sessionCache.get(account.employee_email);
        if (!session) {
          session = await kijijiLogin(account.employee_email, password);
          sessionCache.set(account.employee_email, session);
        }

        // Generate unique description to avoid copy-paste detection
        const uniqueDesc = generateUniqueDescription(draft);

        const attrs = buildVehicleAttributes({
          year: draft.vehicle_year,
          make: draft.vehicle_make,
          model: draft.vehicle_model,
          mileage: draft.mileage,
          transmission: draft.transmission,
          fuel_type: draft.fuel_type,
          colour: draft.colour,
        });

        const posted = await kijijiPostAd(session, {
          title: draft.kijiji_title,
          description: uniqueDesc,
          price: draft.price,
          attributes: attrs,
        });

        await supabase
          .from("kijiji_listings")
          .update({
            kijiji_status: "posted",
            kijiji_ad_id: posted.adId,
            kijiji_description: uniqueDesc,
            posted_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);

        results.push({ listing_id: draft.id, success: true });
      } catch (err) {
        results.push({
          listing_id: draft.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      posted: successCount,
      total: drafts.length,
      results,
    });
  }

  const { listing_id } = body;

  if (!listing_id) {
    return NextResponse.json({ error: "listing_id required" }, { status: 400 });
  }

  const { data: listing, error: listErr } = await supabase
    .from("kijiji_listings")
    .select("*, kijiji_accounts(*)")
    .eq("id", listing_id)
    .single();

  if (listErr || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const account = listing.kijiji_accounts;
  if (!account) {
    return NextResponse.json({ error: "No account linked" }, { status: 400 });
  }

  const password = process.env.KIJIJI_SHARED_PASSWORD;

  if (!password) {
    return NextResponse.json(
      { error: "KIJIJI_SHARED_PASSWORD env var not set" },
      { status: 400 }
    );
  }

  try {
    const session = await kijijiLogin(account.employee_email, password);

    // Generate unique description
    const uniqueDesc = generateUniqueDescription(listing);

    const attrs = buildVehicleAttributes({
      year: listing.vehicle_year,
      make: listing.vehicle_make,
      model: listing.vehicle_model,
      mileage: listing.mileage,
      transmission: listing.transmission,
      fuel_type: listing.fuel_type,
      colour: listing.colour,
    });

    const posted = await kijijiPostAd(session, {
      title: listing.kijiji_title,
      description: uniqueDesc,
      price: listing.price,
      attributes: attrs,
    });

    await supabase
      .from("kijiji_listings")
      .update({
        kijiji_status: "posted",
        kijiji_ad_id: posted.adId,
        kijiji_description: uniqueDesc,
        posted_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", listing_id);

    return NextResponse.json({ success: true, ad_id: posted.adId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Post failed" },
      { status: 500 }
    );
  }
}
