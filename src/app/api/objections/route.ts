import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOpenAI } from "@/lib/openai";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("objection_handlers")
    .select("*")
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by category
  const grouped: Record<string, typeof data> = {};
  for (const item of data ?? []) {
    const cat = item.category as string;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  return NextResponse.json({ objections: data ?? [], grouped });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const { objection } = body as { objection?: string };

  if (!objection || typeof objection !== "string") {
    return NextResponse.json({ error: "Objection text is required" }, { status: 400 });
  }

  // Check if this objection already exists (fuzzy match)
  const { data: existing } = await supabase
    .from("objection_handlers")
    .select("id, objection, say_this")
    .limit(100);

  const lowerObj = objection.toLowerCase();
  const match = (existing ?? []).find((e) => {
    const existingLower = (e.objection as string).toLowerCase();
    return existingLower.includes(lowerObj) || lowerObj.includes(existingLower);
  });

  if (match) {
    return NextResponse.json({
      handler: match,
      source: "existing",
    });
  }

  // Get all existing handlers for context
  const existingContext = (existing ?? [])
    .map((e) => `"${e.objection}" → ${e.say_this}`)
    .join("\n");

  const response = await getOpenAI().chat.completions.create({
    model: "meta/llama-4-maverick-17b-128e-instruct",
    messages: [
      {
        role: "system",
        content: `You are a sales objection handler for South Trail Nissan. The caller is reconnecting with EXISTING customers (warm leads, not cold calls). 

The formula: 1. Acknowledge → 2. Reframe → 3. Close with two times → 4. Second no = exit warmly. No third attempt.

Calgarians are direct, independent-minded, and dislike pressure. A clean respectful exit today keeps the door open next month.

Existing handlers:
${existingContext}

Return valid JSON only:
{
  "category": "Vehicle|Customer|Financial|Timing|Compliance|Other",
  "objection": "the customer's exact words",
  "what_it_means": "what this really means psychologically",
  "say_this": "exact response following the acknowledge-reframe-close formula",
  "never_say": "what NOT to say and why"
}`,
      },
      {
        role: "user",
        content: `Customer said: "${objection}"\n\nGenerate a handler for this objection.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 800,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "No response from GPT" }, { status: 500 });
  }

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const handler = JSON.parse(cleaned);

  // Save to database
  const { data: saved, error: saveError } = await supabase
    .from("objection_handlers")
    .insert({
      category: handler.category ?? "Other",
      objection: handler.objection ?? objection,
      what_it_means: handler.what_it_means ?? null,
      say_this: handler.say_this,
      never_say: handler.never_say ?? null,
      source: "gpt",
    })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({
      handler,
      source: "gpt",
      saved: false,
      error: saveError.message,
    });
  }

  return NextResponse.json({
    handler: saved,
    source: "gpt",
    saved: true,
  }, { status: 201 });
}
