"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import type { Listing, DannStats } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  not_listed: "bg-gray-100 text-gray-700",
  listed: "bg-green-100 text-green-800",
  needs_refresh: "bg-amber-100 text-amber-800",
  sold: "bg-blue-100 text-blue-800",
};

export default function DannCommandCenter() {
  const [stats, setStats] = useState<DannStats | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [showNewListing, setShowNewListing] = useState(false);
  const [showInquiry, setShowInquiry] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [selectedListing, setSelectedListing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [statsRes, listingsRes] = await Promise.all([
      fetch("/api/stats"),
      fetch("/api/listings"),
    ]);

    const [statsData, listingsData] = await Promise.all([
      statsRes.json(),
      listingsRes.json(),
    ]);

    setStats(statsData.dann);
    setListings(listingsData.listings ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await fetchData();
      if (cancelled) return;
    }
    init();
    const interval = setInterval(fetchData, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchData]);

  async function handleRefresh(listingId: string) {
    await fetch(`/api/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    fetchData();
  }

  async function handleNewListing(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      vehicle_year: parseInt(formData.get("year") as string),
      vehicle_make: formData.get("make") as string,
      vehicle_model: formData.get("model") as string,
      vehicle_trim: formData.get("trim") as string || null,
      mileage: formData.get("mileage") ? parseInt(formData.get("mileage") as string) : null,
      price: formData.get("price") ? parseFloat(formData.get("price") as string) : null,
      colour: formData.get("colour") as string || null,
      marketplace_url: formData.get("url") as string || null,
      status: formData.get("url") ? "listed" : "not_listed",
      listed_at: formData.get("url") ? new Date().toISOString() : null,
    };

    await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setShowNewListing(false);
    fetchData();
  }

  async function handleNewAppointment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const dateStr = formData.get("date") as string;
    const timeStr = formData.get("time") as string;
    const scheduledAt = new Date(`${dateStr}T${timeStr}:00-06:00`).toISOString();

    const body = {
      customer_name: formData.get("name") as string,
      customer_phone: formData.get("phone") as string,
      vehicle_interested: formData.get("vehicle") as string,
      budget: formData.get("budget") as string || null,
      trade_in: formData.get("trade_in") === "yes",
      appointment_type: formData.get("type") as string,
      scheduled_at: scheduledAt,
      source: "marketplace",
      listing_id: selectedListing,
    };

    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setShowAppointment(false);
    setSelectedListing(null);
    fetchData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Listings Live" value={stats?.listings_live ?? 0} className="text-green-600" />
        <StatCard label="New Today" value={stats?.new_listings_today ?? 0} />
        <StatCard label="Target" value={stats?.listings_target ?? 35} className="text-gray-500" />
        <StatCard label="Inquiries" value={stats?.inquiries_today ?? 0} />
        <StatCard label="Numbers" value={stats?.phone_numbers_collected ?? 0} />
        <StatCard label="Appointments" value={stats?.appointments_booked ?? 0} className="text-green-600" />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowNewListing(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} /> Add Listing
        </button>
        <button
          onClick={() => setShowInquiry(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Log Inquiry
        </button>
        <button
          onClick={() => setShowAppointment(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
        >
          <CheckCircle size={16} /> Book Appointment
        </button>
      </div>

      {/* Listings Manager */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Listings ({listings.length})</h2>
        <div className="grid gap-3">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {listing.vehicle_year} {listing.vehicle_make}{" "}
                      {listing.vehicle_model}
                    </span>
                    {listing.vehicle_trim && (
                      <span className="text-gray-500 text-sm">
                        {listing.vehicle_trim}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_COLORS[listing.status]
                      }`}
                    >
                      {listing.status === "needs_refresh"
                        ? "NEEDS REFRESH"
                        : listing.status.replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    {listing.price && (
                      <span>${listing.price.toLocaleString()}</span>
                    )}
                    {listing.mileage && (
                      <span>{listing.mileage.toLocaleString()} km</span>
                    )}
                    {listing.colour && <span>{listing.colour}</span>}
                    <span>
                      {listing.inquiry_count} inquiries ·{" "}
                      {listing.appointments_booked} appts
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {listing.status === "needs_refresh" && (
                    <button
                      onClick={() => handleRefresh(listing.id)}
                      className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100"
                    >
                      <RefreshCw size={12} /> Refresh
                    </button>
                  )}
                  {listing.marketplace_url && (
                    <a
                      href={listing.marketplace_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                  {listing.status !== "sold" && (
                    <button
                      onClick={async () => {
                        await fetch(`/api/listings/${listing.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "sold" }),
                        });
                        fetchData();
                      }}
                      className="text-xs text-gray-500 hover:text-green-600"
                    >
                      Mark Sold
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {listings.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">
              No listings yet. Add your first one above.
            </p>
          )}
        </div>
      </div>

      {/* New Listing Modal */}
      {showNewListing && (
        <Modal onClose={() => setShowNewListing(false)} title="Add New Listing">
          <form onSubmit={handleNewListing} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <input name="year" placeholder="Year" type="number" required className="input-field" />
              <input name="make" placeholder="Make" required className="input-field" />
              <input name="model" placeholder="Model" required className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input name="trim" placeholder="Trim (optional)" className="input-field" />
              <input name="colour" placeholder="Colour (optional)" className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input name="mileage" placeholder="Mileage" type="number" className="input-field" />
              <input name="price" placeholder="Price" type="number" step="0.01" className="input-field" />
            </div>
            <input name="url" placeholder="Marketplace URL (optional)" className="input-field w-full" />
            <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Add Listing
            </button>
          </form>
        </Modal>
      )}

      {/* Inquiry Log Modal */}
      {showInquiry && (
        <Modal onClose={() => setShowInquiry(false)} title="Log Inquiry">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const listingId = formData.get("listing_id") as string;

              if (listingId) {
                const { data: listing } = await fetch(`/api/listings`).then((r) => r.json());
                const target = (listing ?? []).find((l: Listing) => l.id === listingId);
                if (target) {
                  await fetch(`/api/listings/${listingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      inquiry_count: (target.inquiry_count ?? 0) + 1,
                      phone_numbers_collected:
                        formData.get("got_number") === "yes"
                          ? (target.phone_numbers_collected ?? 0) + 1
                          : target.phone_numbers_collected,
                    }),
                  });
                }
              }

              if (formData.get("outcome") === "booked") {
                setShowInquiry(false);
                setSelectedListing(formData.get("listing_id") as string);
                setShowAppointment(true);
              } else {
                setShowInquiry(false);
              }
              fetchData();
            }}
            className="space-y-3"
          >
            <input name="buyer_name" placeholder="Buyer name (if given)" className="input-field w-full" />
            <select name="listing_id" className="input-field w-full">
              <option value="">Select vehicle</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.vehicle_year} {l.vehicle_make} {l.vehicle_model}
                </option>
              ))}
            </select>
            <select name="got_number" className="input-field w-full">
              <option value="no">Phone number collected?</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            <select name="outcome" className="input-field w-full">
              <option value="cold">Outcome</option>
              <option value="booked">Appointment Booked</option>
              <option value="hot">Hot Lead</option>
              <option value="cold">Cold</option>
              <option value="no_number">No Number</option>
            </select>
            <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Log Inquiry
            </button>
          </form>
        </Modal>
      )}

      {/* New Appointment Modal */}
      {showAppointment && (
        <Modal onClose={() => { setShowAppointment(false); setSelectedListing(null); }} title="Book Appointment">
          <form onSubmit={handleNewAppointment} className="space-y-3">
            <input name="name" placeholder="Customer name" required className="input-field w-full" />
            <input name="phone" placeholder="Phone number" required className="input-field w-full" />
            <input name="vehicle" placeholder="Vehicle interested in" className="input-field w-full" />
            <input name="budget" placeholder="Budget / monthly payment" className="input-field w-full" />
            <select name="trade_in" className="input-field w-full">
              <option value="no">Trade-in?</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            <select name="type" required className="input-field w-full">
              <option value="in_person">In-Person</option>
              <option value="phone_call">Phone Call</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input name="date" type="date" required className="input-field" />
              <input name="time" type="time" required className="input-field" />
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <AlertTriangle size={14} className="inline mr-1" />
              This will send a WhatsApp notification to the group automatically.
            </div>
            <button type="submit" className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              Book & Send to WhatsApp
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${className}`}>{value}</p>
    </div>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
