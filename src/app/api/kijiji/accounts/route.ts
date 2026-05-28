import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EMPLOYEE_LIST } from "@/lib/autotrader-scraper";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("kijiji_accounts")
    .select("*")
    .order("employee_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  if (body.seed_all) {
    const accounts = EMPLOYEE_LIST.map((emp) => ({
      employee_name: emp.name,
      employee_email: emp.email,
      status: "active" as const,
      max_listings: 10,
    }));

    const { data, error } = await supabase
      .from("kijiji_accounts")
      .upsert(accounts, { onConflict: "employee_email" })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { accounts: data, created: data?.length ?? 0 },
      { status: 201 }
    );
  }

  const { employee_name, employee_email } = body;

  if (!employee_name || !employee_email) {
    return NextResponse.json(
      { error: "employee_name and employee_email required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("kijiji_accounts")
    .insert({ employee_name, employee_email })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
