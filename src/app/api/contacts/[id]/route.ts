import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const { data: callRecords } = await supabase
    .from("call_records")
    .select("*")
    .eq("contact_id", id)
    .order("called_at", { ascending: false });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("contact_id", id)
    .order("due_at", { ascending: true });

  const { data: appointments } = await supabase
    .from("appointments")
    .select("*")
    .eq("contact_id", id)
    .order("scheduled_at", { ascending: false });

  return NextResponse.json({
    contact,
    call_records: callRecords ?? [],
    tasks: tasks ?? [],
    appointments: appointments ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { data, error } = await supabase
    .from("contacts")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
