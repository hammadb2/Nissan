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

    // Pull unassigned draft listings from kijiji_listings (scraped by extension)
    const { data: drafts, error: draftErr } = await supabase
      .from("kijiji_listings")
      .select("*")
      .eq("kijiji_status", "draft")
      .is("kijiji_ad_id", null);

    if (draftErr) {
      return NextResponse.json({ error: draftErr.message }, { status: 500 });
    }

    if (!drafts?.length) {
      return NextResponse.json({
        message: "No unassigned vehicles found. Run the AutoTrader scraper extension first.",
        assigned: 0,
      });
    }

    // Round-robin assign across accounts
    let assigned = 0;
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      const account = accounts[i % accounts.length];

      // Generate unique description for each listing
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

    // Update account listing counts
    const countsByAccount: Record<string, number> = {};
    for (let i = 0; i < drafts.length; i++) {
      const accountId = accounts[i % accounts.length].id;
      countsByAccount[accountId] = (countsByAccount[accountId] || 0) + 1;
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
      assigned,
      total_drafts: drafts.length,
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
