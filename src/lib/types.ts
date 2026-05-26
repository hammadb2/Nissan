// Database types matching Supabase schema

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_ownership_duration: string | null;
  is_recent_buyer: boolean | null;
  do_not_call_until: string | null;
  trade_in_available: boolean | null;
  monthly_budget: string | null;
  interest_level: "hot" | "warm" | "cold" | "not_interested" | null;
  call_count: number;
  last_called_at: string | null;
  next_action: "callback" | "send_email" | "book_appointment" | "no_action" | null;
  next_action_at: string | null;
  status: "active" | "dnc" | "recent_buyer" | "appointment_booked" | "closed";
  notes: string | null;
  import_batch: string | null;
  assigned_call_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallRecord {
  id: string;
  contact_id: string | null;
  quo_call_id: string | null;
  duration_seconds: number | null;
  called_at: string;
  transcript: string | null;
  quo_summary: string | null;
  gpt_summary: string | null;
  crm_notes: string | null;
  next_action: "callback" | "send_email" | "book_appointment" | "no_action" | null;
  next_action_at: string | null;
  next_action_details: string | null;
  coaching_tip: string | null;
  what_went_well: string | null;
  sentiment: "warm" | "neutral" | "cold" | "hostile" | null;
  outcome: "booked" | "hot" | "callback" | "voicemail" | "no_answer" | "not_interested" | "dnc" | "wrong_number" | "recent_buyer" | null;
  is_recent_buyer_flag: boolean;
  recent_buyer_flag_reason: string | null;
  interest_level: "hot" | "warm" | "cold" | "not_interested" | null;
  vehicle_ownership_duration: string | null;
  trade_in_available: boolean | null;
  monthly_budget: string | null;
  gpt_processed: boolean;
  transcript_received: boolean;
  summary_received: boolean;
  created_at: string;
  recording_url: string | null;
  direction: "incoming" | "outgoing" | null;
  from_number: string | null;
  to_number: string | null;
}

export interface CallRecordWithContact extends CallRecord {
  contacts: Contact | null;
}

export interface Listing {
  id: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_trim: string | null;
  mileage: number | null;
  price: number | null;
  colour: string | null;
  marketplace_url: string | null;
  listed_at: string | null;
  last_refreshed_at: string | null;
  status: "not_listed" | "listed" | "needs_refresh" | "sold";
  inquiry_count: number;
  phone_numbers_collected: number;
  appointments_booked: number;
  notes: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  contact_id: string | null;
  listing_id: string | null;
  source: "outbound_call" | "marketplace" | "walk_in";
  appointment_type: "in_person" | "phone_call";
  scheduled_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_interested: string | null;
  budget: string | null;
  trade_in: boolean | null;
  showed_up: boolean | null;
  closed: boolean;
  commission_amount: number | null;
  notes: string | null;
  whatsapp_sent: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  contact_id: string | null;
  call_record_id: string | null;
  assigned_to: "jea" | "dann" | "hammad";
  task_type: "callback" | "send_email" | "book_appointment" | "follow_up_no_show";
  due_at: string;
  details: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface TaskWithContact extends Task {
  contacts: Contact | null;
}

export interface DailyStats {
  id: string;
  date: string;
  user_role: "jea" | "dann";
  calls_made: number;
  calls_target: number;
  appointments_booked: number;
  hot_leads: number;
  phone_numbers_collected: number;
  listings_live: number;
  listings_added: number;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: "hammad" | "jea" | "dann";
  created_at: string;
}

// GPT-4o analysis response
export interface GPTAnalysis {
  gpt_summary: string;
  crm_notes: string;
  outcome: "booked" | "hot" | "callback" | "voicemail" | "no_answer" | "not_interested" | "dnc" | "wrong_number" | "recent_buyer";
  sentiment: "warm" | "neutral" | "cold" | "hostile";
  interest_level: "hot" | "warm" | "cold" | "not_interested";
  is_recent_buyer: boolean;
  vehicle_ownership_duration: string | null;
  trade_in_available: boolean | null;
  monthly_budget: string | null;
  next_action: "callback" | "send_email" | "book_appointment" | "no_action";
  next_action_at: string | null;
  next_action_details: string;
  what_went_well: string;
  coaching_tip: string;
  recent_buyer_flag_reason: string | null;
}

// Quo webhook types
export interface QuoDialogueEntry {
  userId: string | null;
  identifier: string | null;
  content: string;
  createdAt: string;
}

export interface QuoCallContext {
  id: string;
  phoneNumber: { id: string; number: string } | null;
  participants: {
    internal: Array<{ userId: string; displayName: string | null }>;
    external: Array<{ identifier: string }>;
  };
}

export type QuoWebhookPayload = QuoTranscriptPayload | QuoSummaryPayload | QuoMessagePayload;

export interface QuoMessagePayload {
  id: string;
  apiVersion: string;
  createdAt: string;
  type: "message.received";
  data: {
    resource: {
      id: string;
      body: string;
      from: string;
      to: string;
      createdAt: string;
      direction: "incoming" | "outgoing";
    };
    context: QuoCallContext;
    links: { quo: string | null };
  };
}

export interface QuoTranscriptPayload {
  id: string;
  apiVersion: string;
  createdAt: string;
  type: "call.transcript.completed";
  data: {
    resource: {
      callId: string;
      createdAt: string;
      duration: number;
      processingStatus: "absent" | "in-progress" | "completed" | "failed";
      dialogue: QuoDialogueEntry[] | null;
    };
    context: QuoCallContext;
    links: { quo: string | null };
  };
}

export interface QuoSummaryPayload {
  id: string;
  apiVersion: string;
  createdAt: string;
  type: "call.summary.completed";
  data: {
    resource: {
      callId: string;
      processingStatus: "absent" | "in-progress" | "completed" | "failed";
      summary: string[] | null;
      nextSteps: string[] | null;
      fromPhoneNumber: string | null;
      handledByAiAgent: boolean;
      answeredByUserId: string | null;
    };
    context: QuoCallContext;
    links: { quo: string | null };
  };
}

// Quo REST API types (for sync)
export interface QuoApiCall {
  id: string;
  phoneNumberId: string;
  participants: string[];
  direction: "incoming" | "outgoing";
  status: string;
  duration: number;
  createdAt: string;
  answeredAt: string | null;
  completedAt: string | null;
  userId: string | null;
  answeredBy: string | null;
  initiatedBy: string | null;
}

export interface QuoApiTranscript {
  callId: string;
  createdAt: string;
  duration: number;
  status: "absent" | "in-progress" | "completed" | "failed";
  dialogue: Array<{
    content: string;
    start: number;
    end: number;
    identifier: string | null;
    userId: string | null;
  }> | null;
}

export interface QuoApiSummary {
  callId: string;
  status: "absent" | "in-progress" | "completed" | "failed";
  summary: string[] | null;
  nextSteps: string[] | null;
}

export interface QuoApiRecording {
  id: string;
  duration: number | null;
  startTime: string | null;
  status: string | null;
  type: string | null;
  url: string | null;
}

export interface QuoApiPhoneNumber {
  id: string;
  number: string;
  name: string | null;
  users: Array<{ userId: string; displayName: string | null }>;
}

export interface QuoApiConversation {
  id: string;
  phoneNumberId: string;
  participants: string[];
  lastActivityAt: string;
}

export interface QuoSyncProgress {
  status: "idle" | "syncing" | "complete" | "error";
  totalConversations: number;
  processedConversations: number;
  totalCalls: number;
  newCalls: number;
  updatedCalls: number;
  errors: string[];
}

// Dashboard stats
export interface JeaStats {
  calls_made: number;
  calls_target: number;
  calls_remaining: number;
  appointments_booked: number;
  hot_leads: number;
  pace_status: "green" | "amber" | "red";
}

export interface DannStats {
  listings_live: number;
  new_listings_today: number;
  listings_target: number;
  inquiries_today: number;
  phone_numbers_collected: number;
  appointments_booked: number;
}

export interface PipelineStats {
  total_appointments_today: number;
  showed_up: number;
  closed: number;
  commission_today: number;
  total_appointments_month: number;
  close_rate_month: number;
  deals_closed_month: number;
  total_commission_month: number;
}
