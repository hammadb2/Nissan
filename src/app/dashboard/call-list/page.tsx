"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  Copy,
  CheckCircle,
  Clock,
  Flame,
  PhoneOff,
  PhoneForwarded,
  Calendar,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit3,
} from "lucide-react";
import type { Contact } from "@/lib/types";

interface CallListContact extends Contact {
  called_today: boolean;
  today_outcome: string | null;
  today_summary: string | null;
  today_called_at: string | null;
  today_duration: number | null;
}

interface CallListResponse {
  contacts: CallListContact[];
  total: number;
  calledToday: number;
  callsToday: number;
  dailyLimit: number;
  remainingPool: number;
}

const OUTCOME_OPTIONS = [
  { value: "booked", label: "Appointment Booked", color: "bg-green-100 text-green-800", icon: Calendar },
  { value: "hot", label: "Hot Lead", color: "bg-orange-100 text-orange-800", icon: Flame },
  { value: "callback", label: "Callback", color: "bg-blue-100 text-blue-800", icon: PhoneForwarded },
  { value: "voicemail", label: "Voicemail", color: "bg-gray-100 text-gray-700", icon: Phone },
  { value: "no_answer", label: "No Answer", color: "bg-gray-100 text-gray-700", icon: PhoneOff },
  { value: "not_interested", label: "Not Interested", color: "bg-red-100 text-red-800", icon: XCircle },
];

const OUTCOME_COLORS: Record<string, string> = Object.fromEntries(
  OUTCOME_OPTIONS.map((o) => [o.value, o.color])
);

export default function DailyCallListPage() {
  const [contacts, setContacts] = useState<CallListContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checkingCall, setCheckingCall] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCalled, setShowCalled] = useState(false);
  const [settingOutcome, setSettingOutcome] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(200);
  const [remainingPool, setRemainingPool] = useState(0);
  const [callsToday, setCallsToday] = useState(0);
  const [markingCallId, setMarkingCallId] = useState<string | null>(null);
  const [markNotes, setMarkNotes] = useState("");
  const [markOutcome, setMarkOutcome] = useState<string | null>(null);
  const [savingMark, setSavingMark] = useState(false);

  const fetchList = useCallback(async () => {
    const res = await fetch(`/api/call-list?showCalled=${showCalled}`);
    const data: CallListResponse = await res.json();
    setContacts(data.contacts ?? []);
    setDailyLimit(data.dailyLimit ?? 200);
    setRemainingPool(data.remainingPool ?? 0);
    setCallsToday(data.callsToday ?? data.calledToday ?? 0);
    setLoading(false);
  }, [showCalled]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await fetchList();
      if (cancelled) return;
    }
    init();
    const interval = setInterval(fetchList, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchList]);

  function copyNumber(phone: string, id: string) {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function checkCall(contact: CallListContact) {
    setCheckingCall(contact.id);
    try {
      const res = await fetch("/api/call-list/check-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, phone: contact.phone }),
      });
      const data = await res.json();

      if (data.status === "found") {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id
              ? {
                  ...c,
                  called_today: true,
                  today_outcome: data.call.outcome,
                  today_summary: data.call.summary,
                  today_called_at: data.call.calledAt,
                  today_duration: data.call.duration,
                }
              : c
          )
        );
        setExpandedId(contact.id);
      } else {
        // Show mark-as-called form instead of alert
        setMarkingCallId(contact.id);
        setMarkNotes("");
        setMarkOutcome(null);
        setExpandedId(contact.id);
      }
    } catch {
      setMarkingCallId(contact.id);
      setMarkNotes("");
      setMarkOutcome(null);
      setExpandedId(contact.id);
    } finally {
      setCheckingCall(null);
    }
  }

  async function markAsCalled(contact: CallListContact) {
    setSavingMark(true);
    try {
      const res = await fetch("/api/call-list/mark-called", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          phone: contact.phone,
          notes: markNotes || null,
          outcome: markOutcome || null,
        }),
      });
      const data = await res.json();
      if (data.status === "marked") {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id
              ? {
                  ...c,
                  called_today: true,
                  today_outcome: markOutcome,
                  today_summary: markNotes || null,
                  today_called_at: new Date().toISOString(),
                  today_duration: null,
                }
              : c
          )
        );
        setMarkingCallId(null);
      }
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSavingMark(false);
    }
  }

  async function setOutcome(contactId: string, outcome: string) {
    setSettingOutcome(contactId);
    try {
      await fetch("/api/call-list/outcome", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, outcome }),
      });
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? { ...c, today_outcome: outcome, called_today: true }
            : c
        )
      );
    } catch {
      alert("Failed to update outcome.");
    } finally {
      setSettingOutcome(null);
    }
  }

  const calledInListCount = contacts.filter((c) => c.called_today).length;
  const calledCount = Math.max(callsToday, calledInListCount);
  const remainingCount = Math.max(0, dailyLimit - calledCount);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Call List</h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-semibold text-gray-700">{calledCount}</span> calls completed · <span className="font-semibold text-gray-700">{remainingCount}</span> remaining of {dailyLimit}
            {remainingPool > 0 && ` · ${remainingPool} in pool`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showCalled}
              onChange={(e) => setShowCalled(e.target.checked)}
              className="rounded"
            />
            Show called
          </label>
          <button
            onClick={() => fetchList()}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">
            {calledCount} of {dailyLimit} calls completed
          </span>
          <span className="text-gray-500">
            {Math.round((calledCount / dailyLimit) * 100)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all ${
              calledCount >= dailyLimit
                ? "bg-green-500"
                : calledCount >= dailyLimit * 0.5
                  ? "bg-blue-500"
                  : "bg-amber-500"
            }`}
            style={{ width: `${Math.min(100, (calledCount / dailyLimit) * 100)}%` }}
          />
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <strong>How it works:</strong> Copy a number → paste into Quo → make the call → click &quot;Check Call&quot; to auto-fetch the result. If no record is found, you can mark the call manually and it will sync when Quo catches up.
      </div>

      {/* Call List */}
      <div className="space-y-2">
        {contacts.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No contacts to call. Import contacts or sync from Quo first.
          </div>
        )}

        {contacts.map((contact, index) => {
          const isExpanded = expandedId === contact.id;
          const isCopied = copiedId === contact.id;
          const isChecking = checkingCall === contact.id;

          return (
            <div
              key={contact.id}
              className={`bg-white border rounded-xl overflow-hidden ${
                contact.called_today
                  ? contact.today_outcome === "booked"
                    ? "border-green-300 bg-green-50/30"
                    : contact.today_outcome === "hot"
                      ? "border-orange-300"
                      : "border-gray-200 opacity-75"
                  : contact.interest_level === "hot"
                    ? "border-orange-300"
                    : contact.next_action === "callback"
                      ? "border-blue-300"
                      : "border-gray-200"
              }`}
            >
              {/* Main Row */}
              <div className="p-4 flex items-center gap-3">
                {/* Number indicator */}
                <span className="text-xs text-gray-400 w-6 text-right shrink-0">
                  {index + 1}
                </span>

                {/* Contact Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {contact.first_name} {contact.last_name}
                    </span>
                    {contact.interest_level === "hot" && (
                      <Flame size={14} className="text-orange-500" />
                    )}
                    {contact.next_action === "callback" && !contact.called_today && (
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        CALLBACK
                      </span>
                    )}
                    {contact.called_today && contact.today_outcome && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          OUTCOME_COLORS[contact.today_outcome] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {contact.today_outcome.replace("_", " ").toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span>{contact.phone}</span>
                    {contact.call_count > 0 && (
                      <span>{contact.call_count} previous call{contact.call_count > 1 ? "s" : ""}</span>
                    )}
                    {contact.vehicle_year && (
                      <span>
                        {contact.vehicle_year} {contact.vehicle_make ?? ""} {contact.vehicle_model ?? ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {!contact.called_today && (
                    <>
                      <button
                        onClick={() => copyNumber(contact.phone, contact.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          isCopied
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <CheckCircle size={14} />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => checkCall(contact)}
                        disabled={isChecking}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        {isChecking ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Checking...
                          </>
                        ) : (
                          <>
                            <Phone size={14} />
                            Check Call
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {contact.called_today && !contact.today_outcome && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100"
                    >
                      Set Outcome
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 space-y-4">
                  {/* Mark as Called form — shown when Check Call didn't find a record */}
                  {markingCallId === contact.id && !contact.called_today && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                        <Edit3 size={14} />
                        No record found in Quo — mark this call manually
                      </div>
                      <textarea
                        value={markNotes}
                        onChange={(e) => setMarkNotes(e.target.value)}
                        placeholder="Add notes about the call (optional)..."
                        className="w-full border border-amber-300 rounded-lg p-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Outcome</p>
                        <div className="flex flex-wrap gap-2">
                          {OUTCOME_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            const isActive = markOutcome === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setMarkOutcome(isActive ? null : opt.value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isActive
                                    ? opt.color + " ring-2 ring-offset-1 ring-gray-400"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                              >
                                <Icon size={12} />
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => markAsCalled(contact)}
                          disabled={savingMark}
                          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {savingMark ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle size={14} />
                          )}
                          Mark as Called
                        </button>
                        <button
                          onClick={() => setMarkingCallId(null)}
                          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        When Quo syncs the call later, it will automatically merge with this record.
                      </p>
                    </div>
                  )}

                  {/* Call Result */}
                  {contact.called_today && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="flex items-center gap-1 text-gray-500">
                          <Clock size={14} />
                          {contact.today_called_at
                            ? new Date(contact.today_called_at).toLocaleTimeString("en-US", {
                                timeZone: "America/Edmonton",
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              }) + " MST"
                            : "—"}
                        </span>
                        {contact.today_duration !== null && (
                          <span className="text-gray-500">
                            {Math.floor(contact.today_duration / 60)}:{String(contact.today_duration % 60).padStart(2, "0")}
                          </span>
                        )}
                      </div>
                      {contact.today_summary && (
                        <p className="text-sm text-gray-700">{contact.today_summary}</p>
                      )}
                    </div>
                  )}

                  {/* Outcome Selector */}
                  {contact.called_today && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">
                        {contact.today_outcome ? "Change Outcome" : "Set Outcome"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {OUTCOME_OPTIONS.map((opt) => {
                          const Icon = opt.icon;
                          const isActive = contact.today_outcome === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setOutcome(contact.id, opt.value)}
                              disabled={settingOutcome === contact.id}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isActive
                                  ? opt.color + " ring-2 ring-offset-1 ring-gray-400"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              <Icon size={12} />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Contact Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    {contact.vehicle_ownership_duration && (
                      <div>
                        <span className="text-gray-500">Ownership:</span>{" "}
                        {contact.vehicle_ownership_duration}
                      </div>
                    )}
                    {contact.trade_in_available !== null && (
                      <div>
                        <span className="text-gray-500">Trade-in:</span>{" "}
                        {contact.trade_in_available ? "Yes" : "No"}
                      </div>
                    )}
                    {contact.monthly_budget && (
                      <div>
                        <span className="text-gray-500">Budget:</span>{" "}
                        {contact.monthly_budget}
                      </div>
                    )}
                    {contact.notes && (
                      <div className="col-span-full">
                        <span className="text-gray-500">Notes:</span>{" "}
                        {contact.notes}
                      </div>
                    )}
                  </div>

                  {/* Quick actions for not-yet-called */}
                  {!contact.called_today && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyNumber(contact.phone, contact.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100"
                      >
                        <Copy size={14} />
                        Copy Number
                      </button>
                      <button
                        onClick={() => checkCall(contact)}
                        disabled={isChecking}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        {isChecking ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Phone size={14} />
                        )}
                        Check Call
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
