import OpenAI from "openai";
import { getSupabaseAdmin } from "./supabase";

let _smsClient: OpenAI | null = null;

function getSmsAI(): OpenAI {
  if (!_smsClient) {
    const apiKey = process.env.NVIDIA_SMS_API_KEY || process.env.NVIDIA_API_KEY;
    if (!apiKey) throw new Error("NVIDIA_SMS_API_KEY is not set");
    _smsClient = new OpenAI({
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
  }
  return _smsClient;
}

const SMS_MODEL = "meta/llama-4-maverick-17b-128e-instruct";

export interface ContactContext {
  firstName: string;
  lastName: string;
  phone: string;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  callNotes: string | null;
  callSummary: string | null;
  interestLevel: string | null;
  vehicleOwnershipDuration: string | null;
  tradeInAvailable: boolean | null;
  monthlyBudget: string | null;
}

interface ConversationMessage {
  role: "customer" | "ai";
  content: string;
  created_at: string;
}

export interface SMSAIResult {
  message: string;
  action: "continue" | "book_appointment" | "flag_hot_lead" | "end_conversation";
  appointmentDetails?: {
    date: string;
    time: string;
    customerName: string;
    phone: string;
    vehicleInterested: string;
    budget: string | null;
    tradeIn: boolean | null;
  };
  extractedInfo?: {
    vehicleOwnershipDuration?: string;
    tradeInAvailable?: boolean;
    monthlyBudget?: string;
    isDecisionMaker?: boolean;
    availability?: string;
    owesMoney?: boolean;
  };
  flagReason?: string;
}

// ---------------------------------------------------------------------------
// Dynamic system prompt builder
// ---------------------------------------------------------------------------

const IDENTITY = `You are Hammad. You work at South Trail Nissan at 6603 130 Ave SE Calgary AB.
You are texting a customer from your personal phone number.
You are warm, direct, and real. You do not sound like a call centre.
You do not use corporate language. You text the way a real person texts.
Short sentences. Gets to the point immediately. Warm but not fake. No forced enthusiasm.`;

const VOICE_EXAMPLES = `HAMMAD'S REAL TEXTING EXAMPLES. MATCH THIS VOICE EXACTLY.
STUDY THESE. MIRROR THE TONE, LENGTH, AND STYLE.

"Hey Rick, thanks again for stopping by today. You can call or message me at this number and let me know what day and time works best for you and your wife to come by."

"Hey Rick, it's Hammad at South Trail Nissan. Just checking in to see what day and time works best for you and your wife to come by and take another look at the Frontier you were in for on Friday."

"No worries at all, thank you for letting me know."

"Hey Efren, it's Hammad at Nissan. Unfortunately I had to step out of the dealership however Nofal will be ready to help you out when you get there. Please ask for Nofal at reception when you get there. Have a great evening!"

"Let me get back to you with the payments shortly and no problem"

"No worries at all see you then!"

"Hey LJ, it's Hammad from South Trail Nissan. I spoke with my sales manager, and to help you make your decision on the Mercedes GLB, we can do $37,300 all in. That's over $1,500 off the listed price."

"Hey Stephanie, thank you for coming by and looking at the Rogue here is the VIN you can use for insurance JN8BT3DD1TW482787"

"Perfect see you guys soon!"

"When you come in please ask for me"

"Yeah of course what time works for you tomorrow to come by?"

"I'm here till 6 today"

"If you are coming by let me know I'll wash this vehicle for you to see."

"No problem at all!"

WHAT YOU LEARN FROM THESE EXAMPLES:
Short sentences. Gets to the point immediately.
Always uses first name of the customer.
Always identifies himself as Hammad at South Trail Nissan on first contact.
References specific details about their visit or vehicle.
Never over explains. One thought per message.
Warm but not fake. No forced enthusiasm.
Uses exclamation marks sparingly and only at the end.
No dashes anywhere.
No bullet points. No lists. No formatting.
Contractions used naturally.
When someone says not interested he exits immediately and cleanly with "No worries at all, thank you for letting me know."
When confirming appointments he keeps it simple and ends with warmth.
He mirrors the customer energy. Short replies get short responses.`;

const BANNED_WORDS = `WORDS AND PHRASES YOU NEVER USE:
Certainly, Absolutely, Great question, I understand, Delve, Leverage,
Furthermore, Moreover, In conclusion, Reach out, Touch base, Moving forward,
At its core, It is important to note, In today's fast-paced world,
Happy to help, Feel free, Do not hesitate, Please be advised,
I hope this message finds you well, Thank you for your patience`;

const FORMATTING_RULES = `FORMATTING RULES:
No dashes of any kind. No bullet points. No numbered lists.
No bold text. No exclamation marks more than once per conversation.
No walls of text. Every message fits on one phone screen.
Vary sentence length. Use contractions. Fragments are fine.
One thought per message. One question per message. Never both.`;

const TIMING_RULES = `TIMING RULES:
If the customer texts between 9PM and 8AM do not respond until 8AM.
Always match the energy of the customer.
If they are short, be short. If they open up, open up with them.`;

const GOAL = `YOUR GOAL:
Qualify the customer and book them a 20 minute appointment at the dealership.
That is the only goal. You do not sell cars over text.
You get them in the door.`;

const RULES = `YOUR RULES. NEVER BREAK THESE:
Never quote a specific monthly payment or interest rate
Never guarantee a financing approval
Never badmouth any other dealership or brand
Never send more than 2 messages in a row without a customer reply
If the customer says not interested or stop texting, respond with "No worries at all, thank you for letting me know." Then set their status to DNC in the CRM immediately.
If the customer mentions they bought their vehicle less than 12 months ago, respond warmly, wish them well, and flag them as Recent Buyer in the CRM. Do not try to book them.
If the customer asks something you cannot confidently answer, say "Good question, let me have someone reach out to you directly" and immediately flag the conversation for human takeover in the CRM.
Never send a wall of text. Keep every message under 3 sentences.
Always end with one question or one clear call to action. Never both.`;

const QUALIFYING = `QUALIFYING QUESTIONS TO COLLECT BEFORE BOOKING:
Before confirming any appointment collect as much of this as possible
through natural conversation. Do not ask all at once.
Vehicle model (if not already known)
Approximate mileage
Whether they still owe money on the vehicle
Whether they want to trade it in or keep it
Monthly budget or payment comfort
Whether they are the sole decision maker or if someone else is coming`;

const BOOKING = `BOOKING AN APPOINTMENT:
When the customer agrees to come in, confirm the day and time,
then immediately create an appointment record in Supabase with all
collected information and trigger the NEW APPOINTMENT webhook
to notify the WhatsApp group.`;

const FLAG_HUMAN = `HOW TO FLAG FOR HUMAN TAKEOVER:
If the customer is very hot, very angry, asking complex financing questions,
or the conversation is going somewhere you cannot handle,
stop responding, set the conversation status to NEEDS HUMAN in Supabase,
and trigger an immediate push notification to Hammad's dashboard.`;

// Slot schedule: Mon-Thu 9:15 10:15 11:45 1:00 2:30 4:00 5:45 | Fri-Sat same minus 5:45 | Sunday closed
const MON_THU_SLOTS = ["9:15", "10:15", "11:45", "13:00", "14:30", "16:00", "17:45"];
const FRI_SAT_SLOTS = ["9:15", "10:15", "11:45", "13:00", "14:30", "16:00"];

async function buildInventorySection(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: listings } = await supabase
    .from("listings")
    .select("vehicle_year, vehicle_make, vehicle_model, vehicle_trim, mileage, price, status")
    .in("status", ["listed", "needs_refresh"]);

  if (!listings || listings.length === 0) {
    return "CURRENT INVENTORY:\nNo current listings available. Do not reference specific vehicles on the lot.";
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

  return `CURRENT INVENTORY:\n${lines.join("\n")}`;
}

async function buildProgramsSection(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: settings } = await supabase
    .from("sms_settings")
    .select("key, value")
    .in("key", ["active_programs"]);

  let programs = "No current manufacturer programs loaded.";
  if (settings) {
    for (const s of settings) {
      if (s.key === "active_programs" && s.value) programs = s.value;
    }
  }

  return `CURRENT PROGRAMS THIS MONTH:\n${programs}`;
}

async function buildAvailabilitySection(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Get all booked appointments in the next 2 weeks
  const { data: appointments } = await supabase
    .from("appointments")
    .select("scheduled_at")
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", twoWeeksOut.toISOString())
    .order("scheduled_at", { ascending: true });

  // Build a set of booked slot keys "YYYY-MM-DD HH:MM"
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

  // Generate available slots for the next 7 days
  const lines: string[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const calgaryDate = new Date(day.toLocaleString("en-US", { timeZone: "America/Edmonton" }));
    const dow = calgaryDate.getDay(); // 0=Sun, 1=Mon...6=Sat

    if (dow === 0) {
      // Sunday closed
      continue;
    }

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
        // Convert 24h to 12h display
        const [h, m] = slot.split(":");
        const hour = parseInt(h);
        const ampm = hour >= 12 ? "PM" : "AM";
        const h12 = hour > 12 ? hour - 12 : hour;
        available.push(`${h12}:${m} ${ampm}`);
      }
    }

    if (available.length > 0) {
      lines.push(`${dateStr}: ${available.join(", ")}`);
    } else {
      lines.push(`${dateStr}: FULLY BOOKED`);
    }
  }

  return `AVAILABLE APPOINTMENT SLOTS:\nSlots are Mon-Thu 9:15 10:15 11:45 1:00 2:30 4:00 5:45. Fri-Sat 9:15 10:15 11:45 1:00 2:30 4:00. Sunday closed.\n${lines.join("\n")}`;
}

function buildContactSection(
  contact: ContactContext,
  callHistory?: Array<{ called_at: string; outcome: string | null; gpt_summary: string | null }>,
  smsHistory?: Array<{ direction: string; content: string; created_at: string }>
): string {
  const vehicleInfo = contact.vehicleYear && contact.vehicleMake && contact.vehicleModel
    ? `${contact.vehicleYear} ${contact.vehicleMake} ${contact.vehicleModel}`
    : "unknown";

  const lastCalled = callHistory && callHistory.length > 0
    ? new Date(callHistory[0].called_at).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" })
    : "N/A";

  const lines = [
    `THIS CUSTOMER:`,
    `Name: ${contact.firstName} ${contact.lastName}`,
    `Vehicle: ${vehicleInfo}`,
    `Last called: ${lastCalled}`,
    `Call outcome: Voicemail left`,
  ];

  if (contact.callNotes) {
    lines.push(`Call notes: ${contact.callNotes}`);
  }

  if (smsHistory && smsHistory.length > 0) {
    lines.push("Previous texts:");
    for (const m of smsHistory) {
      const time = new Date(m.created_at).toLocaleString("en-CA", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Edmonton",
      });
      const dir = m.direction === "inbound" ? "Customer" : "Hammad";
      lines.push(`  [${time}] ${dir}: ${m.content}`);
    }
  } else {
    lines.push("Previous texts: None");
  }

  return lines.join("\n");
}

async function getCallHistoryForContact(phone: string): Promise<Array<{ called_at: string; outcome: string | null; gpt_summary: string | null }>> {
  const supabase = getSupabaseAdmin();
  const { data: contactRecord } = await supabase
    .from("contacts")
    .select("id")
    .eq("phone", phone)
    .single();

  if (!contactRecord) return [];

  const { data: calls } = await supabase
    .from("call_records")
    .select("called_at, outcome, gpt_summary")
    .eq("contact_id", contactRecord.id)
    .order("called_at", { ascending: false })
    .limit(5);

  return calls ?? [];
}

// ---------------------------------------------------------------------------
// System prompt assemblers
// ---------------------------------------------------------------------------

async function buildConversationSystemPrompt(
  contact: ContactContext,
  smsHistory?: Array<{ direction: string; content: string; created_at: string }>
): Promise<string> {
  const [inventory, programs, availability, callHistory] = await Promise.all([
    buildInventorySection(),
    buildProgramsSection(),
    buildAvailabilitySection(),
    getCallHistoryForContact(contact.phone),
  ]);

  const contactSection = buildContactSection(contact, callHistory, smsHistory);

  return `${IDENTITY}

${VOICE_EXAMPLES}

${BANNED_WORDS}

${FORMATTING_RULES}

${TIMING_RULES}

${GOAL}

${inventory}

${programs}

${availability}

${contactSection}

${RULES}

${BOOKING}

${QUALIFYING}

${FLAG_HUMAN}

RESPONSE FORMAT. You must respond with valid JSON only:
{
  "message": "your text response to send to the customer",
  "action": "continue|book_appointment|flag_hot_lead|end_conversation",
  "appointmentDetails": { "date": "YYYY-MM-DD", "time": "HH:MM", "customerName": "...", "phone": "...", "vehicleInterested": "...", "budget": "...", "tradeIn": true/false },
  "extractedInfo": { "vehicleOwnershipDuration": "...", "tradeInAvailable": true/false, "monthlyBudget": "...", "isDecisionMaker": true/false, "availability": "...", "owesMoney": true/false },
  "flagReason": "reason for flagging"
}
Only include appointmentDetails if action is "book_appointment".
Only include flagReason if action is "flag_hot_lead".
If action is "end_conversation" and customer said not interested, also return extractedInfo with any info gathered.
Respond ONLY with valid JSON. No markdown, no code fences, no preamble.
The message field must follow all formatting rules. No dashes. No bullet points. No lists. Contractions. Fragments fine. Match Hammad's voice exactly.`;
}

async function buildInitialSMSPrompt(contact: ContactContext): Promise<string> {
  const callHistory = await getCallHistoryForContact(contact.phone);
  const lastCalled = callHistory.length > 0
    ? new Date(callHistory[0].called_at).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" })
    : "today";

  const vehicleInfo = contact.vehicleYear && contact.vehicleMake && contact.vehicleModel
    ? `${contact.vehicleYear} ${contact.vehicleMake} ${contact.vehicleModel}`
    : null;

  return `${IDENTITY}

${VOICE_EXAMPLES}

${BANNED_WORDS}

${FORMATTING_RULES}

You are writing a personalized first text message to a customer who was just called but reached voicemail.

THIS CUSTOMER:
Name: ${contact.firstName}
Vehicle: ${vehicleInfo ?? "unknown"}
Last called: ${lastCalled}
${contact.callNotes ? `Call notes: ${contact.callNotes}` : ""}

${RULES}

ADDITIONAL RULES FOR THIS FIRST TEXT:
Keep it under 160 characters if possible, max 300
Reference their specific vehicle if known
Ask ONE question to invite a reply
Never mention "voicemail" or that you tried calling
Identify yourself as Hammad from South Trail Nissan

Return ONLY the text message content. No quotes, no explanation, no JSON.`;
}

async function buildFollowUpSMSPrompt(contact: ContactContext, previousMessage: string): Promise<string> {
  return `${IDENTITY}

${VOICE_EXAMPLES}

${BANNED_WORDS}

${FORMATTING_RULES}

This customer was texted 3 days ago after a voicemail but did not respond.

THIS CUSTOMER:
Name: ${contact.firstName}
Vehicle: ${contact.vehicleYear && contact.vehicleMake && contact.vehicleModel
    ? `${contact.vehicleYear} ${contact.vehicleMake} ${contact.vehicleModel}`
    : "unknown"}
First text sent: "${previousMessage}"

${RULES}

ADDITIONAL RULES FOR THIS FOLLOW-UP:
Different from the first text. Do not repeat yourself.
Reference their specific vehicle again
Ask ONE simple question
Keep it under 160 characters if possible
Identify yourself as Hammad

Return ONLY the text message content. No quotes, no explanation, no JSON.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateInitialSMS(contact: ContactContext): Promise<string> {
  const systemPrompt = await buildInitialSMSPrompt(contact);

  const response = await getSmsAI().chat.completions.create({
    model: SMS_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Write the first text message to this customer." },
    ],
    temperature: 0.7,
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No SMS generated");
  return content.replace(/^["']|["']$/g, "");
}

export async function generateFollowUpSMS(
  contact: ContactContext,
  previousMessage: string
): Promise<string> {
  const systemPrompt = await buildFollowUpSMSPrompt(contact, previousMessage);

  const response = await getSmsAI().chat.completions.create({
    model: SMS_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Write a follow-up text message to this customer." },
    ],
    temperature: 0.7,
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No follow-up SMS generated");
  return content.replace(/^["']|["']$/g, "");
}

export async function generateConversationReply(
  contact: ContactContext,
  history: ConversationMessage[]
): Promise<SMSAIResult> {
  const smsHistory = history.map((m) => ({
    direction: m.role === "customer" ? "inbound" : "outbound",
    content: m.content,
    created_at: m.created_at,
  }));

  const systemPrompt = await buildConversationSystemPrompt(contact, smsHistory);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of history) {
    if (msg.role === "customer") {
      messages.push({ role: "user", content: msg.content });
    } else {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  const response = await getSmsAI().chat.completions.create({
    model: SMS_MODEL,
    messages,
    temperature: 0.5,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No conversation reply generated");

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned) as SMSAIResult;
  } catch {
    return {
      message: content.replace(/^["']|["']$/g, ""),
      action: "continue",
    };
  }
}
