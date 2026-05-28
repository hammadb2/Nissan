import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { kijijiLogin, kijijiSendReply } from "@/lib/kijiji-api";

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
      const { error: rpcError } = await supabase.rpc("increment_inquiry_count", {
        listing_id: kijijiListingId,
      });

      if (rpcError) {
        const { data: currentListing } = await supabase
          .from("kijiji_listings")
          .select("inquiry_count")
          .eq("id", kijijiListingId)
          .single();

        await supabase
          .from("kijiji_listings")
          .update({
            inquiry_count: ((currentListing?.inquiry_count as number) ?? 0) + 1,
          })
          .eq("id", kijijiListingId);
      }
    }

    return NextResponse.json(data, { status: 201 });
  }

  const { id, reply_message } = body;

  if (id && reply_message) {
    const { data: inquiry, error: fetchErr } = await supabase
      .from("kijiji_inquiries")
      .select("*, kijiji_listings(*, kijiji_accounts(*))")
      .eq("id", id)
      .single();

    if (fetchErr || !inquiry) {
      return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    }

    let replyMethod: "kijiji" | "email" = "email";
    let kijijiReplyError: string | null = null;

    const listing = inquiry.kijiji_listings;
    const account = listing?.kijiji_accounts;

    if (account && listing?.kijiji_ad_id) {
      const password = process.env.KIJIJI_SHARED_PASSWORD;

      if (password) {
        try {
          const session = await kijijiLogin(account.employee_email, password);
          await kijijiSendReply(session, {
            adId: listing.kijiji_ad_id,
            replyName: account.employee_name,
            message: reply_message,
            conversationId: inquiry.kijiji_conversation_id ?? undefined,
          });
          replyMethod = "kijiji";
        } catch (err) {
          kijijiReplyError = err instanceof Error ? err.message : "Kijiji reply failed";
        }
      }
    }

    if (replyMethod === "email" && inquiry.customer_email && account) {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${account.employee_name} <${account.employee_email}>`,
              to: [inquiry.customer_email],
              subject: `Re: ${listing?.kijiji_title ?? "Your Kijiji Inquiry"}`,
              text: reply_message,
            }),
          });
          replyMethod = "email";
        } catch {
          // email send failed, still save the reply
        }
      }
    }

    const { data, error } = await supabase
      .from("kijiji_inquiries")
      .update({
        replied: true,
        replied_at: new Date().toISOString(),
        reply_message,
        reply_method: replyMethod,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ...data,
      reply_sent_via: replyMethod,
      kijiji_reply_error: kijijiReplyError,
    });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
