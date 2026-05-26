import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  listPhoneNumbers,
  listRecentCalls,
  getCallTranscript,
  getCallSummary,
  getCallRecordings,
} from "@/lib/quo-api";
import { normalizePhone } from "@/lib/phone";
import { analyzeCall } from "@/lib/analyze-call";
import type { QuoApiCall } from "@/lib/types";

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
 * GET /api/quo/sync-recent
 * Lightweight sync — fetches calls from the last 2 minutes and
 * runs GPT analysis on any unprocessed calls with transcripts.
 * Polled every 10 seconds from the dashboard layout.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const phoneNumbers = await listPhoneNumbers();
    if (phoneNumbers.length === 0) {
      return NextResponse.json({ synced: 0, analyzed: 0 });
    }

    let synced = 0;
    let skipped = 0;

    for (const pn of phoneNumbers) {
      let recentCalls: QuoApiCall[];
      try {
        const result = await listRecentCalls(pn.id, fifteenMinAgo);
        recentCalls = result.data;
      } catch {
        continue;
      }

      for (const call of recentCalls) {
        const { data: existing } = await supabase
          .from("call_records")
          .select("id, transcript_received, summary_received, recording_url")
          .eq("quo_call_id", call.id)
          .single();

        const needsUpdate = existing && (
          !existing.transcript_received ||
          !existing.summary_received ||
          !existing.recording_url
        );

        if (existing && !needsUpdate) {
          skipped++;
          continue;
        }

        const externalPhone = call.participants.find((p: string) => p !== pn.number);
        const customerPhone = externalPhone ? normalizePhone(externalPhone) : null;

        let contactId: string | null = null;
        if (customerPhone) {
          const { data: contact } = await supabase
            .from("contacts")
            .select("id")
            .eq("phone", customerPhone)
            .single();
          contactId = contact?.id ?? null;
        }

        let transcript: string | null = null;
        let transcriptReceived = false;
        try {
          const td = await getCallTranscript(call.id);
          if (td.status === "completed" && td.dialogue) {
            transcript = dialogueToTranscript(td.dialogue);
            transcriptReceived = true;
          }
        } catch { /* not ready yet */ }

        let quoSummary: string | null = null;
        let summaryReceived = false;
        try {
          const sd = await getCallSummary(call.id);
          if (sd.status === "completed") {
            const parts = [...(sd.summary ?? []), ...(sd.nextSteps ?? [])];
            quoSummary = parts.join("\n") || null;
            summaryReceived = !!quoSummary;
          }
        } catch { /* not ready yet */ }

        let recordingUrl: string | null = null;
        try {
          const recordings = await getCallRecordings(call.id);
          const completed = recordings.find((r) => r.status === "completed" && r.url);
          recordingUrl = completed?.url ?? null;
        } catch { /* not available */ }

        const fromNumber = call.direction === "outgoing" ? pn.number : (externalPhone ?? null);
        const toNumber = call.direction === "outgoing" ? (externalPhone ?? null) : pn.number;

        if (existing) {
          const updateFields: Record<string, unknown> = {};
          if (transcript && !existing.transcript_received) {
            updateFields.transcript = transcript;
            updateFields.transcript_received = true;
          }
          if (quoSummary && !existing.summary_received) {
            updateFields.quo_summary = quoSummary;
            updateFields.summary_received = true;
          }
          if (recordingUrl && !existing.recording_url) {
            updateFields.recording_url = recordingUrl;
          }
          if (contactId) updateFields.contact_id = contactId;
          if (fromNumber) updateFields.from_number = fromNumber;
          if (toNumber) updateFields.to_number = toNumber;
          if (call.direction) updateFields.direction = call.direction;

          if (Object.keys(updateFields).length > 0) {
            await supabase
              .from("call_records")
              .update(updateFields)
              .eq("id", existing.id);
            synced++;
          }
        } else {
          // Check for a manually-marked record that matches this call's phone
          const phoneDigits = customerPhone ? customerPhone.replace(/\D/g, "") : null;
          let manualRecord = null;
          if (phoneDigits && contactId) {
            const { data: manualRows } = await supabase
              .from("call_records")
              .select("id, manual_notes")
              .eq("contact_id", contactId)
              .eq("manually_marked", true)
              .is("quo_call_id", null)
              .order("called_at", { ascending: false })
              .limit(1);
            manualRecord = manualRows?.[0] ?? null;
          }

          if (manualRecord) {
            // Merge Quo data into the manually-marked record
            await supabase
              .from("call_records")
              .update({
                quo_call_id: call.id,
                duration_seconds: call.duration ?? null,
                called_at: call.createdAt,
                transcript,
                quo_summary: quoSummary,
                transcript_received: transcriptReceived,
                summary_received: summaryReceived,
                recording_url: recordingUrl,
                from_number: fromNumber,
                to_number: toNumber,
                direction: call.direction ?? null,
                manually_marked: false,
              })
              .eq("id", manualRecord.id);
          } else {
            await supabase.from("call_records").upsert(
              {
                quo_call_id: call.id,
                contact_id: contactId,
                duration_seconds: call.duration ?? null,
                called_at: call.createdAt,
                transcript,
                quo_summary: quoSummary,
                transcript_received: transcriptReceived,
                summary_received: summaryReceived,
                recording_url: recordingUrl,
                from_number: fromNumber,
                to_number: toNumber,
                direction: call.direction ?? null,
              },
              { onConflict: "quo_call_id" }
            );
          }
          synced++;

          if (contactId) {
            const { count: contactCallCount } = await supabase
              .from("call_records")
              .select("*", { count: "exact", head: true })
              .eq("contact_id", contactId);

            await supabase
              .from("contacts")
              .update({
                call_count: contactCallCount ?? 1,
                last_called_at: call.createdAt,
              })
              .eq("id", contactId);
          }
        }
      }
    }

    // --- GPT analysis pass: process up to 2 unanalyzed calls per cycle ---
    let analyzed = 0;
    const { data: unprocessed } = await supabase
      .from("call_records")
      .select("id, transcript, quo_summary, contact_id")
      .eq("gpt_processed", false)
      .eq("transcript_received", true)
      .not("transcript", "is", null)
      .order("called_at", { ascending: false })
      .limit(2);

    for (const record of unprocessed ?? []) {
      try {
        const analysis = await analyzeCall(record.transcript!, record.quo_summary);

        await supabase
          .from("call_records")
          .update({
            gpt_summary: analysis.gpt_summary,
            crm_notes: analysis.crm_notes,
            outcome: analysis.outcome,
            sentiment: analysis.sentiment,
            interest_level: analysis.interest_level,
            next_action: analysis.next_action,
            next_action_at: analysis.next_action_at,
            next_action_details: analysis.next_action_details,
            what_went_well: analysis.what_went_well,
            coaching_tip: analysis.coaching_tip,
            is_recent_buyer_flag: analysis.is_recent_buyer,
            recent_buyer_flag_reason: analysis.recent_buyer_flag_reason,
            vehicle_ownership_duration: analysis.vehicle_ownership_duration,
            trade_in_available: analysis.trade_in_available,
            monthly_budget: analysis.monthly_budget,
            gpt_processed: true,
          })
          .eq("id", record.id);

        if (record.contact_id) {
          await supabase
            .from("contacts")
            .update({
              interest_level: analysis.interest_level,
              next_action: analysis.next_action,
              next_action_at: analysis.next_action_at,
              updated_at: new Date().toISOString(),
            })
            .eq("id", record.contact_id);
        }

        analyzed++;
      } catch {
        // GPT may fail — will retry next cycle
      }
    }

    return NextResponse.json({ synced, skipped, analyzed });
  } catch (error) {
    console.error("Quick sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
