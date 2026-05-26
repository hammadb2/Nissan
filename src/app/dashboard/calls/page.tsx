"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  RefreshCw,
  Download,
  Play,
  Pause,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  X,
} from "lucide-react";
import type { CallRecordWithContact } from "@/lib/types";

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRecordWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    phase: string;
    message: string;
    totalCalls: number;
    newCalls: number;
    updatedCalls: number;
    skippedCalls: number;
    lastPhone?: string;
    lastDirection?: string;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<{
    status: string;
    totalCalls: number;
    newCalls: number;
    updatedCalls: number;
    skippedCalls: number;
    errors?: string[];
  } | null>(null);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<Record<string, HTMLAudioElement>>({});
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [limit, setLimit] = useState(50);

  const fetchCalls = useCallback(async () => {
    const res = await fetch(`/api/calls?limit=${limit}`);
    const data = await res.json();
    setCalls(data.calls ?? []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    let cancelled = false;
    async function refreshLoop() {
      while (!cancelled) {
        await fetchCalls();
        if (!cancelled) await new Promise((r) => setTimeout(r, 5_000));
      }
    }
    refreshLoop();
    return () => { cancelled = true; };
  }, [fetchCalls]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress({ phase: "starting", message: "Starting sync...", totalCalls: 0, newCalls: 0, updatedCalls: 0, skippedCalls: 0 });

    try {
      const body: Record<string, string> = {};
      if (dateFilter) {
        body.createdAfter = new Date(dateFilter).toISOString();
      }
      const res = await fetch("/api/quo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let lastRefresh = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ") && currentEvent) {
            const data = JSON.parse(line.slice(6));

            if (currentEvent === "progress") {
              setSyncProgress({
                phase: data.phase,
                message: data.message,
                totalCalls: data.totalCalls ?? 0,
                newCalls: data.newCalls ?? 0,
                updatedCalls: data.updatedCalls ?? 0,
                skippedCalls: data.skippedCalls ?? 0,
              });
            } else if (currentEvent === "call_synced") {
              setSyncProgress({
                phase: "syncing",
                message: `${data.isNew ? "New" : "Updated"}: ${data.phone}`,
                totalCalls: data.totalCalls,
                newCalls: data.newCalls,
                updatedCalls: data.updatedCalls,
                skippedCalls: data.skippedCalls,
                lastPhone: data.phone,
                lastDirection: data.direction,
              });
              const now = Date.now();
              if (now - lastRefresh > 3000) {
                lastRefresh = now;
                fetchCalls();
              }
            } else if (currentEvent === "complete") {
              setSyncResult({
                status: "complete",
                totalCalls: data.totalCalls,
                newCalls: data.newCalls,
                updatedCalls: data.updatedCalls,
                skippedCalls: data.skippedCalls,
                errors: data.errors,
              });
            } else if (currentEvent === "error") {
              setSyncResult({
                status: "error",
                totalCalls: 0,
                newCalls: 0,
                updatedCalls: 0,
                skippedCalls: 0,
                errors: [data.message],
              });
            }
            currentEvent = "";
          }
        }
      }

      await fetchCalls();
    } catch (err) {
      setSyncResult({
        status: "error",
        totalCalls: 0,
        newCalls: 0,
        updatedCalls: 0,
        skippedCalls: 0,
        errors: [err instanceof Error ? err.message : "Sync failed"],
      });
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  function toggleCallSelection(callId: string) {
    setSelectedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  }

  function selectAll() {
    if (selectedCalls.size === filteredCalls.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(filteredCalls.map((c) => c.id)));
    }
  }

  async function handleExport(format: "json" | "xlsx", callIds?: string[]) {
    setExporting(true);
    try {
      const body: Record<string, unknown> = {
        format,
        includeTranscripts: true,
        includeRecordings: true,
      };
      if (callIds && callIds.length > 0) {
        body.callIds = callIds;
      }

      const res = await fetch("/api/calls/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (format === "xlsx") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `calls-export-${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `calls-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  function togglePlayRecording(callId: string, recordingUrl: string) {
    if (playingCallId === callId) {
      audioElements[callId]?.pause();
      setPlayingCallId(null);
      return;
    }

    // Pause any currently playing
    if (playingCallId && audioElements[playingCallId]) {
      audioElements[playingCallId].pause();
    }

    let audio = audioElements[callId];
    if (!audio) {
      audio = new Audio(recordingUrl);
      audio.addEventListener("ended", () => setPlayingCallId(null));
      setAudioElements((prev) => ({ ...prev, [callId]: audio }));
    }
    audio.play();
    setPlayingCallId(callId);
  }

  const filteredCalls = calls.filter((call) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      const isPhoneSearch = qDigits.length >= 4;
      const contactName = call.contacts
        ? `${call.contacts.first_name} ${call.contacts.last_name}`.toLowerCase()
        : "";
      const phone = call.contacts?.phone ?? "";
      const fromNum = call.from_number ?? "";
      const toNum = call.to_number ?? "";
      const transcript = call.transcript?.toLowerCase() ?? "";
      const summary = (call.gpt_summary ?? call.quo_summary ?? "").toLowerCase();

      const phoneDigits = phone.replace(/\D/g, "");
      const fromDigits = fromNum.replace(/\D/g, "");
      const toDigits = toNum.replace(/\D/g, "");

      const textMatch =
        contactName.includes(q) ||
        transcript.includes(q) ||
        summary.includes(q);

      const phoneMatch = isPhoneSearch && (
        phoneDigits.includes(qDigits) ||
        fromDigits.includes(qDigits) ||
        toDigits.includes(qDigits)
      );

      if (!textMatch && !phoneMatch) {
        return false;
      }
    }
    if (dateFilter) {
      const callDate = call.called_at?.split("T")[0] ?? "";
      if (callDate < dateFilter) return false;
    }
    return true;
  });

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
          <h1 className="text-2xl font-bold text-gray-900">Call History</h1>
          <p className="text-sm text-gray-500 mt-1">
            {calls.length} calls loaded
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync from Quo"}
          </button>
          {selectedCalls.size > 0 && (
            <>
              <button
                onClick={() => handleExport("xlsx", [...selectedCalls])}
                disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                <Download size={16} />
                Export {selectedCalls.size} as XLSX
              </button>
              <button
                onClick={() => handleExport("json", [...selectedCalls])}
                disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                <Download size={16} />
                JSON
              </button>
            </>
          )}
          <button
            onClick={() => handleExport("xlsx")}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Download size={16} />
            Export All
          </button>
        </div>
      </div>

      {/* Live Sync Progress */}
      {syncProgress && !syncResult && (
        <div className="rounded-lg p-4 bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={16} className="text-blue-600 animate-spin" />
            <span className="font-medium text-blue-900">Syncing from Quo</span>
          </div>
          <p className="text-sm text-blue-800 mb-2">{syncProgress.message}</p>
          {syncProgress.totalCalls > 0 && (
            <div className="flex gap-4 text-xs text-blue-700">
              <span>{syncProgress.totalCalls} found</span>
              <span className="font-medium text-green-700">{syncProgress.newCalls} new</span>
              <span className="font-medium text-yellow-700">{syncProgress.updatedCalls} updated</span>
              <span className="text-gray-500">{syncProgress.skippedCalls} skipped</span>
            </div>
          )}
        </div>
      )}

      {/* Sync Result Banner */}
      {syncResult && (
        <div
          className={`rounded-lg p-4 ${
            syncResult.status === "complete"
              ? "bg-green-50 border border-green-200"
              : "bg-red-50 border border-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {syncResult.status === "complete" ? (
              <CheckCircle size={18} className="text-green-600" />
            ) : (
              <AlertCircle size={18} className="text-red-600" />
            )}
            <span className="font-medium">
              {syncResult.status === "complete" ? "Sync Complete" : "Sync Error"}
            </span>
          </div>
          {syncResult.status === "complete" && (
            <p className="text-sm mt-1 text-gray-600">
              Found {syncResult.totalCalls} calls — {syncResult.newCalls} new,{" "}
              {syncResult.updatedCalls} updated, {syncResult.skippedCalls} already synced.
              Daily stats have been refreshed.
            </p>
          )}
          {syncResult.errors && syncResult.errors.length > 0 && (
            <div className="mt-2 text-sm text-red-700">
              {syncResult.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          <button
            onClick={() => setSyncResult(null)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search calls, contacts, transcripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
        >
          <option value={50}>50 calls</option>
          <option value={100}>100 calls</option>
          <option value={200}>200 calls</option>
          <option value={500}>500 calls</option>
        </select>
      </div>

      {/* Select All */}
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedCalls.size === filteredCalls.length && filteredCalls.length > 0}
            onChange={selectAll}
            className="rounded"
          />
          <span className="text-gray-600">
            Select all ({filteredCalls.length})
          </span>
        </label>
        {selectedCalls.size > 0 && (
          <span className="text-blue-600 font-medium">
            {selectedCalls.size} selected
          </span>
        )}
      </div>

      {/* Call List */}
      <div className="space-y-2">
        {filteredCalls.map((call) => {
          const isExpanded = expandedCall === call.id;
          const contact = call.contacts;
          const externalNumber = call.direction === "outgoing"
            ? (call.to_number ?? call.from_number)
            : (call.from_number ?? call.to_number);
          const contactName = contact
            ? `${contact.first_name} ${contact.last_name}`
            : (externalNumber || "Unknown Contact");
          const callDate = call.called_at
            ? new Date(call.called_at).toLocaleString("en-US", {
                timeZone: "America/Edmonton",
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              }) + " MST"
            : "";
          const duration = call.duration_seconds
            ? `${Math.floor(call.duration_seconds / 60)}:${String(
                call.duration_seconds % 60
              ).padStart(2, "0")}`
            : "—";

          return (
            <div
              key={call.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              {/* Call Row */}
              <div className="flex items-center gap-3 p-4">
                <input
                  type="checkbox"
                  checked={selectedCalls.has(call.id)}
                  onChange={() => toggleCallSelection(call.id)}
                  className="rounded shrink-0"
                />
                <button
                  onClick={() => setExpandedCall(isExpanded ? null : call.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <div className="shrink-0 w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center">
                    <Phone size={16} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">
                        {contactName}
                      </span>
                      {call.outcome && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            OUTCOME_COLORS[call.outcome] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {call.outcome.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span>{callDate}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {duration}
                      </span>
                      {contact?.phone && <span>{contact.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {call.transcript && (
                      <span title="Has transcript"><FileText size={14} className="text-green-500" /></span>
                    )}
                    {call.recording_url && (
                      <span title="Has recording"><Play size={14} className="text-purple-500" /></span>
                    )}
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-400" />
                    )}
                  </div>
                </button>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
                  {/* Summary */}
                  {(call.gpt_summary || call.quo_summary) && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Summary
                      </h4>
                      <p className="text-sm text-gray-700">
                        {call.gpt_summary ?? call.quo_summary}
                      </p>
                    </div>
                  )}

                  {/* CRM Notes */}
                  {call.crm_notes && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        CRM Notes
                      </h4>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {call.crm_notes}
                      </p>
                    </div>
                  )}

                  {/* Coaching */}
                  {(call.what_went_well || call.coaching_tip) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {call.what_went_well && (
                        <div className="bg-green-50 p-3 rounded-lg">
                          <h4 className="text-xs font-semibold text-green-700 uppercase mb-1">
                            What Went Well
                          </h4>
                          <p className="text-sm text-green-800">
                            {call.what_went_well}
                          </p>
                        </div>
                      )}
                      {call.coaching_tip && (
                        <div className="bg-amber-50 p-3 rounded-lg">
                          <h4 className="text-xs font-semibold text-amber-700 uppercase mb-1">
                            Coaching Tip
                          </h4>
                          <p className="text-sm text-amber-800">
                            {call.coaching_tip}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recording Player */}
                  {call.recording_url && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Recording
                      </h4>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            togglePlayRecording(call.id, call.recording_url!)
                          }
                          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                        >
                          {playingCallId === call.id ? (
                            <>
                              <Pause size={14} /> Pause
                            </>
                          ) : (
                            <>
                              <Play size={14} /> Play Recording
                            </>
                          )}
                        </button>
                        <a
                          href={call.recording_url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                        >
                          <Download size={14} /> Download
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  {call.transcript && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Transcript
                      </h4>
                      <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto">
                        {call.transcript.split("\n").map((line, i) => {
                          const isAgent = line.startsWith("Agent:");
                          return (
                            <p
                              key={i}
                              className={`text-sm mb-1 ${
                                isAgent
                                  ? "text-blue-700 font-medium"
                                  : "text-gray-600"
                              }`}
                            >
                              {line}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Export Single */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => handleExport("xlsx", [call.id])}
                      disabled={exporting}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <Download size={14} /> Export XLSX
                    </button>
                    <button
                      onClick={() => handleExport("json", [call.id])}
                      disabled={exporting}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <Download size={14} /> Export JSON
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredCalls.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Phone size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium">No calls found</p>
            <p className="text-sm mt-1">
              {calls.length === 0
                ? 'Click "Sync from Quo" to import your call history.'
                : "Try adjusting your search or filters."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
