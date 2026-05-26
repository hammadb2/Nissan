"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import CallCard from "@/components/call-card";
import type { Call } from "@/lib/types";
import {
  Phone,
  RefreshCw,
  Loader2,
  Search,
  AlertTriangle,
} from "lucide-react";

async function loadAgentCalls(): Promise<Call[]> {
  const res = await fetch("/api/calls?agent=Jea&limit=30");
  const data = await res.json();
  return data.calls ?? [];
}

export default function AgentDashboard() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [preCallResult, setPreCallResult] = useState<{
    customer: { name: string; purchase_date: string; vehicle_purchased: string } | null;
    is_recent_buyer: boolean;
  } | null>(null);
  const mountedRef = useRef(false);

  const fetchCalls = useCallback(async () => {
    try {
      const data = await loadAgentCalls();
      setCalls(data);
    } catch (error) {
      console.error("Failed to fetch calls:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      loadAgentCalls()
        .then((data) => {
          setCalls(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
    const interval = setInterval(fetchCalls, 15000);
    return () => clearInterval(interval);
  }, [fetchCalls]);

  const checkCustomer = async () => {
    if (!customerPhone.trim()) return;
    setCheckingCustomer(true);
    setPreCallResult(null);
    try {
      const res = await fetch(
        `/api/customers?phone=${encodeURIComponent(customerPhone.trim())}`
      );
      const data = await res.json();
      setPreCallResult(data);
    } catch {
      setPreCallResult(null);
    } finally {
      setCheckingCustomer(false);
    }
  };

  const todaysCalls = calls.filter((c) => {
    const today = new Date().toISOString().split("T")[0];
    return c.created_at.startsWith(today);
  });

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
          <h2 className="text-2xl font-bold text-gray-900">My Calls</h2>
          <p className="text-sm text-gray-500 mt-1">
            <Phone className="w-3.5 h-3.5 inline mr-1" />
            {todaysCalls.length} calls today
          </p>
        </div>
        <button
          onClick={fetchCalls}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Pre-Call Customer Check */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
          Pre-Call Check
        </h3>
        <p className="text-sm text-gray-500 mb-3">
          Enter the customer&apos;s phone number before calling to check if
          they&apos;re a recent buyer.
        </p>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkCustomer()}
              placeholder="Enter phone number..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <button
            onClick={checkCustomer}
            disabled={checkingCustomer || !customerPhone.trim()}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {checkingCustomer ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Check"
            )}
          </button>
        </div>

        {/* Pre-call result */}
        {preCallResult && (
          <div className="mt-4">
            {preCallResult.is_recent_buyer ? (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-700">
                    SKIP — Recent Buyer
                  </p>
                  <p className="text-sm text-red-600 mt-1">
                    {preCallResult.customer?.name ?? "This customer"} purchased{" "}
                    {preCallResult.customer?.vehicle_purchased ?? "a vehicle"} on{" "}
                    {preCallResult.customer?.purchase_date
                      ? new Date(
                          preCallResult.customer.purchase_date
                        ).toLocaleDateString("en-CA")
                      : "within the last 12 months"}
                    . Do not call.
                  </p>
                </div>
              </div>
            ) : preCallResult.customer ? (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs">✓</span>
                </div>
                <div>
                  <p className="font-semibold text-green-700">
                    OK to Call
                  </p>
                  <p className="text-sm text-green-600 mt-1">
                    {preCallResult.customer.name}
                    {preCallResult.customer.purchase_date
                      ? ` — last purchase: ${new Date(preCallResult.customer.purchase_date).toLocaleDateString("en-CA")}`
                      : " — no purchase on record"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs">?</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-700">
                    No Record Found
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    This phone number is not in the system. OK to proceed with
                    the call.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Call List */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Calls
        </h3>
        {calls.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">
              No calls yet. Your call summaries, CRM notes, and tasks will
              appear here automatically after each call.
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
