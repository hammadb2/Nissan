import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-flag listings that need refresh (listed more than 3 days ago)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const listings = (data ?? []).map((listing) => {
    if (
      listing.status === "listed" &&
      listing.listed_at &&
      new Date(listing.last_refreshed_at ?? listing.listed_at) < threeDaysAgo
    ) {
      return { ...listing, status: "needs_refresh" };
    }
    return listing;
  });

  return NextResponse.json({ listings });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { data, error } = await supabase
    .from("listings")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
