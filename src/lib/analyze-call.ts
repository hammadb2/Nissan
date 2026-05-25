import openai from "./openai";
import type { AIAnalysis } from "./types";

const SYSTEM_PROMPT = `You are a call analysis assistant for a Nissan dealership's outbound calling team. 
You analyze call transcripts and generate structured intelligence for CRM and coaching purposes.

When analyzing a call, you must produce ALL of the following in a single response as valid JSON:

1. "ai_summary": A plain English summary of what the call was about in 2-3 sentences.
2. "crm_notes": Professional CRM notes ready to copy and paste. Include key details like customer interest level, vehicle preferences, objections, and outcomes. Format with bullet points.
3. "next_action_type": One of: "schedule_appointment", "schedule_callback", "send_email", "no_action"
4. "next_action_date": ISO 8601 datetime for when the next action should happen. Use reasonable business hours (9 AM - 6 PM). If no action needed, set to null.
5. "next_action_details": Specific description of what to do next, including day, time, and context.
6. "coaching_positive": One specific thing the agent did well on this call.
7. "coaching_improvement": One specific thing the agent should improve on the next call.

Respond ONLY with valid JSON matching this exact structure. No markdown, no code fences, no extra text.`;

export async function analyzeCall(
  transcript: string,
  quoSummary: string | null
): Promise<AIAnalysis> {
  const userMessage = `Analyze this call transcript and Quo AI summary.

${quoSummary ? `Quo AI Summary: ${quoSummary}\n\n` : ""}Transcript:
${transcript}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as AIAnalysis;

  if (!parsed.ai_summary || !parsed.crm_notes || !parsed.next_action_type) {
    throw new Error("Incomplete analysis from AI");
  }

  return parsed;
}

export async function generateWeeklyReport(
  calls: Array<{
    ai_summary: string | null;
    coaching_positive: string | null;
    coaching_improvement: string | null;
    next_action_type: string | null;
    is_recent_buyer: boolean;
    created_at: string;
  }>,
  agentName: string
): Promise<string> {
  const callSummaries = calls
    .map(
      (c, i) =>
        `Call ${i + 1} (${new Date(c.created_at).toLocaleDateString()}):
Summary: ${c.ai_summary ?? "N/A"}
Positive: ${c.coaching_positive ?? "N/A"}
Improvement: ${c.coaching_improvement ?? "N/A"}
Action: ${c.next_action_type ?? "N/A"}
Recent Buyer Flag: ${c.is_recent_buyer ? "YES" : "No"}`
    )
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a sales coaching expert. Generate a weekly performance report for a dealership outbound caller. Be constructive, specific, and actionable. Format in clear sections with headers.`,
      },
      {
        role: "user",
        content: `Generate a weekly coaching report for ${agentName} based on ${calls.length} calls this week.

Stats:
- Total calls: ${calls.length}
- Appointments booked: ${calls.filter((c) => c.next_action_type === "schedule_appointment").length}
- Recent buyer flags: ${calls.filter((c) => c.is_recent_buyer).length}

Call details:
${callSummaries}

Provide:
1. Overall performance summary
2. Top 3 strengths observed across all calls
3. Top 3 areas for improvement
4. Specific coaching recommendations for next week
5. Any patterns in the recent buyer flags`,
      },
    ],
    temperature: 0.5,
    max_tokens: 1500,
  });

  return response.choices[0]?.message?.content ?? "Unable to generate report.";
}
