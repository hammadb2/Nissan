import { getOpenAI } from "./openai";
import type { GPTAnalysis } from "./types";

const SYSTEM_PROMPT = `You are an automotive sales call analyst. Analyze this call transcript and return JSON only.
The caller is a VA making outbound calls for South Trail Nissan in Calgary, Canada.
She is calling existing customers who have bought or serviced with the dealership.
The goal of every call is to book a 20-minute appointment at the dealership.

Return this exact JSON structure:
{
  "gpt_summary": "2-3 sentence plain English summary of what happened on this call",
  "crm_notes": "Professional CRM-ready notes in past tense. Ready to copy and paste.",
  "outcome": "booked|hot|callback|voicemail|no_answer|not_interested|dnc|wrong_number|recent_buyer",
  "sentiment": "warm|neutral|cold|hostile",
  "interest_level": "hot|warm|cold|not_interested",
  "is_recent_buyer": true or false,
  "vehicle_ownership_duration": "how long they said they have had their vehicle or null",
  "trade_in_available": true, false, or null,
  "monthly_budget": "what they said their budget is or null",
  "next_action": "callback|send_email|book_appointment|no_action",
  "next_action_at": "ISO 8601 datetime in Calgary MST or null",
  "next_action_details": "Exactly what to say or do on the next action",
  "what_went_well": "One specific thing the caller did well on this call",
  "coaching_tip": "One specific improvement for the next call. Be direct and actionable.",
  "recent_buyer_flag_reason": "Why you flagged this as a recent buyer or null"
}

Respond ONLY with valid JSON. No markdown, no code fences, no preamble.`;

export async function analyzeCall(
  transcript: string,
  quoSummary: string | null
): Promise<GPTAnalysis> {
  const userMessage = `Analyze this call transcript.

${quoSummary ? `Quo AI Summary: ${quoSummary}\n\n` : ""}Transcript:
${transcript}`;

  const response = await getOpenAI().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from Groq");
  }

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as GPTAnalysis;

  if (!parsed.gpt_summary || !parsed.crm_notes || !parsed.outcome) {
    throw new Error("Incomplete analysis from Groq");
  }

  return parsed;
}

export async function generateWeeklyReport(
  calls: Array<{
    gpt_summary: string | null;
    what_went_well: string | null;
    coaching_tip: string | null;
    outcome: string | null;
    interest_level: string | null;
    is_recent_buyer_flag: boolean;
    created_at: string;
  }>,
  agentName: string
): Promise<string> {
  const callSummaries = calls
    .map(
      (c, i) =>
        `Call ${i + 1} (${new Date(c.created_at).toLocaleDateString()}):
Summary: ${c.gpt_summary ?? "N/A"}
Outcome: ${c.outcome ?? "N/A"}
Interest: ${c.interest_level ?? "N/A"}
Positive: ${c.what_went_well ?? "N/A"}
Improvement: ${c.coaching_tip ?? "N/A"}
Recent Buyer Flag: ${c.is_recent_buyer_flag ? "YES" : "No"}`
    )
    .join("\n\n");

  const bookedCount = calls.filter((c) => c.outcome === "booked").length;
  const hotCount = calls.filter((c) => c.interest_level === "hot").length;
  const recentBuyerCount = calls.filter((c) => c.is_recent_buyer_flag).length;

  const response = await getOpenAI().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a sales coaching expert for an automotive dealership. Generate a weekly performance report for an outbound caller. Be constructive, specific, and actionable. Reference specific call moments when possible. Format in clear sections with headers.`,
      },
      {
        role: "user",
        content: `Generate a weekly coaching report for ${agentName} based on ${calls.length} calls this week.

Stats:
- Total calls: ${calls.length}
- Appointments booked: ${bookedCount}
- Hot leads: ${hotCount}
- Recent buyer flags: ${recentBuyerCount}

Call details:
${callSummaries}

Provide:
1. Total calls made vs target (200/day × 5 = 1000/week)
2. Appointment booking rate
3. Top 3 objections heard this week
4. What ${agentName} handled well — with specific examples from transcripts
5. Three specific improvements for next week — referenced to actual call moments
6. Contacts to prioritize next week — hot leads and scheduled callbacks`,
      },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content ?? "Unable to generate report.";
}
