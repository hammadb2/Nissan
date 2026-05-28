import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const unreplied = searchParams.get("unreplied");

  let query = supabase
    .from("kijiji_inquiries")
    .select("*, kijiji_listings(*), kijiji_accounts(*)")
    .order("created_at", { ascending: false });

  if (unreplied === "true") {
    query = query.eq("replied", false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inquiries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  if (body.parse_email) {
    const { to_email, subject, body: emailBody, from_email, from_name } = body;

    const { data: account } = await supabase
      .from("kijiji_accounts")
      .select("id")
      .eq("employee_email", to_email)
      .single();

    let kijijiListingId: string | null = null;
    if (account) {
      const { data: listings } = await supabase
        .from("kijiji_listings")
        .select("id, kijiji_title")
        .eq("account_id", account.id)
        .eq("kijiji_status", "posted");

      if (listings?.length) {
        const subjectLower = (subject || "").toLowerCase();
        const bodyLower = (emailBody || "").toLowerCase();
        const match = listings.find(
          (l) =>
            subjectLower.includes(l.kijiji_title.toLowerCase()) ||
            bodyLower.includes(l.kijiji_title.toLowerCase())
        );
        if (match) kijijiListingId = match.id;
      }
    }

    const phoneMatch = (emailBody || "").match(
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
    );

    const inquiry = {
      kijiji_listing_id: kijijiListingId,
      account_id: account?.id ?? null,
      customer_name: from_name || null,
      customer_email: from_email || null,
      customer_phone: phoneMatch ? phoneMatch[0] : null,
      message: emailBody || null,
      source_email_subject: subject || null,
    };

    const { data, error } = await supabase
      .from("kijiji_inquiries")
      .insert(inquiry)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (kijijiListingId) {
      await supabase.rpc("increment_inquiry_count", {
        listing_id: kijijiListingId,
      }).then(undefined, () => {
        supabase
          .from("kijiji_listings")
          .update({
            inquiry_count: (data as { inquiry_count?: number }).inquiry_count
              ? ((data as { inquiry_count?: number }).inquiry_count ?? 0) + 1
              : 1,
          })
          .eq("id", kijijiListingId);
      });
    }

    return NextResponse.json(data, { status: 201 });
  }

  const { id, reply_message } = body;

  if (id && reply_message) {
    const { data, error } = await supabase
      .from("kijiji_inquiries")
      .update({
        replied: true,
        replied_at: new Date().toISOString(),
        reply_message,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
