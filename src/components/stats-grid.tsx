"use client";

import {
  Phone,
  Target,
  CalendarCheck,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import type { DashboardStats } from "@/lib/types";

export default function StatsGrid({ stats }: { stats: DashboardStats }) {
  const progressPercent = stats.targetCalls > 0
    ? Math.min(100, Math.round((stats.totalCallsToday / stats.targetCalls) * 100))
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Calls Made */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Calls Today
          </span>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {stats.totalCallsToday}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          of {stats.targetCalls} target
        </p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Progress
          </span>
        </div>
        <p className="text-3xl font-bold text-gray-900">{progressPercent}%</p>
        <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progressPercent >= 100
                ? "bg-green-500"
                : progressPercent >= 50
                  ? "bg-blue-500"
                  : "bg-amber-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Calls Remaining */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Remaining
          </span>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {stats.callsRemaining}
        </p>
        <p className="text-xs text-gray-400 mt-1">calls to target</p>
      </div>

      {/* Appointments */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <CalendarCheck className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Appointments
          </span>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {stats.appointmentsToday}
        </p>
        <p className="text-xs text-gray-400 mt-1">booked today</p>
      </div>

      {/* Recent Buyer Flags */}
      <div
        className={`rounded-xl border p-4 ${
          stats.recentBuyerFlags > 0
            ? "bg-red-50 border-red-200"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle
            className={`w-4 h-4 ${
              stats.recentBuyerFlags > 0 ? "text-red-400" : "text-gray-400"
            }`}
          />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Buyer Flags
          </span>
        </div>
        <p
          className={`text-3xl font-bold ${
            stats.recentBuyerFlags > 0 ? "text-red-600" : "text-gray-900"
          }`}
        >
          {stats.recentBuyerFlags}
        </p>
        <p className="text-xs text-gray-400 mt-1">recent purchases</p>
      </div>
    </div>
  );
}
