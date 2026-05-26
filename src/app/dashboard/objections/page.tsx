"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Search,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  XCircle,
  CheckCircle,
} from "lucide-react";

interface ObjectionHandler {
  id: string;
  category: string;
  objection: string;
  what_it_means: string | null;
  say_this: string;
  never_say: string | null;
  source: string;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Vehicle: "bg-blue-100 text-blue-800",
  Customer: "bg-purple-100 text-purple-800",
  Financial: "bg-green-100 text-green-800",
  Timing: "bg-amber-100 text-amber-800",
  Compliance: "bg-red-100 text-red-800",
  Other: "bg-gray-100 text-gray-800",
};

export default function ObjectionsPage() {
  const [objections, setObjections] = useState<ObjectionHandler[]>([]);
  const [grouped, setGrouped] = useState<Record<string, ObjectionHandler[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newObjection, setNewObjection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    handler: ObjectionHandler;
    source: string;
  } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchObjections = useCallback(async () => {
    const res = await fetch("/api/objections");
    const data = await res.json();
    setObjections(data.objections ?? []);
    setGrouped(data.grouped ?? {});
    setLoading(false);
    if (data.grouped) {
      setExpandedCategories(new Set(Object.keys(data.grouped)));
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch("/api/objections").catch(() => null);
      if (!active || !res) return;
      const data = await res.json();
      setObjections(data.objections ?? []);
      setGrouped(data.grouped ?? {});
      if (data.grouped) {
        setExpandedCategories(new Set(Object.keys(data.grouped as Record<string, unknown>)));
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  async function handleNewObjection(e: React.FormEvent) {
    e.preventDefault();
    if (!newObjection.trim()) return;

    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/objections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objection: newObjection }),
      });

      const data = await res.json();
      setResult({
        handler: data.handler,
        source: data.source,
      });

      if (data.source === "gpt" && data.saved) {
        fetchObjections();
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const filtered = search
    ? objections.filter(
        (o) =>
          o.objection.toLowerCase().includes(search.toLowerCase()) ||
          o.say_this.toLowerCase().includes(search.toLowerCase()) ||
          o.category.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Objection Handler</h1>

      {/* New Objection Input */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-blue-600" />
          <h2 className="font-semibold text-blue-900">
            Encounter a new objection?
          </h2>
        </div>
        <p className="text-sm text-blue-700 mb-3">
          Type what the customer said and get an instant response suggestion.
          New objections are saved automatically.
        </p>
        <form onSubmit={handleNewObjection} className="flex gap-2">
          <input
            type="text"
            value={newObjection}
            onChange={(e) => setNewObjection(e.target.value)}
            placeholder='e.g. "I just bought a car last month"'
            className="flex-1 px-4 py-2.5 border border-blue-200 rounded-lg text-sm bg-white"
          />
          <button
            type="submit"
            disabled={submitting || !newObjection.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            Get Response
          </button>
        </form>

        {/* GPT Result */}
        {result && (
          <div className="mt-4 bg-white border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              {result.source === "existing" ? (
                <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle size={12} />
                  Already in handbook
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  <Sparkles size={12} />
                  Generated by AI — saved
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                  Say This:
                </p>
                <p className="text-sm text-gray-800 bg-green-50 p-3 rounded-lg border border-green-200">
                  {result.handler.say_this}
                </p>
              </div>
              {result.handler.what_it_means && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    What It Means:
                  </p>
                  <p className="text-sm text-gray-600">
                    {result.handler.what_it_means}
                  </p>
                </div>
              )}
              {result.handler.never_say && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Never Say:
                  </p>
                  <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
                    {result.handler.never_say}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search objections..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
      </div>

      {/* Search Results */}
      {filtered && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700">
            Search Results ({filtered.length})
          </h2>
          {filtered.map((obj) => (
            <ObjectionCard key={obj.id} handler={obj} />
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">
              No objections match your search. Try typing the objection above to
              generate a new handler.
            </p>
          )}
        </div>
      )}

      {/* Categorized Objections */}
      {!filtered && (
        <div className="space-y-3">
          {Object.entries(grouped).map(([category, handlers]) => (
            <div
              key={category}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Other"]
                    }`}
                  >
                    {category}
                  </span>
                  <span className="text-sm text-gray-500">
                    {handlers.length} objection{handlers.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {expandedCategories.has(category) ? (
                  <ChevronUp size={16} className="text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-400" />
                )}
              </button>
              {expandedCategories.has(category) && (
                <div className="border-t border-gray-200 divide-y divide-gray-100">
                  {handlers.map((handler) => (
                    <ObjectionCard key={handler.id} handler={handler} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectionCard({ handler }: { handler: ObjectionHandler }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-5 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <span className="text-sm font-medium text-gray-800">
              &quot;{handler.objection}&quot;
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {handler.source === "gpt" && (
              <span className="text-xs text-blue-500">AI</span>
            )}
            {expanded ? (
              <ChevronUp size={14} className="text-gray-400" />
            ) : (
              <ChevronDown size={14} className="text-gray-400" />
            )}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 ml-6 space-y-3">
          {handler.what_it_means && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                What It Means
              </p>
              <p className="text-sm text-gray-600">{handler.what_it_means}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
              Say This
            </p>
            <p className="text-sm text-gray-800 bg-green-50 p-3 rounded-lg border border-green-200">
              {handler.say_this}
            </p>
          </div>
          {handler.never_say && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Never Say
              </p>
              <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200 flex items-start gap-2">
                <XCircle size={14} className="flex-shrink-0 mt-0.5" />
                {handler.never_say}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
