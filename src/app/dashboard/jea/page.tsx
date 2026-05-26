"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  Clock,
  AlertTriangle,
  Copy,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Flame,
  Calendar,
  Mail,
  PhoneOff,
} from "lucide-react";
import type {
  Contact,
  CallRecordWithContact,
  JeaStats,
  TaskWithContact,
} from "@/lib/types";

const OUTCOME_COLORS: Record<string, string> = {
  booked: "bg-green-100 text-green-800",
  hot: "bg-orange-100 text-orange-800",
  callback: "bg-blue-100 text-blue-800",
  voicemail: "bg-gray-100 text-gray-700",
  no_answer: "bg-gray-100 text-gray-700",
  not_interested: "bg-red-100 text-red-800",
  dnc: "bg-red-200 text-red-900",
  wrong_number: "bg-gray-200 text-gray-800",
  recent_buyer: "bg-yellow-100 text-yellow-800",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  callback: <Phone size={14} />,
  send_email: <Mail size={14} />,
  book_appointment: <Calendar size={14} />,
  no_action: <PhoneOff size={14} />,
};

export default function JeaCommandCenter() {
  const [stats, setStats] = useState<JeaStats | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<TaskWithContact[]>([]);
  const [todayCalls, setTodayCalls] = useState<CallRecordWithContact[]>([]);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [statsRes, contactsRes, tasksRes, callsRes] = await Promise.all([
      fetch("/api/stats"),
      fetch("/api/contacts?status=active&limit=100"),
      fetch("/api/tasks/due?assigned_to=jea"),
      fetch("/api/calls/today"),
    ]);

    const [statsData, contactsData, tasksData, callsData] = await Promise.all([
      statsRes.json(),
      contactsRes.json(),
      tasksRes.json(),
      callsRes.json(),
    ]);

    setStats(statsData.jea);
    setContacts(contactsData.contacts ?? []);
    setTasks(tasksData.tasks ?? []);
    setTodayCalls(callsData.calls ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await fetchData();
      if (cancelled) return;
    }
    init();
    const interval = setInterval(fetchData, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchData]);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Sort contacts: tasks due today first, hot leads, never called, callbacks
  const sortedContacts = [...contacts].sort((a, b) => {
    const aHasTask = tasks.some((t) => t.contact_id === a.id);
    const bHasTask = tasks.some((t) => t.contact_id === b.id);
    if (aHasTask && !bHasTask) return -1;
    if (!aHasTask && bHasTask) return 1;

    if (a.interest_level === "hot" && b.interest_level !== "hot") return -1;
    if (a.interest_level !== "hot" && b.interest_level === "hot") return 1;

    if (a.call_count === 0 && b.call_count > 0) return -1;
    if (a.call_count > 0 && b.call_count === 0) return 1;

    return 0;
  });

  // Get latest call for a contact
  function getLatestCall(contactId: string): CallRecordWithContact | undefined {
    return todayCalls.find((c) => c.contact_id === contactId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const paceColor =
    stats?.pace_status === "green"
      ? "text-green-600"
      : stats?.pace_status === "amber"
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div className="space-y-6">
      {/* Top Bar — Daily Targets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Calls Made"
          value={stats?.calls_made ?? 0}
          sub={`/ ${stats?.calls_target ?? 200}`}
        />
        <StatCard
          label="Remaining"
          value={stats?.calls_remaining ?? 200}
          className="text-gray-600"
        />
        <StatCard
          label="Appointments"
          value={stats?.appointments_booked ?? 0}
          className="text-green-600"
        />
        <StatCard
          label="Hot Leads"
          value={stats?.hot_leads ?? 0}
          className="text-orange-600"
        />
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Progress
          </p>
          <div className="mt-2 bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${
                stats?.pace_status === "green"
                  ? "bg-green-500"
                  : stats?.pace_status === "amber"
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{
                width: `${Math.min(100, ((stats?.calls_made ?? 0) / (stats?.calls_target ?? 200)) * 100)}%`,
              }}
            />
          </div>
          <p className={`text-xs mt-1 font-medium ${paceColor}`}>
            {Math.round(
              ((stats?.calls_made ?? 0) / (stats?.calls_target ?? 200)) * 100
            )}
            %
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pace</p>
          <p className={`text-2xl font-bold mt-1 ${paceColor}`}>
            {stats?.pace_status === "green"
              ? "On Track"
              : stats?.pace_status === "amber"
                ? "Behind"
                : "Off Pace"}
          </p>
        </div>
      </div>

      {/* Tasks Due Today */}
      {tasks.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h2 className="font-semibold text-blue-800 text-sm mb-3">
            Tasks Due Today ({tasks.length})
          </h2>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white rounded-lg p-3 flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  {ACTION_ICONS[task.task_type]}
                  <span className="font-medium">
                    {task.contacts
                      ? `${task.contacts.first_name} ${task.contacts.last_name}`
                      : "Unknown"}
                  </span>
                  <span className="text-gray-500">{task.details}</span>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/tasks/${task.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ completed: true }),
                    });
                    fetchData();
                  }}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  Done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Call List */}
      <div>
        <h2 className="font-semibold text-lg mb-3">
          Call List ({sortedContacts.length})
        </h2>
        <div className="space-y-3">
          {sortedContacts.map((contact) => {
            const isExpanded = expandedContact === contact.id;
            const latestCall = getLatestCall(contact.id);
            const isDNC =
              contact.do_not_call_until &&
              new Date(contact.do_not_call_until) > new Date();
            const hasTask = tasks.some((t) => t.contact_id === contact.id);

            return (
              <div
                key={contact.id}
                className={`bg-white rounded-xl border ${
                  isDNC
                    ? "border-red-300"
                    : hasTask
                      ? "border-blue-300"
                      : contact.interest_level === "hot"
                        ? "border-orange-300"
                        : "border-gray-200"
                } overflow-hidden`}
              >
                {/* Contact Header */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() =>
                    setExpandedContact(isExpanded ? null : contact.id)
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {contact.first_name} {contact.last_name}
                          </span>
                          {contact.interest_level === "hot" && (
                            <Flame size={14} className="text-orange-500" />
                          )}
                          {isDNC && (
                            <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                              DO NOT CALL
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {contact.phone}
                          {contact.vehicle_year &&
                            ` · ${contact.vehicle_year} ${contact.vehicle_make ?? ""} ${contact.vehicle_model ?? ""}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {contact.call_count > 0 && (
                        <span className="text-xs text-gray-500">
                          {contact.call_count} call
                          {contact.call_count > 1 ? "s" : ""}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </div>
                  </div>

                  {/* Pre-call info */}
                  {!isExpanded && contact.call_count > 0 && (
                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        Last:{" "}
                        {contact.last_called_at
                          ? new Date(contact.last_called_at).toLocaleDateString()
                          : "—"}
                      </span>
                      {contact.interest_level && (
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            contact.interest_level === "hot"
                              ? "bg-orange-100 text-orange-700"
                              : contact.interest_level === "warm"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {contact.interest_level}
                        </span>
                      )}
                      {contact.vehicle_ownership_duration && (
                        <span>Owned: {contact.vehicle_ownership_duration}</span>
                      )}
                    </div>
                  )}

                  {/* DNC warning */}
                  {isDNC && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2 text-xs text-red-700">
                      <AlertTriangle size={14} />
                      <span>
                        Recent buyer — do not call until{" "}
                        {new Date(contact.do_not_call_until!).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expanded — call details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {/* Previous call intelligence */}
                    {contact.vehicle_ownership_duration && (
                      <div className="text-sm">
                        <span className="text-gray-500">Vehicle ownership:</span>{" "}
                        {contact.vehicle_ownership_duration}
                      </div>
                    )}
                    {contact.trade_in_available !== null && (
                      <div className="text-sm">
                        <span className="text-gray-500">Trade-in:</span>{" "}
                        {contact.trade_in_available ? "Yes" : "No"}
                      </div>
                    )}
                    {contact.monthly_budget && (
                      <div className="text-sm">
                        <span className="text-gray-500">Budget:</span>{" "}
                        {contact.monthly_budget}
                      </div>
                    )}

                    {/* Latest call card (post-call) */}
                    {latestCall && latestCall.gpt_processed && (
                      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        {/* Outcome badge */}
                        {latestCall.outcome && (
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold uppercase ${
                              OUTCOME_COLORS[latestCall.outcome] ?? "bg-gray-100"
                            }`}
                          >
                            {latestCall.outcome.replace("_", " ")}
                          </span>
                        )}

                        {/* GPT Summary */}
                        {latestCall.gpt_summary && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">
                              Summary
                            </p>
                            <p className="text-sm">{latestCall.gpt_summary}</p>
                          </div>
                        )}

                        {/* CRM Notes with copy */}
                        {latestCall.crm_notes && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-gray-500">
                                CRM Notes
                              </p>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    latestCall.crm_notes!,
                                    latestCall.id
                                  )
                                }
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              >
                                {copiedId === latestCall.id ? (
                                  <>
                                    <CheckCircle size={12} /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} /> Copy
                                  </>
                                )}
                              </button>
                            </div>
                            <p className="text-sm bg-white rounded p-2 border border-gray-200 whitespace-pre-wrap">
                              {latestCall.crm_notes}
                            </p>
                          </div>
                        )}

                        {/* Next Action */}
                        {latestCall.next_action &&
                          latestCall.next_action !== "no_action" && (
                            <div className="bg-blue-50 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                {ACTION_ICONS[latestCall.next_action]}
                                <span className="text-xs font-semibold text-blue-800 uppercase">
                                  {latestCall.next_action.replace("_", " ")}
                                </span>
                                {latestCall.next_action_at && (
                                  <span className="text-xs text-blue-600">
                                    {new Date(
                                      latestCall.next_action_at
                                    ).toLocaleString("en-CA", {
                                      timeZone: "America/Edmonton",
                                    })}
                                  </span>
                                )}
                              </div>
                              {latestCall.next_action_details && (
                                <p className="text-sm text-blue-700">
                                  {latestCall.next_action_details}
                                </p>
                              )}
                            </div>
                          )}

                        {/* Coaching */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {latestCall.what_went_well && (
                            <div className="bg-green-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-green-700 mb-1">
                                What went well
                              </p>
                              <p className="text-sm text-green-800">
                                {latestCall.what_went_well}
                              </p>
                            </div>
                          )}
                          {latestCall.coaching_tip && (
                            <div className="bg-amber-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-amber-700 mb-1">
                                Coaching tip
                              </p>
                              <p className="text-sm text-amber-800">
                                {latestCall.coaching_tip}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Processing indicator */}
                    {latestCall && !latestCall.gpt_processed && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                        Processing call with GPT-4o...
                      </div>
                    )}

                    {/* No calls yet */}
                    {!latestCall && contact.call_count === 0 && (
                      <p className="text-sm text-gray-400 italic">
                        No calls yet — tap phone number to dial in Quo
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: number;
  sub?: string;
  className?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${className}`}>
        {value}
        {sub && <span className="text-sm font-normal text-gray-400">{sub}</span>}
      </p>
    </div>
  );
}
