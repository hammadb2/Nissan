"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  ShoppingBag,
  TrendingUp,
  AlertCircle,
  Flame,
  Calendar,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  JeaStats,
  DannStats,
  PipelineStats,
  CallRecordWithContact,
} from "@/lib/types";

export default function BossDashboard() {
  const [jea, setJea] = useState<JeaStats | null>(null);
  const [dann, setDann] = useState<DannStats | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStats | null>(null);
  const [calls, setCalls] = useState<CallRecordWithContact[]>([]);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [coachingReport, setCoachingReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [statsRes, callsRes] = await Promise.all([
      fetch("/api/stats"),
      fetch("/api/calls/today"),
    ]);

    const [statsData, callsData] = await Promise.all([
      statsRes.json(),
      callsRes.json(),
    ]);

    setJea(statsData.jea);
    setDann(statsData.dann);
    setPipeline(statsData.pipeline);
    setCalls(callsData.calls ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await fetchData();
      if (cancelled) return;
    }
    init();
    const interval = setInterval(fetchData, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchData]);

  async function generateReport() {
    setLoadingReport(true);
    const res = await fetch("/api/coaching/weekly");
    const data = await res.json();
    setCoachingReport(data.report);
    setLoadingReport(false);
  }

  // Flags and alerts
  const recentBuyerCalls = calls.filter((c) => c.is_recent_buyer_flag);
  const hotLeadCalls = calls.filter(
    (c) => c.interest_level === "hot" && c.outcome !== "booked"
  );
  const bookedCalls = calls.filter((c) => c.outcome === "booked");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const paceColor =
    jea?.pace_status === "green"
      ? "text-green-600"
      : jea?.pace_status === "amber"
        ? "text-amber-600"
        : "text-red-600";

  return (
    <div className="space-y-6">
      {/* Live Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Jea Today */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Phone size={18} className="text-blue-600" />
            <h2 className="font-semibold">Jea Today</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Calls" value={`${jea?.calls_made ?? 0} / ${jea?.calls_target ?? 200}`} />
            <Metric label="Appointments" value={jea?.appointments_booked ?? 0} className="text-green-600" />
            <Metric label="Hot Leads" value={jea?.hot_leads ?? 0} className="text-orange-600" />
            <div>
              <p className="text-xs text-gray-500 uppercase">Pace</p>
              <p className={`text-lg font-bold ${paceColor}`}>
                {jea?.pace_status === "green" ? "On Track" : jea?.pace_status === "amber" ? "Behind" : "Off Pace"}
              </p>
            </div>
          </div>
          <div className="mt-3 bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                jea?.pace_status === "green" ? "bg-green-500" : jea?.pace_status === "amber" ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, ((jea?.calls_made ?? 0) / (jea?.calls_target ?? 200)) * 100)}%` }}
            />
          </div>
        </div>

        {/* Dann Today */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag size={18} className="text-purple-600" />
            <h2 className="font-semibold">Dann Today</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Listings Live" value={dann?.listings_live ?? 0} className="text-green-600" />
            <Metric label="Inquiries" value={dann?.inquiries_today ?? 0} />
            <Metric label="Numbers" value={dann?.phone_numbers_collected ?? 0} />
            <Metric label="Appointments" value={dann?.appointments_booked ?? 0} className="text-green-600" />
          </div>
        </div>

        {/* Pipeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-green-600" />
            <h2 className="font-semibold">Pipeline</h2>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Today</p>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Appts" value={pipeline?.total_appointments_today ?? 0} />
                <Metric label="Showed" value={pipeline?.showed_up ?? 0} />
                <Metric label="Closed" value={pipeline?.closed ?? 0} className="text-green-600" />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase mb-1">This Month</p>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Deals" value={pipeline?.deals_closed_month ?? 0} className="text-green-600" />
                <Metric label="Close Rate" value={`${pipeline?.close_rate_month ?? 0}%`} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <DollarSign size={14} className="text-green-600" />
                <span className="text-lg font-bold text-green-600">
                  ${(pipeline?.total_commission_month ?? 0).toLocaleString()}
                </span>
                <span className="text-xs text-gray-500">commission</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flags & Alerts */}
      {(recentBuyerCalls.length > 0 || hotLeadCalls.length > 0 || bookedCalls.length > 0 || jea?.pace_status === "red") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {recentBuyerCalls.map((call) => (
            <AlertCard
              key={`rb-${call.id}`}
              color="red"
              icon={<AlertCircle size={16} />}
              title="Recent Buyer Called"
              description={
                call.contacts
                  ? `${call.contacts.first_name} ${call.contacts.last_name} — ${call.recent_buyer_flag_reason ?? "flagged as recent buyer"}`
                  : `${call.from_number ?? call.to_number ?? "Unknown"} — flagged as recent buyer`
              }
            />
          ))}
          {jea?.pace_status === "red" && (
            <AlertCard
              color="amber"
              icon={<AlertCircle size={16} />}
              title="Behind Pace"
              description={`Jea is at ${jea.calls_made}/${jea.calls_target} calls — significantly behind pace for 6PM.`}
            />
          )}
          {hotLeadCalls.map((call) => (
            <AlertCard
              key={`hl-${call.id}`}
              color="green"
              icon={<Flame size={16} />}
              title="Hot Lead"
              description={
                call.contacts
                  ? `${call.contacts.first_name} ${call.contacts.last_name} — ${call.contacts.vehicle_year ?? ""} ${call.contacts.vehicle_make ?? ""} ${call.contacts.vehicle_model ?? ""}`
                  : `Hot lead: ${call.from_number ?? call.to_number ?? "Unknown"}`
              }
            />
          ))}
          {bookedCalls.map((call) => (
            <AlertCard
              key={`bk-${call.id}`}
              color="blue"
              icon={<Calendar size={16} />}
              title="Appointment Booked"
              description={
                call.contacts
                  ? `${call.contacts.first_name} ${call.contacts.last_name}${call.next_action_at ? ` — ${new Date(call.next_action_at).toLocaleDateString()}` : ""}`
                  : `Appointment: ${call.from_number ?? call.to_number ?? "Unknown"}`
              }
            />
          ))}
        </div>
      )}

      {/* Live Call Feed */}
      <div>
        <h2 className="font-semibold text-lg mb-3">
          Live Call Feed ({calls.length} today)
        </h2>
        <div className="space-y-3">
          {calls.map((call) => {
            const isExpanded = expandedCall === call.id;
            const contact = call.contacts;

            return (
              <div
                key={call.id}
                className={`bg-white rounded-xl border ${
                  call.is_recent_buyer_flag
                    ? "border-red-300"
                    : call.interest_level === "hot"
                      ? "border-orange-300"
                      : "border-gray-200"
                } overflow-hidden`}
              >
                <div
                  className="p-4 cursor-pointer flex items-center justify-between"
                  onClick={() => setExpandedCall(isExpanded ? null : call.id)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {contact
                          ? `${contact.first_name} ${contact.last_name}`
                          : (call.from_number ?? call.to_number ?? "Unknown")}
                      </span>
                      {call.outcome && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          call.outcome === "booked" ? "bg-green-100 text-green-800" :
                          call.outcome === "hot" ? "bg-orange-100 text-orange-800" :
                          call.outcome === "dnc" ? "bg-red-200 text-red-900" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {call.outcome.toUpperCase()}
                        </span>
                      )}
                      {call.is_recent_buyer_flag && (
                        <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          RECENT BUYER
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {call.gpt_summary ?? call.quo_summary ?? (
                        call.transcript_received
                          ? "Analyzing..."
                          : "Waiting for transcript..."
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {new Date(call.called_at).toLocaleTimeString("en-US", {
                        timeZone: "America/Edmonton",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })} MST
                    </span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {isExpanded && call.gpt_processed && (
                  <div className="border-t border-gray-100 p-4 space-y-3 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-500 font-medium mb-1">CRM Notes</p>
                        <p className="bg-gray-50 rounded p-2 whitespace-pre-wrap">{call.crm_notes}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium mb-1">Sentiment</p>
                        <p className="capitalize">{call.sentiment ?? "—"}</p>
                        <p className="text-xs text-gray-500 font-medium mb-1 mt-2">Interest</p>
                        <p className="capitalize">{call.interest_level ?? "—"}</p>
                        {call.next_action && call.next_action !== "no_action" && (
                          <>
                            <p className="text-xs text-gray-500 font-medium mb-1 mt-2">Next Action</p>
                            <p className="capitalize">{call.next_action.replace("_", " ")}</p>
                            {call.next_action_details && (
                              <p className="text-gray-600 text-xs mt-1">{call.next_action_details}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {call.what_went_well && (
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-green-700 mb-1">What went well</p>
                          <p className="text-green-800">{call.what_went_well}</p>
                        </div>
                      )}
                      {call.coaching_tip && (
                        <div className="bg-amber-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-amber-700 mb-1">Coaching tip</p>
                          <p className="text-amber-800">{call.coaching_tip}</p>
                        </div>
                      )}
                    </div>
                    {call.is_recent_buyer_flag && call.recent_buyer_flag_reason && (
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-red-700 mb-1">Recent Buyer Flag</p>
                        <p className="text-red-800">{call.recent_buyer_flag_reason}</p>
                      </div>
                    )}
                    {call.transcript && (
                      <details className="text-xs">
                        <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
                          View Full Transcript
                        </summary>
                        <pre className="mt-2 bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-600 max-h-64 overflow-y-auto">
                          {call.transcript}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {calls.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">
              No calls today yet. Calls will appear here as Jea makes them.
            </p>
          )}
        </div>
      </div>

      {/* Weekly Coaching Report */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <h2 className="font-semibold">Weekly Coaching Report</h2>
          </div>
          <button
            onClick={generateReport}
            disabled={loadingReport}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingReport ? "Generating..." : "Generate Report"}
          </button>
        </div>
        {coachingReport && (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
            {coachingReport}
          </div>
        )}
        {!coachingReport && !loadingReport && (
          <p className="text-gray-400 text-sm">
            Click &quot;Generate Report&quot; to create a weekly coaching analysis based on Jea&apos;s calls.
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={`text-lg font-bold ${className}`}>{value}</p>
    </div>
  );
}

function AlertCard({
  color,
  icon,
  title,
  description,
}: {
  color: "red" | "amber" | "green" | "blue";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const colorClasses = {
    red: "bg-red-50 border-red-200 text-red-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    green: "bg-green-50 border-green-200 text-green-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-semibold uppercase">{title}</span>
      </div>
      <p className="text-sm">{description}</p>
    </div>
  );
}
