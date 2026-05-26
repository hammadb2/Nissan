"use client";

import { useState, useEffect } from "react";
import { Search, ChevronDown, ChevronUp, Phone, AlertTriangle } from "lucide-react";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [interestFilter, setInterestFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (interestFilter) params.set("interest", interestFilter);

      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      if (!cancelled) {
        setContacts(data.contacts ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [page, search, statusFilter, interestFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Contacts ({total})</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="dnc">DNC</option>
          <option value="recent_buyer">Recent Buyer</option>
          <option value="appointment_booked">Appointment Booked</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={interestFilter}
          onChange={(e) => { setInterestFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Interest</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
          <option value="not_interested">Not Interested</option>
        </select>
      </div>

      {/* Contact List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => {
            const isExpanded = expandedId === c.id;
            const isDNC = c.do_not_call_until && new Date(c.do_not_call_until) > new Date();

            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="p-4 cursor-pointer flex items-center justify-between"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.first_name} {c.last_name}</span>
                      {c.interest_level && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          c.interest_level === "hot" ? "bg-orange-100 text-orange-700" :
                          c.interest_level === "warm" ? "bg-yellow-100 text-yellow-700" :
                          c.interest_level === "cold" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {c.interest_level}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        c.status === "active" ? "bg-green-100 text-green-700" :
                        c.status === "dnc" ? "bg-red-100 text-red-700" :
                        c.status === "recent_buyer" ? "bg-yellow-100 text-yellow-700" :
                        c.status === "appointment_booked" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {c.status.replace("_", " ")}
                      </span>
                      {isDNC && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle size={12} /> DNC until {new Date(c.do_not_call_until!).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      <Phone size={12} className="inline mr-1" />
                      {c.phone}
                      {c.vehicle_year && ` · ${c.vehicle_year} ${c.vehicle_make ?? ""} ${c.vehicle_model ?? ""}`}
                      {c.call_count > 0 && ` · ${c.call_count} calls`}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 text-sm space-y-2">
                    {c.email && <div><span className="text-gray-500">Email:</span> {c.email}</div>}
                    {c.vehicle_ownership_duration && <div><span className="text-gray-500">Ownership:</span> {c.vehicle_ownership_duration}</div>}
                    {c.trade_in_available !== null && <div><span className="text-gray-500">Trade-in:</span> {c.trade_in_available ? "Yes" : "No"}</div>}
                    {c.monthly_budget && <div><span className="text-gray-500">Budget:</span> {c.monthly_budget}</div>}
                    {c.next_action && <div><span className="text-gray-500">Next:</span> {c.next_action.replace("_", " ")}{c.next_action_at ? ` — ${new Date(c.next_action_at).toLocaleDateString()}` : ""}</div>}
                    {c.notes && <div><span className="text-gray-500">Notes:</span> {c.notes}</div>}
                    {c.last_called_at && <div><span className="text-gray-500">Last called:</span> {new Date(c.last_called_at).toLocaleString()}</div>}
                    {c.import_batch && <div className="text-xs text-gray-400">Import batch: {c.import_batch}</div>}
                  </div>
                )}
              </div>
            );
          })}

          {contacts.length === 0 && (
            <p className="text-center text-gray-400 py-8">No contacts found.</p>
          )}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 50)}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
