"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import StatsGrid from "@/components/stats-grid";
import CallCard from "@/components/call-card";
import type { Call, DashboardStats } from "@/lib/types";
import { RefreshCw, FileText, Loader2 } from "lucide-react";

async function loadDashboardData(): Promise<{
  stats: DashboardStats;
  calls: Call[];
}> {
  const [statsRes, callsRes] = await Promise.all([
    fetch("/api/stats"),
    fetch("/api/calls?limit=50"),
  ]);
  const statsData = await statsRes.json();
  const callsData = await callsRes.json();
  return { stats: statsData, calls: callsData.calls ?? [] };
}

export default function ManagerDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalCallsToday: 0,
    targetCalls: 200,
    callsRemaining: 200,
    appointmentsToday: 0,
    recentBuyerFlags: 0,
  });
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await loadDashboardData();
      setStats(data.stats);
      setCalls(data.calls);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      loadDashboardData()
        .then((data) => {
          setStats(data.stats);
          setCalls(data.calls);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const generateWeeklyReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_name: "Jea" }),
      });
      const data = await res.json();
      if (data.report_content) {
        setReportContent(data.report_content);
      } else if (data.error) {
        setReportContent(`Error: ${data.error}`);
      }
    } catch {
      setReportContent("Failed to generate report. Please try again.");
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Manager Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Real-time call intelligence overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={generateWeeklyReport}
            disabled={generatingReport}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {generatingReport ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Weekly Report
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsGrid stats={stats} />

      {/* Weekly Report Modal */}
      {reportContent && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Weekly Coaching Report — Jea
            </h3>
            <button
              onClick={() => setReportContent(null)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">
            {reportContent}
          </div>
        </div>
      )}

      {/* Live Call Feed */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Live Call Feed
        </h3>
        {calls.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">
              No calls yet. Calls will appear here in real time as Quo sends
              webhooks.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {calls.map((call) => (
              <CallCard key={call.id} call={call} showCoaching />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
