import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  listPhoneNumbers,
  listCalls,
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

    // Get workspace phone numbers
    const phoneNumbers = await listPhoneNumbers();
    if (phoneNumbers.length === 0) {
      return NextResponse.json({ error: "No phone numbers found in Quo" }, { status: 404 });
    }

    // Look for recent calls to this number (last 30 minutes)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    let latestCall = null;
    let matchedPhoneNumber = null;

    for (const pn of phoneNumbers) {
      try {
        const result = await listCalls(pn.id, normalizedPhone, {
          createdAfter: thirtyMinAgo,
        });
        if (result.data.length > 0) {
          // Get the most recent call
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

    if (!latestCall || !matchedPhoneNumber) {
      return NextResponse.json({
        status: "not_found",
        message: "No recent call found in Quo for this number. Try again in a moment.",
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
