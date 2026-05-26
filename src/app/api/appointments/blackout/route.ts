import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("blackout_dates")
    .select("*")
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ blackout_dates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { date, reason } = body as { date?: string; reason?: string };

  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("blackout_dates")
    .insert({ date, reason: reason ?? null, created_by: "hammad" })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Date already blacked out" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ blackout_date: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("blackout_dates")
    .delete()
    .eq("date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "removed" });
}
