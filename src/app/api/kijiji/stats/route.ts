import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const [accountsRes, listingsRes, inquiriesRes, todayInquiriesRes] =
    await Promise.all([
      supabase.from("kijiji_accounts").select("id, status"),
      supabase.from("kijiji_listings").select("id, kijiji_status"),
      supabase.from("kijiji_inquiries").select("id, replied"),
      supabase
        .from("kijiji_inquiries")
        .select("id")
        .gte(
          "created_at",
          new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        ),
    ]);

  const accounts = accountsRes.data ?? [];
  const listings = listingsRes.data ?? [];
  const inquiries = inquiriesRes.data ?? [];
  const todayInquiries = todayInquiriesRes.data ?? [];

  return NextResponse.json({
    total_accounts: accounts.length,
    active_accounts: accounts.filter((a) => a.status === "active").length,
    total_listings: listings.length,
    posted_listings: listings.filter((l) => l.kijiji_status === "posted")
      .length,
    draft_listings: listings.filter((l) => l.kijiji_status === "draft").length,
    total_inquiries: inquiries.length,
    unreplied_inquiries: inquiries.filter((i) => !i.replied).length,
    inquiries_today: todayInquiries.length,
  });
}
