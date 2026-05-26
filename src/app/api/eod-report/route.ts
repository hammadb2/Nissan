import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOpenAI } from "@/lib/openai";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

interface EodStats {
  calls_made: number;
  appointments_booked: number;
  interested_not_booked: number;
  voicemails: number;
  not_interested: number;
  dnc: number;
  callbacks: number;
  no_answers: number;
  wrong_numbers: number;
  recent_buyers: number;
}

function buildStats(
  calls: Array<{ outcome: string | null }>
): EodStats {
  const stats: EodStats = {
    calls_made: calls.length,
    appointments_booked: 0,
    interested_not_booked: 0,
    voicemails: 0,
    not_interested: 0,
    dnc: 0,
    callbacks: 0,
    no_answers: 0,
    wrong_numbers: 0,
    recent_buyers: 0,
  };

  for (const call of calls) {
    switch (call.outcome) {
      case "booked":
        stats.appointments_booked++;
        break;
      case "hot":
        stats.interested_not_booked++;
        break;
      case "callback":
        stats.callbacks++;
        break;
      case "voicemail":
        stats.voicemails++;
        break;
      case "no_answer":
        stats.no_answers++;
        break;
      case "not_interested":
        stats.not_interested++;
        break;
      case "dnc":
        stats.dnc++;
        break;
      case "wrong_number":
        stats.wrong_numbers++;
        break;
      case "recent_buyer":
        stats.recent_buyers++;
        break;
    }
  }

  return stats;
}

async function generateEodAiNotes(
  stats: EodStats,
  calls: Array<{
    gpt_summary: string | null;
    what_went_well: string | null;
    coaching_tip: string | null;
    outcome: string | null;
    sentiment: string | null;
    interest_level: string | null;
  }>
): Promise<string> {
  const processedCalls = calls.filter((c) => c.gpt_summary);

  const callDetails = processedCalls
    .map(
      (c, i) =>
        `Call ${i + 1}: Outcome=${c.outcome ?? "unknown"}, Sentiment=${c.sentiment ?? "unknown"}, Interest=${c.interest_level ?? "unknown"}
Summary: ${c.gpt_summary ?? "N/A"}
Positive: ${c.what_went_well ?? "N/A"}
Improvement: ${c.coaching_tip ?? "N/A"}`
    )
    .join("\n\n");

  const response = await getOpenAI().chat.completions.create({
    model: "meta/llama-4-maverick-17b-128e-instruct",
    messages: [
      {
        role: "system",
        content: `You are a sales coaching expert for an automotive dealership BDC team. Generate a concise end-of-day performance report for an outbound caller named Jea. Be constructive, specific, and actionable. Use a professional but supportive tone.

Format the report with clear sections using markdown headers (##). Keep it concise — this is a daily summary, not a weekly deep-dive.`,
      },
      {
        role: "user",
        content: `Generate Jea's end-of-day performance report based on today's activity.

Daily Stats:
- Calls Made: ${stats.calls_made} / 200 target
- Appointments Booked: ${stats.appointments_booked}
- Interested (Not Yet Booked): ${stats.interested_not_booked}
- Voicemails: ${stats.voicemails}
- Callbacks Scheduled: ${stats.callbacks}
- Not Interested: ${stats.not_interested}
- DNC: ${stats.dnc}
- No Answers: ${stats.no_answers}
- Wrong Numbers: ${stats.wrong_numbers}
- Recent Buyers Flagged: ${stats.recent_buyers}

${processedCalls.length > 0 ? `Call Details:\n${callDetails}` : "No AI-processed calls available today."}

Provide:
1. ## Daily Performance Summary — how Jea performed overall today with the numbers
2. ## Strengths — 2-3 specific things she did well today (reference actual call outcomes/patterns)
3. ## Areas for Improvement — 2-3 actionable improvements for tomorrow
4. ## Tomorrow's Focus — one key thing to focus on tomorrow based on today's patterns
5. ## Quick Stats Recap — bullet point summary of the key numbers`,
      },
    ],
    temperature: 0.5,
    max_tokens: 1500,
  });

  return response.choices[0]?.message?.content ?? "Unable to generate AI report.";
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const dateParam = req.nextUrl.searchParams.get("date");
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const { data: calls, error } = await supabase
      .from("call_records")
      .select(
        "id, outcome, gpt_summary, what_went_well, coaching_tip, sentiment, interest_level, crm_notes, called_at, duration_seconds, contact_id, gpt_processed, contacts(first_name, last_name, phone)"
      )
      .gte("called_at", targetDate.toISOString())
      .lt("called_at", nextDay.toISOString())
      .order("called_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const callList = calls ?? [];
    const stats = buildStats(callList);

    // Count appointments from the appointments table for accuracy
    // (handles rescheduled appointments that may not match call outcomes)
    const { count: appointmentCount } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("created_at", targetDate.toISOString())
      .lt("created_at", nextDay.toISOString());

    if (appointmentCount !== null && appointmentCount > stats.appointments_booked) {
      stats.appointments_booked = appointmentCount;
    }

    const includeAi = req.nextUrl.searchParams.get("ai") !== "false";
    let aiNotes: string | null = null;

    if (includeAi && callList.length > 0) {
      try {
        aiNotes = await generateEodAiNotes(stats, callList);
      } catch (aiErr) {
        console.error("AI report generation error:", aiErr);
        aiNotes = "AI report generation failed. Stats are still available above.";
      }
    }

    return NextResponse.json({
      date: targetDate.toISOString().split("T")[0],
      stats,
      ai_notes: aiNotes,
      calls: callList.map((c) => ({
        id: c.id,
        called_at: c.called_at,
        duration_seconds: c.duration_seconds,
        outcome: c.outcome,
        gpt_summary: c.gpt_summary,
        contact: c.contacts,
      })),
    });
  } catch (error) {
    console.error("EOD report error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { date?: string };
    const supabase = getSupabaseAdmin();

    const targetDate = body.date ? new Date(body.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const { data: calls, error } = await supabase
      .from("call_records")
      .select(
        "id, outcome, gpt_summary, crm_notes, coaching_tip, what_went_well, sentiment, interest_level, called_at, duration_seconds, contact_id, gpt_processed, contacts(first_name, last_name, phone)"
      )
      .gte("called_at", targetDate.toISOString())
      .lt("called_at", nextDay.toISOString())
      .order("called_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const callList = calls ?? [];
    const stats = buildStats(callList);

    const dateStr = targetDate.toISOString().split("T")[0];

    const rows = callList.map((call) => {
      const contact = call.contacts as unknown as {
        first_name: string;
        last_name: string;
        phone: string;
      } | null;

      return {
        Time: call.called_at
          ? new Date(call.called_at).toLocaleTimeString("en-CA", {
              timeZone: "America/Edmonton",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "",
        Contact: contact
          ? `${contact.first_name} ${contact.last_name}`
          : "Unknown",
        Phone: contact?.phone ?? "",
        "Duration (s)": call.duration_seconds ?? "",
        Outcome: call.outcome ?? "",
        Summary: call.gpt_summary ?? "",
        "CRM Notes": call.crm_notes ?? "",
        "Coaching Tip": call.coaching_tip ?? "",
      };
    });

    // Summary sheet
    const summaryRows = [
      { Metric: "Date", Value: dateStr },
      { Metric: "Calls Made", Value: stats.calls_made },
      { Metric: "Target", Value: 200 },
      { Metric: "Appointments Booked", Value: stats.appointments_booked },
      { Metric: "Interested (Not Yet Booked)", Value: stats.interested_not_booked },
      { Metric: "Voicemails", Value: stats.voicemails },
      { Metric: "Callbacks", Value: stats.callbacks },
      { Metric: "Not Interested", Value: stats.not_interested },
      { Metric: "DNC", Value: stats.dnc },
      { Metric: "No Answers", Value: stats.no_answers },
      { Metric: "Wrong Numbers", Value: stats.wrong_numbers },
      { Metric: "Recent Buyers", Value: stats.recent_buyers },
    ];

    const wb = XLSX.utils.book_new();

    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    const callsWs = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, callsWs, "Calls");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="jea-eod-report-${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("EOD export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
