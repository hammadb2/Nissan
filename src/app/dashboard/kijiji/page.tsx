"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Users,
  Package,
  MessageSquare,
  Send,
  Plus,
  Copy,
  CheckCircle,

  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  Car,
} from "lucide-react";
import type {
  KijijiAccount,
  KijijiListingWithAccount,
  KijijiInquiryWithDetails,
  KijijiStats,
  AutoTraderVehicle,
} from "@/lib/types";

type Tab = "overview" | "inventory" | "listings" | "inquiries" | "accounts";

export default function KijijiDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<KijijiStats | null>(null);
  const [accounts, setAccounts] = useState<KijijiAccount[]>([]);
  const [listings, setListings] = useState<KijijiListingWithAccount[]>([]);
  const [inquiries, setInquiries] = useState<KijijiInquiryWithDetails[]>([]);
  const [inventory, setInventory] = useState<(AutoTraderVehicle & { kijiji_title: string; kijiji_description: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedListing, setExpandedListing] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/kijiji/stats");
    const data = await res.json();
    setStats(data);
  }, []);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/kijiji/accounts");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
  }, []);

  const fetchListings = useCallback(async () => {
    const res = await fetch("/api/kijiji/listings");
    const data = await res.json();
    setListings(data.listings ?? []);
  }, []);

  const fetchInquiries = useCallback(async () => {
    const res = await fetch("/api/kijiji/inquiries");
    const data = await res.json();
    setInquiries(data.inquiries ?? []);
  }, []);

  const fetchInventory = useCallback(async () => {
    const res = await fetch("/api/kijiji/inventory");
    const data = await res.json();
    setInventory(data.vehicles ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await Promise.all([fetchStats(), fetchAccounts(), fetchListings(), fetchInquiries()]);
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [fetchStats, fetchAccounts, fetchListings, fetchInquiries]);

  async function seedAccounts() {
    setActionLoading("seed");
    await fetch("/api/kijiji/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed_all: true }),
    });
    await fetchAccounts();
    await fetchStats();
    setActionLoading(null);
  }

  async function autoAssign() {
    setActionLoading("assign");
    await fetch("/api/kijiji/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_assign: true }),
    });
    await fetchListings();
    await fetchStats();
    setActionLoading(null);
  }

  async function postAllDrafts() {
    setActionLoading("post_all");
    await fetch("/api/kijiji/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_all_drafts: true }),
    });
    await fetchListings();
    await fetchStats();
    setActionLoading(null);
  }

  async function postSingle(listingId: string) {
    setActionLoading(listingId);
    await fetch("/api/kijiji/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId }),
    });
    await fetchListings();
    await fetchStats();
    setActionLoading(null);
  }

  async function updateListingStatus(id: string, action: string) {
    setActionLoading(id);
    await fetch("/api/kijiji/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await fetchListings();
    await fetchStats();
    setActionLoading(null);
  }

  async function replyToInquiry(inquiryId: string) {
    const message = replyText[inquiryId];
    if (!message) return;
    setActionLoading(inquiryId);
    await fetch("/api/kijiji/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: inquiryId, reply_message: message }),
    });
    setReplyText((prev) => ({ ...prev, [inquiryId]: "" }));
    await fetchInquiries();
    await fetchStats();
    setActionLoading(null);
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "overview", label: "Overview", icon: Package },
    { id: "inventory", label: "AutoTrader Inventory", icon: Car },
    { id: "listings", label: "Kijiji Listings", icon: ExternalLink },
    { id: "inquiries", label: "Inquiries", icon: MessageSquare },
    { id: "accounts", label: "Accounts", icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kijiji Manager</h1>
        <div className="flex gap-2">
          {accounts.length === 0 && (
            <button
              onClick={seedAccounts}
              disabled={actionLoading === "seed"}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              <Plus size={14} />
              {actionLoading === "seed" ? "Creating..." : "Seed 50 Accounts"}
            </button>
          )}
          <button
            onClick={autoAssign}
            disabled={actionLoading === "assign"}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={actionLoading === "assign" ? "animate-spin" : ""} />
            {actionLoading === "assign" ? "Assigning..." : "Auto-Assign Inventory"}
          </button>
          <button
            onClick={postAllDrafts}
            disabled={actionLoading === "post_all"}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <Send size={14} />
            {actionLoading === "post_all" ? "Posting..." : "Post All Drafts"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                if (t.id === "inventory" && inventory.length === 0) fetchInventory();
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Accounts" value={stats.active_accounts} sub={`${stats.total_accounts} total`} color="purple" />
            <StatCard label="Posted" value={stats.posted_listings} sub={`${stats.draft_listings} drafts`} color="green" />
            <StatCard label="Total Listings" value={stats.total_listings} color="blue" />
            <StatCard label="Inquiries Today" value={stats.inquiries_today} sub={`${stats.unreplied_inquiries} unreplied`} color="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <ActionButton
                  label="1. Seed Employee Accounts"
                  description="Create all 50 Kijiji accounts from employee list"
                  onClick={seedAccounts}
                  loading={actionLoading === "seed"}
                  disabled={accounts.length > 0}
                  done={accounts.length > 0}
                />
                <ActionButton
                  label="2. Scrape & Assign Inventory"
                  description="Pull vehicles from AutoTrader and distribute across accounts"
                  onClick={autoAssign}
                  loading={actionLoading === "assign"}
                />
                <ActionButton
                  label="3. Post All Drafts to Kijiji"
                  description="Submit all draft listings via Kijiji API"
                  onClick={postAllDrafts}
                  loading={actionLoading === "post_all"}
                  disabled={listings.filter((l) => l.kijiji_status === "draft").length === 0}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Account Distribution</h3>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {accounts.slice(0, 15).map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-gray-700">{acc.employee_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{acc.listings_count} listings</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        acc.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {acc.status}
                      </span>
                    </div>
                  </div>
                ))}
                {accounts.length > 15 && (
                  <p className="text-xs text-gray-400 pt-1">
                    + {accounts.length - 15} more accounts
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Tab */}
      {tab === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {inventory.length} vehicles from AutoTrader (South Trail Nissan)
            </p>
            <button
              onClick={fetchInventory}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          <div className="grid gap-3">
            {inventory.map((v, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{v.title}</h3>
                    <div className="flex gap-3 mt-1 text-sm text-gray-500">
                      {v.price && <span>${v.price.toLocaleString()}</span>}
                      {v.mileage && <span>{v.mileage.toLocaleString()} km</span>}
                      {v.transmission && <span>{v.transmission}</span>}
                      {v.fuel_type && <span>{v.fuel_type}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(v.kijiji_title, `title-${idx}`)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                    >
                      {copiedId === `title-${idx}` ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
                      Title
                    </button>
                    <button
                      onClick={() => copyToClipboard(v.kijiji_description, `desc-${idx}`)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                    >
                      {copiedId === `desc-${idx}` ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
                      Description
                    </button>
                  </div>
                </div>
                {v.features.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {v.features.slice(0, 6).map((f, fi) => (
                      <span key={fi} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                        {f.length > 30 ? f.slice(0, 30) + "..." : f}
                      </span>
                    ))}
                    {v.features.length > 6 && (
                      <span className="px-2 py-0.5 text-gray-400 text-xs">
                        +{v.features.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Listings Tab */}
      {tab === "listings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                {listings.filter((l) => l.kijiji_status === "draft").length} Drafts
              </span>
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                {listings.filter((l) => l.kijiji_status === "posted").length} Posted
              </span>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                {listings.filter((l) => l.kijiji_status === "sold").length} Sold
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {listings.map((listing) => (
              <div key={listing.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedListing(expandedListing === listing.id ? null : listing.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      listing.kijiji_status === "posted" ? "bg-green-100 text-green-700"
                      : listing.kijiji_status === "draft" ? "bg-gray-100 text-gray-700"
                      : listing.kijiji_status === "sold" ? "bg-blue-100 text-blue-700"
                      : "bg-red-100 text-red-700"
                    }`}>
                      {listing.kijiji_status}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{listing.kijiji_title}</p>
                      <p className="text-xs text-gray-500">
                        {listing.kijiji_accounts?.employee_name ?? "Unassigned"} · {listing.price ? `$${Number(listing.price).toLocaleString()}` : "Contact"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {listing.inquiry_count > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                        <MessageSquare size={10} />
                        {listing.inquiry_count}
                      </span>
                    )}
                    {listing.kijiji_status === "draft" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); postSingle(listing.id); }}
                        disabled={actionLoading === listing.id}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                      >
                        {actionLoading === listing.id ? "..." : "Post"}
                      </button>
                    )}
                    {listing.kijiji_status === "posted" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); updateListingStatus(listing.id, "mark_sold"); }}
                        disabled={actionLoading === listing.id}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                      >
                        Sold
                      </button>
                    )}
                    {expandedListing === listing.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {expandedListing === listing.id && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-400 text-xs">Kijiji Title</p>
                        <div className="flex items-center gap-1">
                          <p className="text-gray-700">{listing.kijiji_title}</p>
                          <button
                            onClick={() => copyToClipboard(listing.kijiji_title, `lt-${listing.id}`)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {copiedId === `lt-${listing.id}` ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Account</p>
                        <p className="text-gray-700">{listing.kijiji_accounts?.employee_name}</p>
                        <p className="text-gray-500 text-xs">{listing.kijiji_accounts?.employee_email}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-gray-400 text-xs mb-1">Kijiji Description</p>
                      <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {listing.kijiji_description}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(listing.kijiji_description, `ld-${listing.id}`)}
                        className="mt-1 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        {copiedId === `ld-${listing.id}` ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
                        Copy description
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {listing.kijiji_status === "posted" && (
                        <button
                          onClick={() => updateListingStatus(listing.id, "remove")}
                          disabled={actionLoading === listing.id}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100"
                        >
                          Remove from Kijiji
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inquiries Tab */}
      {tab === "inquiries" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {inquiries.filter((i) => !i.replied).length} unreplied of {inquiries.length} total
            </p>
            <button
              onClick={fetchInquiries}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {inquiries.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Mail size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No inquiries yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Inquiries will appear here when customers respond to Kijiji listings
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {inquiries.map((inquiry) => (
                <div key={inquiry.id} className={`bg-white rounded-xl border ${inquiry.replied ? "border-gray-200" : "border-amber-200"} p-4`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">
                          {inquiry.customer_name || "Unknown Customer"}
                        </p>
                        {!inquiry.replied && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-gray-500">
                        {inquiry.customer_email && <span>{inquiry.customer_email}</span>}
                        {inquiry.customer_phone && <span>{inquiry.customer_phone}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(inquiry.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {inquiry.kijiji_listings && (
                    <p className="mt-1 text-xs text-purple-600">
                      Re: {inquiry.kijiji_listings.kijiji_title}
                    </p>
                  )}

                  {inquiry.message && (
                    <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                      {inquiry.message}
                    </p>
                  )}

                  {inquiry.replied ? (
                    <div className="mt-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-500 mb-1">Replied:</p>
                      {inquiry.reply_message}
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        placeholder="Type your reply..."
                        value={replyText[inquiry.id] || ""}
                        onChange={(e) => setReplyText((prev) => ({ ...prev, [inquiry.id]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") replyToInquiry(inquiry.id); }}
                      />
                      <button
                        onClick={() => replyToInquiry(inquiry.id)}
                        disabled={actionLoading === inquiry.id || !replyText[inquiry.id]}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accounts Tab */}
      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {accounts.length} accounts ({accounts.filter((a) => a.status === "active").length} active)
            </p>
            {accounts.length === 0 && (
              <button
                onClick={seedAccounts}
                disabled={actionLoading === "seed"}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
              >
                <Plus size={14} />
                Seed All 50
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Email</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">Listings</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">Max</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 text-gray-900">{acc.employee_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{acc.employee_email}</td>
                    <td className="px-4 py-2.5 text-center">{acc.listings_count}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400">{acc.max_listings}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        acc.status === "active" ? "bg-green-100 text-green-700"
                        : acc.status === "suspended" ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                        {acc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    purple: "text-purple-600",
    green: "text-green-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[color] || "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ActionButton({
  label,
  description,
  onClick,
  loading,
  disabled,
  done,
}: {
  label: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  done?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
        done
          ? "border-green-200 bg-green-50"
          : disabled
            ? "border-gray-200 bg-gray-50 opacity-50"
            : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <div>
        <p className="font-medium text-sm text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {done ? (
        <CheckCircle size={16} className="text-green-500 shrink-0" />
      ) : loading ? (
        <RefreshCw size={16} className="text-gray-400 animate-spin shrink-0" />
      ) : (
        <ChevronDown size={16} className="text-gray-400 shrink-0 -rotate-90" />
      )}
    </button>
  );
}
