import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/facebook/alerts — fetch unresolved alerts for the dashboard
 * POST /api/facebook/alerts — extension creates a new alert
 */
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("facebook_alerts")
    .select("*")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { alert_type, message, listing_id } = body;

  if (!alert_type || !message) {
    return NextResponse.json(
      { error: "alert_type and message required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("facebook_alerts")
    .insert({
      alert_type,
      message,
      listing_id: listing_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
