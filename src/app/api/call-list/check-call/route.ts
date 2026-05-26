import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  listPhoneNumbers,
  listCalls,
  listRecentCalls,
  getCallTranscript,
  getCallSummary,
  getCallRecordings,
} from "@/lib/quo-api";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

function dialogueToTranscript(
  dialogue: Array<{ content: string; userId: string | null; identifier: string | null }>
): string {
  return dialogue
    .map((entry) => {
      const speaker = entry.userId ? "Agent" : entry.identifier ?? "Customer";
      return `${speaker}: ${entry.content}`;
    })
    .join("\n");
}

/**
 * POST /api/call-list/check-call
 * After Jea makes a call via Quo, this endpoint:
 * 1. Finds the most recent call to/from that phone number in Quo
 * 2. Fetches transcript, summary, recording
 * 3. Upserts into call_records and links to the contact
 * 4. Returns the call result
 */
export async function POST(req: NextRequest) {
  try {
    const { contactId, phone } = await req.json();
    if (!contactId || !phone) {
      return NextResponse.json({ error: "contactId and phone are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const normalizedPhone = normalizePhone(phone);
    const phoneDigits = phone.replace(/\D/g, "");

    // Try 0: Check our own DB first — the call may already be synced
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: dbCall } = await supabase
      .from("call_records")
      .select("id, quo_call_id, duration_seconds, called_at, transcript, quo_summary, recording_url, direction, outcome, from_number, to_number")
      .or(`from_number.eq.${normalizedPhone},to_number.eq.${normalizedPhone}`)
      .gte("called_at", todayStart.toISOString())
      .order("called_at", { ascending: false })
      .limit(1)
      .single();

    if (dbCall) {
      // Link this call to the contact
      await supabase
        .from("call_records")
        .update({ contact_id: contactId })
        .eq("id", dbCall.id);

      const { count: callCount } = await supabase
        .from("call_records")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", contactId);

      await supabase
        .from("contacts")
        .update({
          call_count: callCount ?? 1,
          last_called_at: dbCall.called_at,
        })
        .eq("id", contactId);

      return NextResponse.json({
        status: "found",
        call: {
          quoCallId: dbCall.quo_call_id,
          direction: dbCall.direction,
          duration: dbCall.duration_seconds,
          calledAt: dbCall.called_at,
          outcome: dbCall.outcome,
          transcript: dbCall.transcript,
          summary: dbCall.quo_summary,
          recordingUrl: dbCall.recording_url,
        },
      });
    }

    // Also try DB lookup by digit matching on from/to numbers
    const { data: dbCalls } = await supabase
      .from("call_records")
      .select("id, quo_call_id, duration_seconds, called_at, transcript, quo_summary, recording_url, direction, outcome, from_number, to_number")
      .gte("called_at", todayStart.toISOString())
      .order("called_at", { ascending: false })
      .limit(100);

    const dbMatch = (dbCalls ?? []).find((c) => {
      const fromDigits = (c.from_number ?? "").replace(/\D/g, "");
      const toDigits = (c.to_number ?? "").replace(/\D/g, "");
      return fromDigits.includes(phoneDigits) || toDigits.includes(phoneDigits) ||
             phoneDigits.includes(fromDigits) || phoneDigits.includes(toDigits);
    });

    if (dbMatch) {
      await supabase
        .from("call_records")
        .update({ contact_id: contactId })
        .eq("id", dbMatch.id);

      const { count: callCount } = await supabase
        .from("call_records")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", contactId);

      await supabase
        .from("contacts")
        .update({
          call_count: callCount ?? 1,
          last_called_at: dbMatch.called_at,
        })
        .eq("id", contactId);

      return NextResponse.json({
        status: "found",
        call: {
          quoCallId: dbMatch.quo_call_id,
          direction: dbMatch.direction,
          duration: dbMatch.duration_seconds,
          calledAt: dbMatch.called_at,
          outcome: dbMatch.outcome,
          transcript: dbMatch.transcript,
          summary: dbMatch.quo_summary,
          recordingUrl: dbMatch.recording_url,
        },
      });
    }

    // If not in DB, search Quo API directly
    const phoneNumbers = await listPhoneNumbers();
    if (phoneNumbers.length === 0) {
      return NextResponse.json({ error: "No phone numbers found in Quo" }, { status: 404 });
    }

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    let latestCall = null;
    let matchedPhoneNumber = null;

    // Try Quo API: Search by participant (exact E.164 match)
    for (const pn of phoneNumbers) {
      try {
        const result = await listCalls(pn.id, normalizedPhone, {
          createdAfter: fourHoursAgo,
        });
        if (result.data.length > 0) {
          const sorted = result.data.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          if (!latestCall || new Date(sorted[0].createdAt) > new Date(latestCall.createdAt)) {
            latestCall = sorted[0];
            matchedPhoneNumber = pn;
          }
        }
      } catch {
        // Skip phone numbers that fail
      }
    }

    // Quo API fallback: fetch all recent calls and match by digits
    if (!latestCall) {
      for (const pn of phoneNumbers) {
        try {
          const result = await listRecentCalls(pn.id, fourHoursAgo);
          for (const call of result.data) {
            const callParticipants = call.participants ?? [];
            const callDigitsMatch = callParticipants.some((p) => {
              const pDigits = p.replace(/\D/g, "");
              return pDigits.includes(phoneDigits) || phoneDigits.includes(pDigits);
            });
            if (callDigitsMatch) {
              if (!latestCall || new Date(call.createdAt) > new Date(latestCall.createdAt)) {
                latestCall = call;
                matchedPhoneNumber = pn;
              }
            }
          }
        } catch {
          // Skip
        }
      }
    }

    if (!latestCall || !matchedPhoneNumber) {
      return NextResponse.json({
        status: "not_found",
        message: "No recent call found for this number. The auto-sync runs every 10 seconds — wait a moment and try again.",
      });
    }

    // Check if we already have this call
    const { data: existing } = await supabase
      .from("call_records")
      .select("id")
      .eq("quo_call_id", latestCall.id)
      .single();

    // Fetch transcript
    let transcript: string | null = null;
    let transcriptReceived = false;
    try {
      const transcriptData = await getCallTranscript(latestCall.id);
      if (transcriptData.status === "completed" && transcriptData.dialogue) {
        transcript = dialogueToTranscript(transcriptData.dialogue);
        transcriptReceived = true;
      }
    } catch {
      // May not be ready yet
    }

    // Fetch summary
    let quoSummary: string | null = null;
    let summaryReceived = false;
    try {
      const summaryData = await getCallSummary(latestCall.id);
      if (summaryData.status === "completed") {
        const parts = [
          ...(summaryData.summary ?? []),
          ...(summaryData.nextSteps ?? []),
        ];
        quoSummary = parts.join("\n") || null;
        summaryReceived = !!quoSummary;
      }
    } catch {
      // May not be ready yet
    }

    // Fetch recording
    let recordingUrl: string | null = null;
    try {
      const recordings = await getCallRecordings(latestCall.id);
      const completed = recordings.find((r) => r.status === "completed" && r.url);
      recordingUrl = completed?.url ?? null;
    } catch {
      // May not be available
    }

    // Determine from/to
    const fromNumber = latestCall.direction === "outgoing"
      ? matchedPhoneNumber.number
      : normalizedPhone;
    const toNumber = latestCall.direction === "outgoing"
      ? normalizedPhone
      : matchedPhoneNumber.number;

    // Determine outcome based on call data
    let outcome: string | null = null;
    const duration = latestCall.duration ?? 0;
    if (duration === 0 || !latestCall.answeredAt) {
      outcome = "no_answer";
    } else if (duration < 15) {
      outcome = "voicemail";
    }

    if (existing) {
      // Update existing record
      await supabase
        .from("call_records")
        .update({
          contact_id: contactId,
          transcript: transcript ?? undefined,
          transcript_received: transcriptReceived || undefined,
          quo_summary: quoSummary ?? undefined,
          summary_received: summaryReceived || undefined,
          recording_url: recordingUrl ?? undefined,
          from_number: fromNumber,
          to_number: toNumber,
          direction: latestCall.direction,
          outcome: outcome ?? undefined,
        })
        .eq("id", existing.id);
    } else {
      // Insert new record
      await supabase.from("call_records").upsert(
        {
          quo_call_id: latestCall.id,
          contact_id: contactId,
          duration_seconds: latestCall.duration ?? null,
          called_at: latestCall.createdAt,
          transcript,
          quo_summary: quoSummary,
          transcript_received: transcriptReceived,
          summary_received: summaryReceived,
          recording_url: recordingUrl,
          from_number: fromNumber,
          to_number: toNumber,
          direction: latestCall.direction,
          outcome,
        },
        { onConflict: "quo_call_id" }
      );
    }

    // Update contact call_count and last_called_at
    const { count: callCount } = await supabase
      .from("call_records")
      .select("*", { count: "exact", head: true })
      .eq("contact_id", contactId);

    await supabase
      .from("contacts")
      .update({
        call_count: callCount ?? 1,
        last_called_at: latestCall.createdAt,
      })
      .eq("id", contactId);

    return NextResponse.json({
      status: "found",
      call: {
        quoCallId: latestCall.id,
        direction: latestCall.direction,
        duration: latestCall.duration,
        calledAt: latestCall.createdAt,
        outcome,
        transcript,
        summary: quoSummary,
        recordingUrl,
      },
    });
  } catch (error) {
    console.error("Check call error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
