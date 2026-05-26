export type NextActionType =
  | "schedule_appointment"
  | "schedule_callback"
  | "send_email"
  | "no_action";

export interface Call {
  id: string;
  quo_call_id: string | null;
  agent_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: string | null;
  call_duration_seconds: number | null;
  call_started_at: string | null;
  call_ended_at: string | null;
  transcript: string | null;
  quo_summary: string | null;
  ai_summary: string | null;
  crm_notes: string | null;
  next_action_type: NextActionType | null;
  next_action_date: string | null;
  next_action_details: string | null;
  coaching_positive: string | null;
  coaching_improvement: string | null;
  is_recent_buyer: boolean;
  purchase_date: string | null;
  transcript_received: boolean;
  summary_received: boolean;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  purchase_date: string | null;
  vehicle_purchased: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyTarget {
  id: string;
  target_date: string;
  target_calls: number;
  created_at: string;
}

export interface WeeklyReport {
  id: string;
  agent_name: string;
  week_start: string;
  week_end: string;
  report_content: string | null;
  total_calls: number;
  appointments_booked: number;
  recent_buyer_flags: number;
  created_at: string;
}

export interface AIAnalysis {
  ai_summary: string;
  crm_notes: string;
  next_action_type: NextActionType;
  next_action_date: string | null;
  next_action_details: string;
  coaching_positive: string;
  coaching_improvement: string;
}

export interface DashboardStats {
  totalCallsToday: number;
  targetCalls: number;
  callsRemaining: number;
  appointmentsToday: number;
  recentBuyerFlags: number;
}

// --- Quo Webhook Types (matches real Quo API) ---

export interface QuoCallContext {
  phoneNumberId: string | null;
  conversationId: string | null;
  phoneNumberType: "shared" | "private" | "external" | null;
  userId: string;
  contacts: {
    ids: string[];
    lookupStatus: "matched" | "none" | "unavailable";
  };
  participants: {
    workspace: string[];
    external: string[];
    resolution: "available" | "unavailable";
  };
}

export interface QuoDialogueEntry {
  userId: string | null;
  identifier: string | null;
  content: string;
  start: number;
  end: number;
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

export type QuoWebhookPayload = QuoTranscriptPayload | QuoSummaryPayload;
