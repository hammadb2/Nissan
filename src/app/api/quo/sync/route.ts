import { NextRequest } from "next/server";
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

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const createdAfter = (body as Record<string, string>).createdAfter ?? undefined;
  const createdBefore = (body as Record<string, string>).createdBefore ?? undefined;
  const phoneNumberIdFilter = (body as Record<string, string>).phoneNumberId ?? undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sseMessage(event, data)));
      }

      try {
        const supabase = getSupabaseAdmin();

        send("progress", { phase: "discovering", message: "Fetching phone numbers..." });

        const phoneNumbers = await listPhoneNumbers();
        const numbersToSync = phoneNumberIdFilter
          ? phoneNumbers.filter((pn) => pn.id === phoneNumberIdFilter)
          : phoneNumbers;

        if (numbersToSync.length === 0) {
          send("error", { message: "No phone numbers found" });
          controller.close();
          return;
        }

        let totalCalls = 0;
        let newCalls = 0;
        let updatedCalls = 0;
        let skippedCalls = 0;
        const errors: string[] = [];
        const dailyCallCounts: Record<string, number> = {};

        send("progress", {
          phase: "discovering",
          message: `Found ${numbersToSync.length} phone number(s). Discovering conversations...`,
        });

        for (const phoneNumber of numbersToSync) {
          let conversations;
          try {
            conversations = await getAllConversations(phoneNumber.id);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to list conversations for ${phoneNumber.number}: ${msg}`);
            send("error", { message: `Failed to list conversations for ${phoneNumber.number}` });
            continue;
          }

          const participants = new Set<string>();
          for (const conv of conversations) {
            for (const p of conv.participants) {
              if (p !== phoneNumber.number) {
                participants.add(p);
              }
            }
          }

          send("progress", {
            phase: "discovering",
            message: `Found ${participants.size} contacts for ${phoneNumber.number}. Fetching calls...`,
          });

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

              const { data: existing } = await supabase
                .from("call_records")
                .select("id, transcript_received, summary_received, recording_url, from_number, to_number, direction")
                .eq("quo_call_id", call.id)
                .single();

              // Skip if fully synced
              if (
                existing &&
                existing.transcript_received &&
                existing.summary_received &&
                existing.recording_url &&
                existing.from_number &&
                existing.to_number &&
                existing.direction
              ) {
                skippedCalls++;
                const callDate = call.createdAt.split("T")[0];
                dailyCallCounts[callDate] = (dailyCallCounts[callDate] ?? 0) + 1;

                send("progress", {
                  phase: "syncing",
                  totalCalls,
                  newCalls,
                  updatedCalls,
                  skippedCalls,
                  message: `Skipped (already synced): ${participant}`,
                });
                continue;
              }

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

              const callDate = call.createdAt.split("T")[0];
              dailyCallCounts[callDate] = (dailyCallCounts[callDate] ?? 0) + 1;

              const fromNumber = call.direction === "outgoing"
                ? phoneNumber.number
                : (externalPhone ?? null);
              const toNumber = call.direction === "outgoing"
                ? (externalPhone ?? null)
                : phoneNumber.number;

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

              send("call_synced", {
                totalCalls,
                newCalls,
                updatedCalls,
                skippedCalls,
                phone: externalPhone ?? participant,
                direction: call.direction,
                calledAt: call.createdAt,
                duration: call.duration,
                isNew: !existing,
              });

              await sleep(200);
            }
          }
        }

        // Update daily_stats
        send("progress", {
          phase: "stats",
          message: "Updating daily stats...",
          totalCalls,
          newCalls,
          updatedCalls,
          skippedCalls,
        });

        for (const [date, count] of Object.entries(dailyCallCounts)) {
          const { data: existingStats } = await supabase
            .from("daily_stats")
            .select("*")
            .eq("date", date)
            .eq("user_role", "jea")
            .single();

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

        send("complete", {
          totalCalls,
          newCalls,
          updatedCalls,
          skippedCalls,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (error) {
        console.error("Quo sync error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
