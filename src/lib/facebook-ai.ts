import OpenAI from "openai";
import { getSupabaseAdmin } from "./supabase";

let _groqClient: OpenAI | null = null;

function getGroqAI(): OpenAI {
  if (!_groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    _groqClient = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return _groqClient;
}

let _fbConvoClient: OpenAI | null = null;

function getFBConvoAI(): OpenAI {
  if (!_fbConvoClient) {
    const apiKey = process.env.NVIDIA_SMS_API_KEY || process.env.NVIDIA_API_KEY;
    if (!apiKey) throw new Error("NVIDIA_SMS_API_KEY is not set");
    _fbConvoClient = new OpenAI({
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
  }
  return _fbConvoClient;
}

const FB_CONVO_MODEL = "meta/llama-4-maverick-17b-128e-instruct";

const BANNED_WORDS = [
  "financing available",
  "bad credit ok",
  "guaranteed approval",
  "easy payments",
  "no credit check",
  "buy here pay here",
  "warranty included",
  "no hidden fees",
  "apply now",
  "get approved",
  "we can help",
  "call us",
  "visit us",
  "our dealership",
  "south trail nissan",
];

const DESCRIPTION_PROMPT = `You are generating a Facebook Marketplace vehicle listing description.
Write it as a private individual selling their own car.
Sound like a real person. Not a dealership. Not a salesperson.

RULES:
- 100 to 150 words exactly. Not shorter. Not longer.
- No financing language of any kind
- No "bad credit OK", no "guaranteed approval", no "easy payments"
- No dealer name anywhere in the description
- No phone numbers
- No website URLs
- No ALL CAPS anywhere
- No exclamation marks more than once
- No bullet points or numbered lists
- No dashes of any kind
- No emojis
- Every description must be unique — never reuse wording from another listing
- Write in plain casual English — like a real person wrote it
- Always end the description with the exact phrase: AMVIC Licensed Dealer`;

interface VehicleDescriptionInput {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  colour: string | null;
  transmission: string | null;
  features: string | null;
  condition_notes: string | null;
  price: number | null;
}

export async function generateFBDescription(
  vehicle: VehicleDescriptionInput
): Promise<string> {
  const ai = getGroqAI();

  const inputData = `INPUT DATA:
Year: ${vehicle.year}
Make: ${vehicle.make}
Model: ${vehicle.model}
Trim: ${vehicle.trim || "Base"}
Mileage: ${vehicle.mileage ? vehicle.mileage.toLocaleString("en-CA") + " km" : "Unknown"}
Colour: ${vehicle.colour || "Unknown"}
Transmission: ${vehicle.transmission || "Automatic"}
Features: ${vehicle.features || "Standard features"}
Condition notes: ${vehicle.condition_notes || "No issues reported"}
Price: ${vehicle.price ? "$" + vehicle.price.toLocaleString("en-CA") : "Contact for price"}

OUTPUT:
One paragraph of 100 to 150 words describing the vehicle naturally.
Mention 3 to 5 of the most appealing features naturally within the text.
Mention the mileage naturally.
Mention the price with "+ GST" at the end.
Last line must be exactly: AMVIC Licensed Dealer`;

  const response = await ai.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: DESCRIPTION_PROMPT },
      { role: "user", content: inputData },
    ],
    temperature: 0.9,
    max_tokens: 400,
  });

  const description = response.choices[0]?.message?.content?.trim() ?? "";
  return description;
}

export function checkCompliance(description: string): {
  passed: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const lower = description.toLowerCase();

  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      violations.push(`Contains banned phrase: "${word}"`);
    }
  }

  if (/[A-Z]{4,}/.test(description.replace("AMVIC Licensed Dealer", ""))) {
    violations.push("Contains ALL CAPS text (excluding AMVIC footer)");
  }

  const exclamationCount = (description.match(/!/g) || []).length;
  if (exclamationCount > 1) {
    violations.push(`Too many exclamation marks: ${exclamationCount}`);
  }

  if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(description)) {
    violations.push("Contains a phone number");
  }

  if (/https?:\/\/|www\./i.test(description)) {
    violations.push("Contains a URL");
  }

  if (/[-]{2,}|—|–/.test(description)) {
    violations.push("Contains dashes");
  }

  if (/^\s*[-•*]\s/m.test(description)) {
    violations.push("Contains bullet points or lists");
  }

  if (/^\s*\d+[.)]\s/m.test(description)) {
    violations.push("Contains numbered lists");
  }

  if (!description.trim().endsWith("AMVIC Licensed Dealer")) {
    violations.push('Missing "AMVIC Licensed Dealer" at the end');
  }

  return { passed: violations.length === 0, violations };
}

export async function generateCompliantDescription(
  vehicle: VehicleDescriptionInput,
  maxAttempts: number = 3
): Promise<{ description: string; passed: boolean; attempts: number }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const description = await generateFBDescription(vehicle);
    const compliance = checkCompliance(description);

    if (compliance.passed) {
      return { description, passed: true, attempts: attempt };
    }

    if (attempt === maxAttempts) {
      return { description, passed: false, attempts: attempt };
    }
  }

  return { description: "", passed: false, attempts: maxAttempts };
}

// ---------------------------------------------------------------------------
// Facebook Conversation AI
// ---------------------------------------------------------------------------

const FB_IDENTITY = `You are Hammad. You work at South Trail Nissan at 6603 130 Ave SE Calgary AB.
You are replying to a buyer on Facebook Marketplace.
You are warm, direct, and real. You do not sound like a call centre.
You do not use corporate language. You text the way a real person texts.
Short sentences. Gets to the point immediately. Warm but not fake. No forced enthusiasm.`;

const FB_VOICE = `HAMMAD'S REAL MESSAGING EXAMPLES. MATCH THIS VOICE EXACTLY.

"Hey, thanks for reaching out about the Rogue. Yeah it is still available, drives great. When were you thinking of coming to take a look?"

"No worries at all, thank you for letting me know."

"Yeah of course what time works for you tomorrow to come by?"

"Perfect see you guys soon!"

"When you come in please ask for me"

"If you are coming by let me know I'll wash this vehicle for you to see."

"No problem at all!"

WHAT YOU LEARN FROM THESE EXAMPLES:
Short sentences. Gets to the point immediately.
References specific details about the vehicle.
Never over explains. One thought per message.
Warm but not fake. No forced enthusiasm.
No dashes anywhere.
No bullet points. No lists. No formatting.
Contractions used naturally.`;

const FB_BANNED_WORDS = `WORDS AND PHRASES YOU NEVER USE:
Certainly, Absolutely, Great question, I understand, Delve, Leverage,
Furthermore, Moreover, In conclusion, Reach out, Touch base, Moving forward,
At its core, It is important to note, In today's fast-paced world,
Happy to help, Feel free, Do not hesitate, Please be advised,
I hope this message finds you well, Thank you for your patience`;

const FB_FORMATTING = `FORMATTING RULES:
No dashes of any kind. No bullet points. No numbered lists.
No bold text. No exclamation marks more than once per conversation.
No walls of text. Every message fits on one phone screen.
Vary sentence length. Use contractions. Fragments are fine.
One thought per message. One question per message. Never both.
Under 3 sentences per message always.`;

const FB_CONVERSATION_STRATEGY = `CONVERSATION STRATEGY:
Message 1: Answer their specific question about the vehicle they asked about. Warm, direct, one sentence answer. Then mention one other similar vehicle on the lot.
Message 2: Ask one qualifying question. Are they trading in their current vehicle. What is their budget. When are they looking to make a move.
Message 3: Based on their answer offer two specific appointment times. If they hesitate offer a phone call instead.
Message 4: Once they agree ask for their phone number so you can send them a reminder. That number goes into the CRM and the SMS AI fires immediately.
Message 5: Confirmation of the appointment. Warm close. "Perfect see you [day] at [time]. Just ask for Hammad when you get here."

Five messages maximum. Every buyer gets qualified, gets options, gives you their phone number, and books an appointment.`;

const FB_QUALIFYING = `QUALIFYING QUESTIONS TO COLLECT NATURALLY:
Are you looking to trade in your current vehicle
What is your budget
When are you looking to make a move
Are you financing or cash
Collect their phone number within the second or third message every time.`;

const FB_RULES = `RULES. NEVER BREAK THESE:
Never quote a specific monthly payment or interest rate
Never guarantee a financing approval
Never badmouth any other dealership or brand
Never send more than 2 messages in a row without a buyer reply
If the buyer says not interested respond with "No worries at all, thank you for letting me know."
If the buyer asks something you cannot confidently answer say "Good question, let me check on that and get back to you" and flag the conversation for human takeover.
Never send a wall of text. Keep every message under 3 sentences.
Always end with one question or one clear call to action. Never both.
Never mention the dealership name unless the buyer asks directly.`;

interface FBConversationContext {
  buyerName: string | null;
  buyerProfileInfo: Record<string, unknown> | null;
  vehicleAskedAbout: string | null;
  vehiclePrice: number | null;
  vehicleAvailable: boolean;
  conditionNotes: string | null;
  conversationHistory: Array<{
    direction: "inbound" | "outbound";
    message_body: string;
    sent_at: string;
  }>;
  sequenceStep: number;
  extractedPhone: string | null;
  extractedBudget: string | null;
  extractedTradeIn: boolean | null;
}

export interface FBReplyResult {
  message: string;
  action: "continue" | "book_appointment" | "flag_human" | "end_conversation";
  appointmentDetails?: {
    date: string;
    time: string;
    customerName: string;
    phone: string;
    vehicleInterested: string;
  };
  extractedInfo?: {
    phone?: string;
    budget?: string;
    tradeIn?: boolean;
    timeline?: string;
  };
}

async function buildFBInventorySection(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: listings } = await supabase
    .from("listings")
    .select("vehicle_year, vehicle_make, vehicle_model, vehicle_trim, mileage, price, status")
    .in("status", ["listed", "needs_refresh"]);

  if (!listings || listings.length === 0) {
    return "CURRENT INVENTORY:\nNo current listings available.";
  }

  const lines = listings.map((l) => {
    const parts = [
      `${l.vehicle_year} ${l.vehicle_make} ${l.vehicle_model}`,
      l.vehicle_trim ? `(${l.vehicle_trim})` : null,
      l.mileage ? `${l.mileage.toLocaleString()} km` : null,
      l.price ? `$${l.price.toLocaleString()}` : null,
    ].filter(Boolean);
    return `- ${parts.join(" | ")}`;
  });

  return `CURRENT INVENTORY (use these to suggest similar vehicles):\n${lines.join("\n")}`;
}

async function buildFBAvailabilitySection(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const oneWeekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("scheduled_at")
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", oneWeekOut.toISOString())
    .order("scheduled_at", { ascending: true });

  const MON_THU_SLOTS = ["9:15", "10:15", "11:45", "13:00", "14:30", "16:00", "17:45"];
  const FRI_SAT_SLOTS = ["9:15", "10:15", "11:45", "13:00", "14:30", "16:00"];

  const bookedKeys = new Set<string>();
  for (const a of appointments ?? []) {
    const d = new Date(a.scheduled_at);
    const calgaryStr = d.toLocaleString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Edmonton",
    });
    bookedKeys.add(calgaryStr);
  }

  const lines: string[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const calgaryDate = new Date(day.toLocaleString("en-US", { timeZone: "America/Edmonton" }));
    const dow = calgaryDate.getDay();

    if (dow === 0) continue;

    const slots = (dow >= 1 && dow <= 4) ? MON_THU_SLOTS : FRI_SAT_SLOTS;
    const dateStr = day.toLocaleDateString("en-CA", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/Edmonton",
    });

    const ymd = day.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Edmonton",
    });

    const available: string[] = [];
    for (const slot of slots) {
      const key = `${ymd}, ${slot}`;
      if (!bookedKeys.has(key)) {
        const [h, m] = slot.split(":");
        const hour = parseInt(h);
        const ampm = hour >= 12 ? "PM" : "AM";
        const h12 = hour > 12 ? hour - 12 : hour;
        available.push(`${h12}:${m} ${ampm}`);
      }
    }

    if (available.length > 0) {
      lines.push(`${dateStr}: ${available.join(", ")}`);
    }
  }

  return `HAMMAD'S AVAILABILITY FOR TEST DRIVES:\n${lines.join("\n")}`;
}

export async function generateFBReply(
  context: FBConversationContext
): Promise<FBReplyResult> {
  const ai = getFBConvoAI();

  const [inventory, availability] = await Promise.all([
    buildFBInventorySection(),
    buildFBAvailabilitySection(),
  ]);

  const buyerContext = [
    `BUYER: ${context.buyerName || "Unknown"}`,
    context.buyerProfileInfo
      ? `Profile info: ${JSON.stringify(context.buyerProfileInfo)}`
      : null,
    `Vehicle asked about: ${context.vehicleAskedAbout || "Unknown"}`,
    context.vehiclePrice
      ? `Listed price: $${context.vehiclePrice.toLocaleString()}`
      : null,
    `Still available: ${context.vehicleAvailable ? "Yes" : "No"}`,
    context.conditionNotes
      ? `Vehicle condition notes: ${context.conditionNotes}`
      : null,
    `Conversation step: ${context.sequenceStep} of 5`,
    context.extractedPhone
      ? `Phone collected: ${context.extractedPhone}`
      : "Phone: Not yet collected",
    context.extractedBudget
      ? `Budget: ${context.extractedBudget}`
      : null,
    context.extractedTradeIn !== null
      ? `Trade-in: ${context.extractedTradeIn ? "Yes" : "No"}`
      : null,
  ].filter(Boolean).join("\n");

  const systemPrompt = `${FB_IDENTITY}

${FB_VOICE}

${FB_BANNED_WORDS}

${FB_FORMATTING}

${FB_CONVERSATION_STRATEGY}

${inventory}

${availability}

${buyerContext}

${FB_QUALIFYING}

${FB_RULES}

RESPONSE FORMAT. You must respond with valid JSON only:
{
  "message": "your text response to send to the buyer",
  "action": "continue|book_appointment|flag_human|end_conversation",
  "appointmentDetails": {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "customerName": "name",
    "phone": "phone number",
    "vehicleInterested": "vehicle description"
  },
  "extractedInfo": {
    "phone": "if buyer provided their phone number",
    "budget": "if buyer mentioned budget",
    "tradeIn": true/false,
    "timeline": "when they want to buy"
  }
}

appointmentDetails is only included when action is "book_appointment".
extractedInfo is only included when new information was extracted from the buyer's message.
If nothing new was extracted, omit extractedInfo entirely.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of context.conversationHistory) {
    messages.push({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.message_body,
    });
  }

  const response = await ai.chat.completions.create({
    model: FB_CONVO_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]) as FBReplyResult;
    return parsed;
  } catch {
    return {
      message: raw.replace(/[{}"\n]/g, "").trim() || "Hey, thanks for reaching out. Let me check on that for you.",
      action: "continue",
    };
  }
}
