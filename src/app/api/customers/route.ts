import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const phone = searchParams.get("phone");

  if (phone) {
    const { data, error } = await getSupabaseAdmin()
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .order("purchase_date", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({ customer: null, is_recent_buyer: false });
    }

    const isRecentBuyer = data.purchase_date
      ? new Date(data.purchase_date) >
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
      : false;

    return NextResponse.json({ customer: data, is_recent_buyer: isRecentBuyer });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("customers")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { data, error } = await getSupabaseAdmin()
    .from("customers")
    .insert({
      name: body.name,
      phone: body.phone,
      email: body.email,
      purchase_date: body.purchase_date,
      vehicle_purchased: body.vehicle_purchased,
      notes: body.notes,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
