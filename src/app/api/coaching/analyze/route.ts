import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOpenAI } from "@/lib/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOP_CONTEXT = `
CALLER SOP — South Trail Nissan (Key Rules):
- These are warm leads — previous customers who already trust the dealership
- Daily target: 200 calls
- Script flow: Opening (5s) → Bridge (10s) → Value (15s) → Close (10s)
- Opening: "Hey, is this [First Name]?" then "this is [name] calling from South Trail Nissan"
- MUST actually listen when asking "how are you doing today"
- Bridge: "we've been personally contacting some of our valued customers this week"
- Value: Reference their vehicle year/make, mention trade-in values are strong, programs expiring
- Close: Offer exactly TWO time options, then STOP TALKING — silence is the closer
- Ask for 20 minutes only — keep the ask small
- Log every call immediately — never batch
- Hot lead = WhatsApp group within 60 seconds
- NEVER quote prices, payments, or financing terms
- NEVER push the same objection twice — one attempt then warm exit
- NEVER fill silence after close — first person to speak loses
- NEVER make customer feel like one of 200 calls
- Voicemail: short, curious, no details — mystery makes them call back
- Appointment slots: Mon-Thu 9:15/10:15/11:45/1:00/2:30/4:00/5:45, Fri-Sat drop 5:45, Sunday CLOSED
`;

export async function GET() {
  const supabase = getSupabaseAdmin();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: calls } = await supabase
    .from("call_records")
    .select(
      "id, gpt_summary, what_went_well, coaching_tip, outcome, interest_level, sentiment, transcript, duration_seconds, called_at"
    )
    .gte("called_at", weekAgo.toISOString())
    .eq("gpt_processed", true)
    .order("called_at", { ascending: false })
    .limit(50);

  if (!calls || calls.length === 0) {
    return NextResponse.json({
      coaching: null,
      message: "No calls to analyze this week.",
    });
  }

  const callSummaries = calls
    .map((c, i) => {
      const duration = c.duration_seconds ? `${Math.round(c.duration_seconds / 60)}m` : "N/A";
      return `Call ${i + 1} (${new Date(c.called_at).toLocaleDateString()}, ${duration}):
Summary: ${c.gpt_summary ?? "N/A"}
Outcome: ${c.outcome ?? "N/A"}
Sentiment: ${c.sentiment ?? "N/A"}
Interest: ${c.interest_level ?? "N/A"}
Did Well: ${c.what_went_well ?? "N/A"}
Coaching Tip: ${c.coaching_tip ?? "N/A"}`;
    })
    .join("\n\n");

  const outcomes = calls.reduce<Record<string, number>>((acc, c) => {
    const key = c.outcome ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const prompt = `You are a sales call coach for South Trail Nissan. Analyze Jea's recent calls and provide detailed coaching.

${SOP_CONTEXT}

CALL DATA (${calls.length} calls this week):
Outcomes: ${JSON.stringify(outcomes)}

${callSummaries}

Return JSON only:
{
  "overall_grade": "A/B/C/D/F",
  "score": 0-100,
  "summary": "2-3 sentence overall assessment",
  "doing_well": ["specific thing 1 with call reference", "specific thing 2"],
  "needs_improvement": ["specific issue 1 with call reference and what to do instead", "specific issue 2"],
  "sop_violations": ["any SOP rules being broken with specific examples"],
  "script_adherence": {
    "opening": {"score": 0-10, "note": "brief assessment"},
    "bridge": {"score": 0-10, "note": "brief assessment"},
    "value_prop": {"score": 0-10, "note": "brief assessment"},
    "close": {"score": 0-10, "note": "brief assessment"},
    "silence_after_close": {"score": 0-10, "note": "brief assessment"}
  },
  "top_3_actions": ["most important action 1", "action 2", "action 3"],
  "objection_handling_score": 0-10,
  "objection_notes": "how well she handles objections based on transcripts"
}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a direct, actionable sales coach. Return valid JSON only. No markdown." },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "No response from GPT" }, { status: 500 });
  }

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const coaching = JSON.parse(cleaned);

  return NextResponse.json({
    coaching,
    call_count: calls.length,
    outcomes,
    week_start: weekAgo.toISOString(),
  });
}
