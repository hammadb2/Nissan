import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const assignedTo = searchParams.get("assigned_to") ?? "jea";

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("tasks")
    .select("*, contacts(*)")
    .eq("assigned_to", assignedTo)
    .eq("completed", false)
    .lte("due_at", endOfToday.toISOString())
    .order("due_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: data ?? [] });
}
