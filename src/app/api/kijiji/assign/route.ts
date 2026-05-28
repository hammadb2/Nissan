import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  scrapeAutoTraderInventory,
  generateKijijiTitle,
  generateKijijiDescription,
} from "@/lib/autotrader-scraper";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  if (body.auto_assign) {
    const { data: accounts, error: accErr } = await supabase
      .from("kijiji_accounts")
      .select("*")
      .eq("status", "active")
      .order("listings_count", { ascending: true });

    if (accErr || !accounts?.length) {
      return NextResponse.json(
        { error: "No active accounts. Seed accounts first." },
        { status: 400 }
      );
    }

    const vehicles = await scrapeAutoTraderInventory({ offer: "U" });

    const { data: existing } = await supabase
      .from("kijiji_listings")
      .select("autotrader_title")
      .in("kijiji_status", ["draft", "posted"]);

    const existingTitles = new Set(
      (existing ?? []).map((e) => e.autotrader_title)
    );

    const newVehicles = vehicles.filter(
      (v) => !existingTitles.has(v.title)
    );

    if (newVehicles.length === 0) {
      return NextResponse.json({
        message: "All vehicles already assigned",
        assigned: 0,
      });
    }

    const assignments = newVehicles.map((vehicle, idx) => {
      const account = accounts[idx % accounts.length];
      return {
        account_id: account.id,
        autotrader_title: vehicle.title,
        kijiji_title: generateKijijiTitle(vehicle),
        kijiji_description: generateKijijiDescription(vehicle),
        vehicle_year: vehicle.year,
        vehicle_make: vehicle.make,
        vehicle_model: vehicle.model,
        vehicle_trim: vehicle.trim || null,
        mileage: vehicle.mileage,
        price: vehicle.price,
        fuel_type: vehicle.fuel_type,
        transmission: vehicle.transmission,
        features: vehicle.features.join("\n"),
        kijiji_status: "draft" as const,
      };
    });

    const { data: inserted, error: insErr } = await supabase
      .from("kijiji_listings")
      .insert(assignments)
      .select();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    const countsByAccount: Record<string, number> = {};
    for (const a of assignments) {
      countsByAccount[a.account_id] =
        (countsByAccount[a.account_id] || 0) + 1;
    }

    for (const [accountId, count] of Object.entries(countsByAccount)) {
      const acct = accounts.find((a) => a.id === accountId);
      if (acct) {
        await supabase
          .from("kijiji_accounts")
          .update({
            listings_count: (acct.listings_count ?? 0) + count,
            updated_at: new Date().toISOString(),
          })
          .eq("id", accountId);
      }
    }

    return NextResponse.json({
      assigned: inserted?.length ?? 0,
      listings: inserted,
    });
  }

  const { account_id, vehicle } = body;

  if (!account_id || !vehicle) {
    return NextResponse.json(
      { error: "account_id and vehicle required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("kijiji_listings")
    .insert({
      account_id,
      autotrader_title: vehicle.title,
      kijiji_title: generateKijijiTitle(vehicle),
      kijiji_description: generateKijijiDescription(vehicle),
      vehicle_year: vehicle.year,
      vehicle_make: vehicle.make,
      vehicle_model: vehicle.model,
      vehicle_trim: vehicle.trim || null,
      mileage: vehicle.mileage,
      price: vehicle.price,
      fuel_type: vehicle.fuel_type,
      transmission: vehicle.transmission,
      features: vehicle.features?.join("\n") ?? null,
      kijiji_status: "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
