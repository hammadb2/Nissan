"use client";

import {
  Phone,
  Clock,
  Calendar,
  AlertTriangle,
  Copy,
  CheckCircle,
  ArrowRight,
  Mail,
  PhoneCall,
  Ban,
} from "lucide-react";
import { useState } from "react";
import type { Call, NextActionType } from "@/lib/types";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const actionIcons: Record<NextActionType, React.ReactNode> = {
  schedule_appointment: <Calendar className="w-4 h-4" />,
  schedule_callback: <PhoneCall className="w-4 h-4" />,
  send_email: <Mail className="w-4 h-4" />,
  no_action: <Ban className="w-4 h-4" />,
};

const actionLabels: Record<NextActionType, string> = {
  schedule_appointment: "Schedule Appointment",
  schedule_callback: "Schedule Callback",
  send_email: "Send Email",
  no_action: "No Action Needed",
};

const actionColors: Record<NextActionType, string> = {
  schedule_appointment: "bg-blue-100 text-blue-800 border-blue-200",
  schedule_callback: "bg-amber-100 text-amber-800 border-amber-200",
  send_email: "bg-purple-100 text-purple-800 border-purple-200",
  no_action: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function CallCard({
  call,
  showCoaching = false,
}: {
  call: Call;
  showCoaching?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (call.crm_notes) {
      await navigator.clipboard.writeText(call.crm_notes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`rounded-xl border p-5 transition-shadow hover:shadow-md ${
        call.is_recent_buyer
          ? "border-red-300 bg-red-50"
          : "border-gray-200 bg-white"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
            {(call.customer_name ?? "?")[0]?.toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {call.customer_name ?? "Unknown Caller"}
            </h3>
            {call.customer_phone && (
              <p className="text-sm text-gray-500">{call.customer_phone}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatDuration(call.call_duration_seconds)}</span>
          <span className="text-gray-300">•</span>
          <span>{formatDate(call.created_at)}</span>
        </div>
      </div>

      {/* Recent Buyer Warning */}
      {call.is_recent_buyer && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-100 rounded-lg border border-red-200">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span className="text-sm font-medium text-red-700">
            Recent Buyer — purchased{" "}
            {call.purchase_date
              ? new Date(call.purchase_date).toLocaleDateString("en-CA")
              : "within 12 months"}
            . Skip this customer.
          </span>
        </div>
      )}

      {/* AI Summary */}
      {call.ai_summary ? (
        <div className="mb-3">
          <p className="text-sm text-gray-700 leading-relaxed">
            {call.ai_summary}
          </p>
        </div>
      ) : (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-400 italic">
            {call.transcript
              ? "Analyzing call..."
              : "Waiting for transcript..."}
          </p>
        </div>
      )}

      {/* CRM Notes */}
      {call.crm_notes && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              CRM Notes
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-green-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-line">
            {call.crm_notes}
          </p>
        </div>
      )}

      {/* Next Action */}
      {call.next_action_type && (
        <div className="mb-3">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              actionColors[call.next_action_type]
            }`}
          >
            {actionIcons[call.next_action_type]}
            {actionLabels[call.next_action_type]}
          </div>
          {call.next_action_details && (
            <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
              <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{call.next_action_details}</span>
            </div>
          )}
          {call.next_action_date && (
            <p className="mt-1 ml-5 text-xs text-gray-400">
              <Calendar className="w-3 h-3 inline mr-1" />
              {formatDate(call.next_action_date)}
            </p>
          )}
        </div>
      )}

      {/* Coaching Tip */}
      {showCoaching && (call.coaching_positive || call.coaching_improvement) && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Coaching
          </span>
          <div className="mt-1.5 space-y-1">
            {call.coaching_positive && (
              <p className="text-sm text-green-700">
                <span className="font-medium">Strength:</span>{" "}
                {call.coaching_positive}
              </p>
            )}
            {call.coaching_improvement && (
              <p className="text-sm text-amber-700">
                <span className="font-medium">Improve:</span>{" "}
                {call.coaching_improvement}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {!call.analyzed_at && call.transcript_received && (
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
          <Phone className="w-3 h-3 animate-pulse" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
}
