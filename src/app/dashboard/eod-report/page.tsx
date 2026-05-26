"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Phone,
  Calendar,
  Flame,
  Voicemail,
  ThumbsDown,
  Ban,
  RefreshCw,
  FileSpreadsheet,
  Clock,
  PhoneOff,
  PhoneMissed,
  AlertTriangle,
} from "lucide-react";

interface EodStats {
  calls_made: number;
  appointments_booked: number;
  interested_not_booked: number;
  voicemails: number;
  not_interested: number;
  dnc: number;
  callbacks: number;
  no_answers: number;
  wrong_numbers: number;
  recent_buyers: number;
}

interface EodCallSummary {
  id: string;
  called_at: string;
  duration_seconds: number | null;
  outcome: string | null;
  gpt_summary: string | null;
  contact: {
    first_name: string;
    last_name: string;
    phone: string;
  } | null;
}

interface EodReportData {
  date: string;
  stats: EodStats;
  ai_notes: string | null;
  calls: EodCallSummary[];
}

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

export default function EodReportPage() {
  const [report, setReport] = useState<EodReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  });

  const fetchReport = useCallback(async (date: string) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/eod-report?date=${date}`);
      const data = await res.json();
      setReport(data);
    } catch {
      /* ignore */
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch(`/api/eod-report?date=${selectedDate}`).catch(() => null);
      if (!active || !res) return;
      const data = await res.json();
      setReport(data);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [selectedDate]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/eod-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });

      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jea-eod-report-${selectedDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    }
    setExporting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const stats = report?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">
          End of Day Report — Jea
        </h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={() => fetchReport(selectedDate)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !stats || stats.calls_made === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {exporting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Export XLSX
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            icon={<Phone size={18} />}
            label="Calls Made"
            value={stats.calls_made}
            sub="/ 200"
            color="text-gray-900"
          />
          <StatCard
            icon={<Calendar size={18} />}
            label="Appointments Booked"
            value={stats.appointments_booked}
            color="text-green-600"
          />
          <StatCard
            icon={<Flame size={18} />}
            label="Interested (Not Booked)"
            value={stats.interested_not_booked}
            color="text-orange-600"
          />
          <StatCard
            icon={<Voicemail size={18} />}
            label="Voicemails"
            value={stats.voicemails}
            color="text-gray-600"
          />
          <StatCard
            icon={<ThumbsDown size={18} />}
            label="Not Interested"
            value={stats.not_interested}
            color="text-red-600"
          />
          <StatCard
            icon={<Ban size={18} />}
            label="DNC"
            value={stats.dnc}
            color="text-red-700"
          />
          <StatCard
            icon={<Clock size={18} />}
            label="Callbacks"
            value={stats.callbacks}
            color="text-blue-600"
          />
          <StatCard
            icon={<PhoneMissed size={18} />}
            label="No Answers"
            value={stats.no_answers}
            color="text-gray-500"
          />
          <StatCard
            icon={<PhoneOff size={18} />}
            label="Wrong Numbers"
            value={stats.wrong_numbers}
            color="text-gray-500"
          />
          <StatCard
            icon={<AlertTriangle size={18} />}
            label="Recent Buyers"
            value={stats.recent_buyers}
            color="text-yellow-600"
          />
        </div>
      )}

      {/* Progress Bar */}
      {stats && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Daily Progress
            </span>
            <span className="text-sm text-gray-500">
              {stats.calls_made} / 200 calls
            </span>
          </div>
          <div className="bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                stats.calls_made >= 200
                  ? "bg-green-500"
                  : stats.calls_made >= 140
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{
                width: `${Math.min(100, (stats.calls_made / 200) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {Math.round((stats.calls_made / 200) * 100)}% of daily target
          </p>
        </div>
      )}

      {/* AI Performance Notes */}
      {report?.ai_notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet size={20} className="text-blue-600" />
            <h2 className="font-semibold text-lg text-gray-900">
              AI Performance Analysis
            </h2>
          </div>
          <div className="prose prose-sm max-w-none text-gray-700">
            {report.ai_notes.split("\n").map((line, i) => {
              if (line.startsWith("## ")) {
                return (
                  <h3
                    key={i}
                    className="text-base font-semibold text-gray-900 mt-4 mb-2"
                  >
                    {line.replace("## ", "")}
                  </h3>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <p key={i} className="ml-4 mb-1">
                    • {line.replace("- ", "")}
                  </p>
                );
              }
              if (line.trim() === "") {
                return <div key={i} className="h-2" />;
              }
              return (
                <p key={i} className="mb-1">
                  {line}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Call Log */}
      {report?.calls && report.calls.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Call Log ({report.calls.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {report.calls.map((call) => (
              <div key={call.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {call.contact
                        ? `${call.contact.first_name} ${call.contact.last_name}`
                        : "Unknown"}
                    </span>
                    {call.outcome && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                          OUTCOME_COLORS[call.outcome] ?? "bg-gray-100"
                        }`}
                      >
                        {call.outcome.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {call.duration_seconds !== null && (
                      <span>
                        {Math.floor(call.duration_seconds / 60)}:
                        {String(call.duration_seconds % 60).padStart(2, "0")}
                      </span>
                    )}
                    <span>
                      {new Date(call.called_at).toLocaleTimeString("en-CA", {
                        timeZone: "America/Edmonton",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>
                </div>
                {call.gpt_summary && (
                  <p className="text-sm text-gray-600 mt-1">
                    {call.gpt_summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data State */}
      {stats && stats.calls_made === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Phone size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No calls recorded</p>
          <p className="text-sm mt-1">
            Calls will appear here once Jea starts making calls for the day.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-gray-400">{icon}</span>
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>
        {value}
        {sub && (
          <span className="text-sm font-normal text-gray-400">{sub}</span>
        )}
      </p>
    </div>
  );
}
