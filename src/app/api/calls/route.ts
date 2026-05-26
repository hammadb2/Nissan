import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const contactId = searchParams.get("contact_id");

  let query = supabase
    .from("call_records")
    .select("*, contacts(*)", { count: "exact" })
    .order("called_at", { ascending: false })
    .limit(limit);

  if (contactId) {
    query = query.eq("contact_id", contactId);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ calls: data, total: count ?? 0 });
}
