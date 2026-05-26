"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Target,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Star,
  XCircle,
  CheckCircle,
} from "lucide-react";

interface ScriptScore {
  score: number;
  note: string;
}

interface CoachingData {
  overall_grade: string;
  score: number;
  summary: string;
  doing_well: string[];
  needs_improvement: string[];
  sop_violations: string[];
  script_adherence: {
    opening: ScriptScore;
    bridge: ScriptScore;
    value_prop: ScriptScore;
    close: ScriptScore;
    silence_after_close: ScriptScore;
  };
  top_3_actions: string[];
  objection_handling_score: number;
  objection_notes: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-600 bg-green-50 border-green-200",
  B: "text-blue-600 bg-blue-50 border-blue-200",
  C: "text-amber-600 bg-amber-50 border-amber-200",
  D: "text-orange-600 bg-orange-50 border-orange-200",
  F: "text-red-600 bg-red-50 border-red-200",
};

export default function CoachingPage() {
  const [coaching, setCoaching] = useState<CoachingData | null>(null);
  const [callCount, setCallCount] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCoaching = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/coaching/analyze");
      const data = await res.json();
      setCoaching(data.coaching ?? null);
      setCallCount(data.call_count ?? 0);
      setOutcomes(data.outcomes ?? {});
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch("/api/coaching/analyze").catch(() => null);
      if (!active || !res) return;
      const data = await res.json();
      setCoaching(data.coaching ?? null);
      setCallCount(data.call_count ?? 0);
      setOutcomes(data.outcomes ?? {});
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!coaching) {
    return (
      <div className="text-center py-16 text-gray-500">
        <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No coaching data yet</p>
        <p className="text-sm mt-1">Coaching analysis will appear once calls are processed.</p>
      </div>
    );
  }

  const gradeColor = GRADE_COLORS[coaching.overall_grade] ?? GRADE_COLORS["C"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Coaching</h1>
        <button
          onClick={fetchCoaching}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh Analysis
        </button>
      </div>

      {/* Grade + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className={`rounded-xl border-2 p-6 text-center ${gradeColor}`}>
          <p className="text-6xl font-bold">{coaching.overall_grade}</p>
          <p className="text-sm font-medium mt-1">Overall Grade</p>
          <p className="text-3xl font-bold mt-2">{coaching.score}/100</p>
        </div>
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 font-medium mb-2">
            Week Summary ({callCount} calls analyzed)
          </p>
          <p className="text-gray-800">{coaching.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(outcomes).map(([key, val]) => (
              <span
                key={key}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
              >
                {key}: {val}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Top 3 Actions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target size={18} className="text-blue-600" />
          <h2 className="font-semibold text-blue-900">Top 3 Actions This Week</h2>
        </div>
        <ol className="space-y-2">
          {coaching.top_3_actions.map((action, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <span className="text-sm text-blue-900">{action}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Script Adherence */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-lg mb-4">Script Adherence</h2>
        <div className="space-y-3">
          {Object.entries(coaching.script_adherence).map(([key, val]) => {
            const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const pct = (val.score / 10) * 100;
            const color = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
            return (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{label}</span>
                  <span className="text-gray-500">{val.score}/10</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                  <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-500">{val.note}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Doing Well + Needs Improvement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={18} className="text-green-600" />
            <h2 className="font-semibold text-green-900">Doing Well</h2>
          </div>
          <ul className="space-y-2">
            {coaching.doing_well.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Star size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={18} className="text-amber-600" />
            <h2 className="font-semibold text-amber-900">Needs Improvement</h2>
          </div>
          <ul className="space-y-2">
            {coaching.needs_improvement.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* SOP Violations */}
      {coaching.sop_violations.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={18} className="text-red-600" />
            <h2 className="font-semibold text-red-900">SOP Violations</h2>
          </div>
          <ul className="space-y-2">
            {coaching.sop_violations.map((item, i) => (
              <li key={i} className="text-sm text-red-800 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">-</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Objection Handling */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-lg mb-2">Objection Handling</h2>
        <div className="flex items-center gap-4 mb-3">
          <div className="text-2xl font-bold text-gray-800">
            {coaching.objection_handling_score}/10
          </div>
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full ${
                coaching.objection_handling_score >= 7
                  ? "bg-green-500"
                  : coaching.objection_handling_score >= 5
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${(coaching.objection_handling_score / 10) * 100}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-gray-600">{coaching.objection_notes}</p>
      </div>
    </div>
  );
}
