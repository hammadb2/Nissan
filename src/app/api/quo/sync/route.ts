import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  listPhoneNumbers,
  getAllConversations,
  getAllCallsForParticipant,
  getCallTranscript,
  getCallSummary,
  getCallRecordings,
} from "@/lib/quo-api";
import { normalizePhone } from "@/lib/phone";
import type { QuoApiCall } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const createdAfter = (body as Record<string, string>).createdAfter ?? undefined;
    const createdBefore = (body as Record<string, string>).createdBefore ?? undefined;
    const phoneNumberIdFilter = (body as Record<string, string>).phoneNumberId ?? undefined;

    const supabase = getSupabaseAdmin();

    // 1. Get all workspace phone numbers
    const phoneNumbers = await listPhoneNumbers();
    const numbersToSync = phoneNumberIdFilter
      ? phoneNumbers.filter((pn) => pn.id === phoneNumberIdFilter)
      : phoneNumbers;

    if (numbersToSync.length === 0) {
      return NextResponse.json({ error: "No phone numbers found" }, { status: 404 });
    }

    let totalCalls = 0;
    let newCalls = 0;
    let updatedCalls = 0;
    const errors: string[] = [];
    const dailyCallCounts: Record<string, number> = {};

    // 2. For each phone number, get conversations to discover participants
    for (const phoneNumber of numbersToSync) {
      let conversations;
      try {
        conversations = await getAllConversations(phoneNumber.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to list conversations for ${phoneNumber.number}: ${msg}`);
        continue;
      }

      // Extract unique external participants from conversations
      const participants = new Set<string>();
      for (const conv of conversations) {
        for (const p of conv.participants) {
          if (p !== phoneNumber.number) {
            participants.add(p);
          }
        }
      }

      // 3. For each participant, fetch calls
      for (const participant of participants) {
        let calls: QuoApiCall[];
        try {
          calls = await getAllCallsForParticipant(phoneNumber.id, participant, {
            createdAfter,
            createdBefore,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to list calls for ${participant}: ${msg}`);
          continue;
        }

        for (const call of calls) {
          totalCalls++;

          // Check if we already have this call
          const { data: existing } = await supabase
            .from("call_records")
            .select("id, transcript_received, summary_received, recording_url")
            .eq("quo_call_id", call.id)
            .single();

          // Look up contact by external participant phone
          const externalPhone = call.participants.find((p) => p !== phoneNumber.number);
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

          // Fetch transcript if not already received
          let transcript: string | null = null;
          let transcriptReceived = existing?.transcript_received ?? false;
          if (!transcriptReceived) {
            try {
              const transcriptData = await getCallTranscript(call.id);
              if (transcriptData.status === "completed" && transcriptData.dialogue) {
                transcript = dialogueToTranscript(transcriptData.dialogue);
                transcriptReceived = true;
              }
            } catch {
              // Transcript may not be available for all calls
            }
            await sleep(100);
          }

          // Fetch summary if not already received
          let quoSummary: string | null = null;
          let summaryReceived = existing?.summary_received ?? false;
          if (!summaryReceived) {
            try {
              const summaryData = await getCallSummary(call.id);
              if (summaryData.status === "completed") {
                const parts = [
                  ...(summaryData.summary ?? []),
                  ...(summaryData.nextSteps ?? []),
                ];
                quoSummary = parts.join("\n") || null;
                summaryReceived = !!quoSummary;
              }
            } catch {
              // Summary may not be available for all calls
            }
            await sleep(100);
          }

          // Fetch recording URL if not already stored
          let recordingUrl: string | null = existing?.recording_url ?? null;
          if (!recordingUrl) {
            try {
              const recordings = await getCallRecordings(call.id);
              const completedRecording = recordings.find(
                (r) => r.status === "completed" && r.url
              );
              recordingUrl = completedRecording?.url ?? null;
            } catch {
              // Recording may not be available
            }
            await sleep(100);
          }

          // Track daily call count
          const callDate = call.createdAt.split("T")[0];
          dailyCallCounts[callDate] = (dailyCallCounts[callDate] ?? 0) + 1;

          // Determine from/to numbers
          const fromNumber = call.direction === "outgoing"
            ? phoneNumber.number
            : (externalPhone ?? null);
          const toNumber = call.direction === "outgoing"
            ? (externalPhone ?? null)
            : phoneNumber.number;

          if (existing) {
            // Update existing record with any new data
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
            if (contactId) {
              updateFields.contact_id = contactId;
            }
            if (fromNumber) {
              updateFields.from_number = fromNumber;
            }
            if (toNumber) {
              updateFields.to_number = toNumber;
            }
            if (call.direction) {
              updateFields.direction = call.direction;
            }

            if (Object.keys(updateFields).length > 0) {
              await supabase
                .from("call_records")
                .update(updateFields)
                .eq("id", existing.id);
              updatedCalls++;
            }
          } else {
            // Insert new call record
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
            newCalls++;
          }

          // Rate limit: 5 req/s max for Quo API
          await sleep(200);
        }
      }
    }

    // 4. Update daily_stats based on synced records
    for (const [date, count] of Object.entries(dailyCallCounts)) {
      const { data: existingStats } = await supabase
        .from("daily_stats")
        .select("*")
        .eq("date", date)
        .eq("user_role", "jea")
        .single();

      // Count actual calls from the DB for this date
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;
      const { count: dbCallCount } = await supabase
        .from("call_records")
        .select("*", { count: "exact", head: true })
        .gte("called_at", startOfDay)
        .lte("called_at", endOfDay);

      const actualCount = dbCallCount ?? count;

      if (existingStats) {
        if (actualCount > existingStats.calls_made) {
          await supabase
            .from("daily_stats")
            .update({ calls_made: actualCount })
            .eq("id", existingStats.id);
        }
      } else {
        await supabase.from("daily_stats").insert({
          date,
          user_role: "jea",
          calls_made: actualCount,
        });
      }
    }

    return NextResponse.json({
      status: "complete",
      totalCalls,
      newCalls,
      updatedCalls,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Quo sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
