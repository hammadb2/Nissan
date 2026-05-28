import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const accountId = searchParams.get("account_id");

  let query = supabase
    .from("kijiji_listings")
    .select("*, kijiji_accounts(*)")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("kijiji_status", status);
  }
  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listings: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { id, action } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (action === "mark_posted") {
    const { data, error } = await supabase
      .from("kijiji_listings")
      .update({
        kijiji_status: "posted",
        posted_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  if (action === "mark_sold") {
    const { data, error } = await supabase
      .from("kijiji_listings")
      .update({
        kijiji_status: "sold",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  if (action === "remove") {
    const { data, error } = await supabase
      .from("kijiji_listings")
      .update({
        kijiji_status: "removed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
