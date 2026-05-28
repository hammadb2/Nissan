import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateUniqueDescription } from "@/lib/kijiji-safety";

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

    // Pull unassigned draft listings (no account_id yet)
    const { data: drafts, error: draftErr } = await supabase
      .from("kijiji_listings")
      .select("*")
      .eq("kijiji_status", "draft")
      .is("account_id", null);

    if (draftErr) {
      return NextResponse.json({ error: draftErr.message }, { status: 500 });
    }

    if (!drafts?.length) {
      return NextResponse.json({
        message: "No unassigned vehicles found. Run the AutoTrader scraper extension first.",
        assigned: 0,
      });
    }

    // 1 listing per account max — cap assignments at number of accounts
    const maxListings = Math.min(drafts.length, accounts.length);
    let assigned = 0;

    for (let i = 0; i < maxListings; i++) {
      const draft = drafts[i];
      const account = accounts[i];

      const uniqueDesc = generateUniqueDescription(draft);

      const { error: updateErr } = await supabase
        .from("kijiji_listings")
        .update({
          account_id: account.id,
          kijiji_description: uniqueDesc,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);

      if (!updateErr) {
        assigned++;
      }
    }

    // Update account listing counts (1 per account)
    for (let i = 0; i < maxListings; i++) {
      const account = accounts[i];
      await supabase
        .from("kijiji_accounts")
        .update({
          listings_count: (account.listings_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    }

    return NextResponse.json({
      assigned,
      total_drafts: drafts.length,
      skipped: drafts.length - maxListings,
      max_accounts: accounts.length,
    });
  }

  const { account_id, listing_id } = body;

  if (!account_id || !listing_id) {
    return NextResponse.json(
      { error: "account_id and listing_id required" },
      { status: 400 }
    );
  }

  const { data: listing, error: listErr } = await supabase
    .from("kijiji_listings")
    .select("*")
    .eq("id", listing_id)
    .single();

  if (listErr || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const uniqueDesc = generateUniqueDescription(listing);

  const { data, error } = await supabase
    .from("kijiji_listings")
    .update({
      account_id,
      kijiji_description: uniqueDesc,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listing_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
