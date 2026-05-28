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
  Image as ImageIcon,
  Shield,
  MapPin,
  Phone,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  KijijiAccount,
  KijijiListingWithAccount,
  KijijiInquiryWithDetails,
  KijijiStats,
} from "@/lib/types";

type Tab = "overview" | "inventory" | "listings" | "inquiries" | "accounts";

export default function KijijiDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<KijijiStats | null>(null);
  const [accounts, setAccounts] = useState<KijijiAccount[]>([]);
  const [listings, setListings] = useState<KijijiListingWithAccount[]>([]);
  const [inquiries, setInquiries] = useState<KijijiInquiryWithDetails[]>([]);
  const [inventory, setInventory] = useState<KijijiListingWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedListing, setExpandedListing] = useState<string | null>(null);
  const [expandedInventory, setExpandedInventory] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({});
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "draft" | "posted" | "sold">("all");
  const [ipCheck, setIpCheck] = useState<{ isCanadian: boolean; country: string; ip: string } | null>(null);
  const [ipLoading, setIpLoading] = useState(false);
  const [postResults, setPostResults] = useState<{
    posted: number;
    total: number;
    results: Array<{ listing_id: string; success: boolean; error?: string }>;
  } | null>(null);

  const checkIp = useCallback(async () => {
    setIpLoading(true);
    try {
      const res = await fetch("/api/kijiji/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_ip: true }),
      });
      const data = await res.json();
      setIpCheck(data);
    } catch {
      setIpCheck({ isCanadian: false, country: "error", ip: "unknown" });
    }
    setIpLoading(false);
  }, []);

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
    setPostResults(null);
    try {
      const res = await fetch("/api/kijiji/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_all_drafts: true }),
      });
      const data = await res.json();
      setPostResults(data);
    } catch (err) {
      setPostResults({
        posted: 0,
        total: 0,
        results: [{ listing_id: "unknown", success: false, error: err instanceof Error ? err.message : "Network error" }],
      });
    }
    await fetchListings();
    await fetchStats();
    setActionLoading(null);
  }

  async function postSingle(listingId: string) {
    setActionLoading(listingId);
    setPostResults(null);
    try {
      const res = await fetch("/api/kijiji/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listingId }),
      });
      const data = await res.json();
      if (res.ok) {
        setPostResults({
          posted: 1,
          total: 1,
          results: [{ listing_id: listingId, success: true }],
        });
      } else {
        setPostResults({
          posted: 0,
          total: 1,
          results: [{ listing_id: listingId, success: false, error: data.error ?? "Failed" }],
        });
      }
    } catch (err) {
      setPostResults({
        posted: 0,
        total: 1,
        results: [{ listing_id: listingId, success: false, error: err instanceof Error ? err.message : "Network error" }],
      });
    }
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

  function nextImage(id: string, total: number) {
    setImageIndices((prev) => ({ ...prev, [id]: ((prev[id] ?? 0) + 1) % total }));
  }

  function prevImage(id: string, total: number) {
    setImageIndices((prev) => ({ ...prev, [id]: ((prev[id] ?? 0) - 1 + total) % total }));
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
    { id: "inventory", label: "Inventory", icon: Car },
    { id: "listings", label: "Kijiji Listings", icon: ExternalLink },
    { id: "inquiries", label: "Inquiries", icon: MessageSquare },
    { id: "accounts", label: "Accounts", icon: Users },
  ];

  const filteredInventory = inventoryFilter === "all"
    ? inventory
    : inventory.filter((v) => v.kijiji_status === inventoryFilter);

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
            {actionLoading === "assign" ? "Assigning..." : "Auto-Assign"}
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

      {/* ═══ Posting Results Panel ═══ */}
      {postResults && (
        <div className={`rounded-xl border p-4 ${
          postResults.posted === postResults.total && postResults.total > 0
            ? "bg-green-50 border-green-200"
            : postResults.posted === 0
              ? "bg-red-50 border-red-200"
              : "bg-amber-50 border-amber-200"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              Posting Results — {postResults.posted}/{postResults.total} succeeded
            </h3>
            <button
              onClick={() => setPostResults(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Dismiss
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1.5">
            {postResults.results.map((r, idx) => {
              const listing = listings.find((l) => l.id === r.listing_id);
              return (
                <div key={idx} className={`flex items-center justify-between py-1.5 px-3 rounded text-sm ${
                  r.success ? "bg-green-100" : "bg-red-100"
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${r.success ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-gray-800">
                      {listing?.kijiji_title ?? r.listing_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.success ? (
                      <span className="text-green-700 text-xs font-medium">Posted</span>
                    ) : (
                      <span className="text-red-700 text-xs">{r.error}</span>
                    )}
                    {r.success && listing?.kijiji_ad_id && (
                      <a
                        href={`https://www.kijiji.ca/v-cars-trucks/calgary/l/${listing.kijiji_ad_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-0.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                      >
                        View on Kijiji
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {postResults.results.some((r) => r.error) && (
            <p className="mt-2 text-xs text-gray-500">
              Check that KIJIJI_SHARED_PASSWORD is set in Vercel environment variables.
            </p>
          )}
        </div>
      )}

      {/* ═══ Overview Tab ═══ */}
      {tab === "overview" && stats && (
        <div className="space-y-6">
          {/* IP Location Info */}
          <div className={`rounded-xl border p-4 flex items-center justify-between ${
            ipCheck === null
              ? "bg-gray-50 border-gray-200"
              : ipCheck.isCanadian
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
          }`}>
            <div className="flex items-center gap-3">
              <MapPin size={18} className={
                ipCheck === null ? "text-gray-400"
                : ipCheck.isCanadian ? "text-green-600" : "text-amber-600"
              } />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {ipCheck === null
                    ? "Server IP Location"
                    : ipCheck.isCanadian
                      ? `Server IP is in Canada (${ipCheck.ip})`
                      : `Server IP is in ${ipCheck.country} (${ipCheck.ip}) — Kijiji API posts will use this IP`
                  }
                </p>
                <p className="text-xs text-gray-500">Kijiji may flag accounts posting from non-Canadian IPs</p>
              </div>
            </div>
            <button
              onClick={checkIp}
              disabled={ipLoading}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {ipLoading ? "Checking..." : "Check IP"}
            </button>
          </div>

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
                  label="2. Assign Inventory"
                  description="Distribute unassigned vehicles across accounts (1 per account)"
                  onClick={autoAssign}
                  loading={actionLoading === "assign"}
                />
                <ActionButton
                  label="3. Post All Drafts to Kijiji"
                  description="Submit all draft listings via Kijiji API (skips $0/no-image listings)"
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
                  <p className="text-xs text-gray-400 pt-1">+ {accounts.length - 15} more accounts</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Inventory Tab ═══ */}
      {tab === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500">{filteredInventory.length} vehicles</p>
              <div className="flex gap-1">
                {(["all", "draft", "posted", "sold"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setInventoryFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-medium ${
                      inventoryFilter === f
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={fetchInventory}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          <div className="grid gap-3">
            {filteredInventory.map((v) => {
              const images = v.image_urls ?? [];
              const imgIdx = imageIndices[v.id] ?? 0;
              const isExpanded = expandedInventory === v.id;

              return (
                <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex">
                    {/* Image thumbnail */}
                    {images.length > 0 && (
                      <div className="relative w-48 h-36 shrink-0 bg-gray-100">
                        <img
                          src={images[imgIdx]}
                          alt={v.kijiji_title}
                          className="w-full h-full object-cover"
                        />
                        {images.length > 1 && (
                          <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                            <ImageIcon size={10} className="inline mr-0.5" />
                            {images.length}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Info */}
                    <div
                      className="flex-1 p-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedInventory(isExpanded ? null : v.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{v.kijiji_title}</h3>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              v.kijiji_status === "posted" ? "bg-green-100 text-green-700"
                              : v.kijiji_status === "draft" ? "bg-gray-100 text-gray-700"
                              : v.kijiji_status === "sold" ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                            }`}>
                              {v.kijiji_status}
                            </span>
                            {v.price_evaluation && (
                              <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">
                                {v.price_evaluation}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-500">
                            {v.price != null && (
                              <span className="font-semibold text-gray-900">
                                ${Number(v.price).toLocaleString()}
                                {v.old_price != null && v.old_price !== v.price && (
                                  <span className="ml-1 text-xs text-red-400 line-through">
                                    ${Number(v.old_price).toLocaleString()}
                                  </span>
                                )}
                              </span>
                            )}
                            {v.mileage != null && <span>{Number(v.mileage).toLocaleString()} km</span>}
                            {v.transmission && <span>{v.transmission}</span>}
                            {v.drivetrain && <span>{v.drivetrain}</span>}
                            {v.fuel_type && <span>{v.fuel_type}</span>}
                            {v.engine && <span>{v.engine}</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-400">
                            {v.vin && <span>VIN: {v.vin}</span>}
                            {v.stock_number && <span>Stock: {v.stock_number}</span>}
                            {v.exterior_colour && <span>{v.exterior_colour}</span>}
                            {v.location_city && <span><MapPin size={10} className="inline" /> {v.location_city}, {v.location_province}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {v.carfax_url && (
                            <a
                              href={v.carfax_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100"
                            >
                              <Shield size={10} />
                              CarFax
                            </a>
                          )}
                          {v.had_accident && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded text-xs">
                              <AlertTriangle size={10} />
                              Accident
                            </span>
                          )}
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {/* Image Gallery */}
                      {images.length > 0 && (
                        <div className="p-4">
                          <div className="relative">
                            <img
                              src={images[imgIdx]}
                              alt={`${v.kijiji_title} - Image ${imgIdx + 1}`}
                              className="w-full max-h-96 object-contain rounded-lg bg-gray-200"
                            />
                            {images.length > 1 && (
                              <>
                                <button
                                  onClick={() => prevImage(v.id, images.length)}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70"
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <button
                                  onClick={() => nextImage(v.id, images.length)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70"
                                >
                                  <ChevronRight size={16} />
                                </button>
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                                  {imgIdx + 1} / {images.length}
                                </div>
                              </>
                            )}
                          </div>
                          {/* Thumbnails */}
                          <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                            {images.slice(0, 20).map((img, i) => (
                              <button
                                key={i}
                                onClick={() => setImageIndices((prev) => ({ ...prev, [v.id]: i }))}
                                className={`shrink-0 w-16 h-12 rounded overflow-hidden border-2 ${
                                  i === imgIdx ? "border-purple-500" : "border-transparent"
                                }`}
                              >
                                <img src={img} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                            {images.length > 20 && (
                              <span className="flex items-center text-xs text-gray-400 px-2">+{images.length - 20}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Vehicle Details Grid */}
                      <div className="px-4 pb-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <DetailItem label="Year" value={v.vehicle_year} />
                          <DetailItem label="Make" value={v.vehicle_make} />
                          <DetailItem label="Model" value={v.vehicle_model} />
                          <DetailItem label="Trim" value={v.vehicle_trim} />
                          <DetailItem label="Body Type" value={v.body_type} />
                          <DetailItem label="Drivetrain" value={v.drivetrain} />
                          <DetailItem label="Transmission" value={v.transmission} />
                          <DetailItem label="Engine" value={v.engine} />
                          <DetailItem label="Cylinders" value={v.cylinders} />
                          <DetailItem label="Displacement" value={v.displacement} />
                          <DetailItem label="Power" value={v.power_hp ? `${v.power_hp} HP` : null} />
                          <DetailItem label="Fuel Type" value={v.fuel_type} />
                          <DetailItem label="Mileage" value={v.mileage != null ? `${Number(v.mileage).toLocaleString()} km` : null} />
                          <DetailItem label="Doors" value={v.doors} />
                          <DetailItem label="Seats" value={v.seats} />
                          <DetailItem label="Exterior" value={v.exterior_colour} />
                          <DetailItem label="Manufacturer Colour" value={v.manufacturer_colour} />
                          <DetailItem label="Interior" value={v.interior_colour} />
                          <DetailItem label="VIN" value={v.vin} mono />
                          <DetailItem label="Stock #" value={v.stock_number} />
                          <DetailItem label="Fuel (City)" value={v.fuel_consumption_city} />
                          <DetailItem label="Fuel (Hwy)" value={v.fuel_consumption_highway} />
                          <DetailItem label="Price" value={v.price != null ? `$${Number(v.price).toLocaleString()}` : null} />
                          <DetailItem label="Old Price" value={v.old_price != null ? `$${Number(v.old_price).toLocaleString()}` : null} />
                          <DetailItem label="Location" value={v.location_city && v.location_province ? `${v.location_city}, ${v.location_province}` : null} />
                          <DetailItem label="Accident" value={v.had_accident ? "Yes" : "No"} warn={v.had_accident ?? false} />
                        </div>

                        {/* Links and actions */}
                        <div className="flex flex-wrap gap-2 mt-4">
                          {v.carfax_url && (
                            <a
                              href={v.carfax_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700"
                            >
                              <Shield size={12} />
                              View CarFax Report
                            </a>
                          )}
                          {v.autotrader_url && (
                            <a
                              href={v.autotrader_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300"
                            >
                              <ExternalLink size={12} />
                              AutoTrader Listing
                            </a>
                          )}
                          {v.seller_phone && (
                            <a
                              href={`tel:${v.seller_phone}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300"
                            >
                              <Phone size={12} />
                              {v.seller_phone}
                            </a>
                          )}
                          <button
                            onClick={() => copyToClipboard(v.kijiji_description, `inv-desc-${v.id}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300"
                          >
                            {copiedId === `inv-desc-${v.id}` ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
                            Copy Description
                          </button>
                        </div>

                        {/* Description */}
                        {v.kijiji_description && (
                          <div className="mt-4">
                            <p className="text-xs text-gray-400 mb-1">Description</p>
                            <pre className="text-xs text-gray-600 bg-white rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap border border-gray-200">
                              {v.kijiji_description}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredInventory.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Car size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No vehicles in inventory</p>
                <p className="text-gray-400 text-sm mt-1">
                  Use the Chrome extension to scrape AutoTrader listings first
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Listings Tab ═══ */}
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
            {listings.map((listing) => {
              const images = listing.image_urls ?? [];
              const imgIdx = imageIndices[`l-${listing.id}`] ?? 0;
              const isExpanded = expandedListing === listing.id;

              return (
                <div key={listing.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex">
                    {images.length > 0 && (
                      <div className="relative w-32 h-24 shrink-0 bg-gray-100">
                        <img src={images[0]} alt="" className="w-full h-full object-cover" />
                        {images.length > 1 && (
                          <div className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded">
                            {images.length}
                          </div>
                        )}
                      </div>
                    )}
                    <div
                      className="flex-1 flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedListing(isExpanded ? null : listing.id)}
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
                            {listing.vin && <span className="ml-2 text-gray-400">VIN: {listing.vin}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {listing.carfax_url && (
                          <a
                            href={listing.carfax_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs"
                          >
                            CarFax
                          </a>
                        )}
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
                        {listing.kijiji_status === "posted" && listing.kijiji_ad_id && (
                          <a
                            href={`https://www.kijiji.ca/v-cars-trucks/calgary/l/${listing.kijiji_ad_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                          >
                            View on Kijiji
                          </a>
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
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      {/* Image gallery for listing */}
                      {images.length > 0 && (
                        <div className="mt-3">
                          <div className="relative">
                            <img
                              src={images[imgIdx]}
                              alt=""
                              className="w-full max-h-72 object-contain rounded-lg bg-gray-100"
                            />
                            {images.length > 1 && (
                              <>
                                <button
                                  onClick={() => prevImage(`l-${listing.id}`, images.length)}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full"
                                >
                                  <ChevronLeft size={14} />
                                </button>
                                <button
                                  onClick={() => nextImage(`l-${listing.id}`, images.length)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full"
                                >
                                  <ChevronRight size={14} />
                                </button>
                                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                                  {imgIdx + 1} / {images.length}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <DetailItem label="Account" value={listing.kijiji_accounts?.employee_name} />
                        <DetailItem label="Price" value={listing.price != null ? `$${Number(listing.price).toLocaleString()}` : null} />
                        <DetailItem label="Mileage" value={listing.mileage != null ? `${Number(listing.mileage).toLocaleString()} km` : null} />
                        <DetailItem label="Transmission" value={listing.transmission} />
                        <DetailItem label="Drivetrain" value={listing.drivetrain} />
                        <DetailItem label="Engine" value={listing.engine} />
                        <DetailItem label="Exterior" value={listing.exterior_colour} />
                        <DetailItem label="Interior" value={listing.interior_colour} />
                        <DetailItem label="VIN" value={listing.vin} mono />
                        <DetailItem label="Stock #" value={listing.stock_number} />
                        <DetailItem label="Doors" value={listing.doors} />
                        <DetailItem label="Seats" value={listing.seats} />
                      </div>

                      {listing.posted_at && (
                        <p className="mt-2 text-xs text-gray-400">
                          Posted: {new Date(listing.posted_at).toLocaleString()}
                          {listing.kijiji_ad_id && ` · Ad ID: ${listing.kijiji_ad_id}`}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {listing.kijiji_status === "posted" && listing.kijiji_ad_id && (
                          <a href={`https://www.kijiji.ca/v-cars-trucks/calgary/l/${listing.kijiji_ad_id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700">
                            <ExternalLink size={12} /> View on Kijiji
                          </a>
                        )}
                        {listing.carfax_url && (
                          <a href={listing.carfax_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                            <Shield size={12} /> View CarFax
                          </a>
                        )}
                        {listing.autotrader_url && (
                          <a href={listing.autotrader_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300">
                            <ExternalLink size={12} /> AutoTrader
                          </a>
                        )}
                        <button
                          onClick={() => copyToClipboard(listing.kijiji_title, `lt-${listing.id}`)}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
                        >
                          {copiedId === `lt-${listing.id}` ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
                          Copy Title
                        </button>
                        <button
                          onClick={() => copyToClipboard(listing.kijiji_description, `ld-${listing.id}`)}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
                        >
                          {copiedId === `ld-${listing.id}` ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
                          Copy Desc
                        </button>
                      </div>

                      <div className="mt-3">
                        <p className="text-gray-400 text-xs mb-1">Kijiji Description</p>
                        <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {listing.kijiji_description}
                        </pre>
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
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Inquiries Tab ═══ */}
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
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">New</span>
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
                      <p className="text-xs text-green-500 mb-1">
                        Replied via {inquiry.reply_method === "kijiji" ? "Kijiji messaging" : "email"}:
                      </p>
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

      {/* ═══ Accounts Tab ═══ */}
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

function DetailItem({ label, value, mono, warn }: { label: string; value: string | number | null | undefined; mono?: boolean; warn?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={`text-sm ${warn ? "text-red-600 font-medium" : "text-gray-700"} ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </p>
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
