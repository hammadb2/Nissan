"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  CheckCircle,
  Clock,
  Phone,
  AlertCircle,
  Send,
  Loader2,
  XCircle,
  Ban,
  Trash2,
} from "lucide-react";

interface Appointment {
  id: string;
  customer_name: string;
  customer_phone: string;
  scheduled_at: string;
  confirmed: boolean;
  sms_sent: boolean;
  sms_confirmed_at: string | null;
  showed_up: boolean | null;
  closed: boolean;
  notes: string | null;
  created_at: string;
}

interface DaySlots {
  date: string;
  dayName: string;
  slots: Array<{ time: string; available: boolean }>;
  blackedOut: boolean;
  reason?: string;
}

interface BlackoutDate {
  id: string;
  date: string;
  reason: string | null;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availability, setAvailability] = useState<DaySlots[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [role] = useState(() => getCookie("bdc_role"));

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [phoneWarning, setPhoneWarning] = useState("");

  // Blackout form
  const [blackoutDate, setBlackoutDate] = useState("");
  const [blackoutReason, setBlackoutReason] = useState("");
  const [blackoutSubmitting, setBlackoutSubmitting] = useState(false);

  const fetchAppointments = useCallback(async () => {
    const res = await fetch("/api/appointments");
    const data = await res.json();
    setAppointments(data.appointments ?? []);
  }, []);

  const fetchAvailability = useCallback(async () => {
    const res = await fetch("/api/appointments/availability");
    const data = await res.json();
    setAvailability(data.days ?? []);
    setBlackouts(data.blackout_dates ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await Promise.all([fetchAppointments(), fetchAvailability()]);
      if (cancelled) return;
      setLoading(false);
    }
    init();
    const interval = setInterval(() => {
      fetchAppointments();
      fetchAvailability();
    }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchAppointments, fetchAvailability]);

  const selectedDaySlots = availability.find((d) => d.date === selectedDate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName || !lastName || !phone || !selectedDate || !selectedTime) {
      setFormError("All fields are required — select a date and time slot");
      return;
    }

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");
    setPhoneWarning("");

    try {
      // Convert 12h time to 24h for API
      const time24 = to24Hour(selectedTime);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          date: selectedDate,
          time: time24,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? "Failed to create appointment");
        return;
      }

      if (!data.phoneVerified) {
        setPhoneWarning("Phone number not found in our records — appointment created but verify the number is correct.");
      }

      const smsStatus = data.smsSent
        ? "SMS sent to customer."
        : "Appointment created (SMS could not be sent).";
      setFormSuccess(`Appointment booked for ${firstName} ${lastName} on ${selectedDate} at ${selectedTime}! ${smsStatus}`);

      setFirstName("");
      setLastName("");
      setPhone("");
      setSelectedDate("");
      setSelectedTime("");
      fetchAppointments();
      fetchAvailability();
    } catch {
      setFormError("Failed to create appointment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function addBlackout() {
    if (!blackoutDate) return;
    setBlackoutSubmitting(true);
    try {
      const res = await fetch("/api/appointments/blackout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: blackoutDate, reason: blackoutReason || null }),
      });
      if (res.ok) {
        setBlackoutDate("");
        setBlackoutReason("");
        fetchAvailability();
      }
    } catch { /* ignore */ }
    setBlackoutSubmitting(false);
  }

  async function removeBlackout(date: string) {
    await fetch(`/api/appointments/blackout?date=${date}`, { method: "DELETE" });
    fetchAvailability();
  }

  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at) >= now);
  const past = appointments.filter((a) => new Date(a.scheduled_at) < now);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>

      {/* Blackout Management (Hammad only) */}
      {role === "hammad" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ban size={18} className="text-red-600" />
            <h2 className="font-semibold text-red-900">Blackout Days</h2>
          </div>
          <p className="text-sm text-red-700 mb-3">
            Block days so Jea cannot book appointments on them.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              type="date"
              value={blackoutDate}
              onChange={(e) => setBlackoutDate(e.target.value)}
              className="px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
            />
            <input
              type="text"
              value={blackoutReason}
              onChange={(e) => setBlackoutReason(e.target.value)}
              placeholder="Reason (optional)"
              className="px-3 py-2 border border-red-200 rounded-lg text-sm bg-white flex-1 min-w-[150px]"
            />
            <button
              onClick={addBlackout}
              disabled={blackoutSubmitting || !blackoutDate}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Block Day
            </button>
          </div>
          {blackouts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {blackouts.map((b) => (
                <span
                  key={b.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-800 rounded-full text-xs font-medium"
                >
                  <Ban size={12} />
                  {b.date}{b.reason ? ` — ${b.reason}` : ""}
                  <button
                    onClick={() => removeBlackout(b.date)}
                    className="ml-1 hover:text-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Book Appointment Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={20} className="text-blue-600" />
          <h2 className="font-semibold text-lg">Book New Appointment</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14031234567"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">System will verify this number was called before</p>
          </div>

          {/* Date Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {availability.slice(0, 10).map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    if (!day.blackedOut) {
                      setSelectedDate(day.date);
                      setSelectedTime("");
                    }
                  }}
                  disabled={day.blackedOut}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    day.blackedOut
                      ? "bg-red-50 border-red-200 text-red-400 cursor-not-allowed line-through"
                      : selectedDate === day.date
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-200 text-gray-700 hover:border-blue-300"
                  }`}
                >
                  <div className="text-xs">{day.dayName.slice(0, 3)}</div>
                  <div>{day.date.slice(5)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Time Slot Selection */}
          {selectedDate && selectedDaySlots && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Time — {selectedDaySlots.dayName}, {selectedDate}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {selectedDaySlots.slots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => {
                      if (slot.available) setSelectedTime(slot.time);
                    }}
                    disabled={!slot.available}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      !slot.available
                        ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                        : selectedTime === slot.time
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-gray-200 text-gray-700 hover:border-blue-300"
                    }`}
                  >
                    <Clock size={14} className="inline mr-1" />
                    {slot.time}
                    {!slot.available && <span className="block text-xs">Booked</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          {phoneWarning && (
            <div className="flex items-center gap-2 text-amber-700 text-sm bg-amber-50 p-3 rounded-lg">
              <AlertCircle size={16} />
              {phoneWarning}
            </div>
          )}

          {formSuccess && (
            <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 p-3 rounded-lg">
              <CheckCircle size={16} />
              {formSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedDate || !selectedTime}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Booking...
              </>
            ) : (
              <>
                <Send size={16} />
                Book Appointment &amp; Send SMS
              </>
            )}
          </button>
        </form>
      </div>

      {/* SMS Preview */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-2">SMS Preview:</p>
        <div className="bg-white rounded-lg p-3 border border-gray-200 text-gray-800">
          Hi {firstName || "[First Name]"}, your appt is set for {selectedTime || "[Time]"}{" "}
          {selectedDate || "[Date]"} South Trail Nissan 6603 130 Ave SE, Calgary, AB
          Hammad will be happy to assist when you arrive! Reply C to confirm
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="text-gray-500 text-sm">No upcoming appointments.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} onUpdate={() => { fetchAppointments(); fetchAvailability(); }} />
            ))}
          </div>
        )}
      </div>

      {/* Past Appointments */}
      {past.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3 text-gray-500">Past ({past.length})</h2>
          <div className="space-y-2 opacity-75">
            {past.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} onUpdate={() => { fetchAppointments(); fetchAvailability(); }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function to24Hour(time12: string): string {
  const match = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "09:00";
  let hours = parseInt(match[1]);
  const mins = match[2];
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, "0")}:${mins}`;
}

function AppointmentCard({
  appointment,
  onUpdate,
}: {
  appointment: Appointment;
  onUpdate: () => void;
}) {
  const scheduled = new Date(appointment.scheduled_at);
  const dateStr = scheduled.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Edmonton",
  });
  const timeStr = scheduled.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Edmonton",
  });

  async function markShowedUp(showed: boolean) {
    await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showed_up: showed }),
    });
    onUpdate();
  }

  async function markClosed() {
    await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed: true }),
    });
    onUpdate();
  }

  return (
    <div
      className={`bg-white border rounded-xl p-4 ${
        appointment.confirmed
          ? "border-green-300"
          : appointment.sms_sent
            ? "border-blue-200"
            : "border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{appointment.customer_name}</span>
            {appointment.confirmed && (
              <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-medium">
                CONFIRMED
              </span>
            )}
            {!appointment.confirmed && appointment.sms_sent && (
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                SMS SENT
              </span>
            )}
            {appointment.showed_up === true && (
              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                SHOWED UP
              </span>
            )}
            {appointment.showed_up === false && (
              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                NO SHOW
              </span>
            )}
            {appointment.closed && (
              <span className="bg-green-200 text-green-900 text-xs px-2 py-0.5 rounded-full font-medium">
                CLOSED
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
            <span className="flex items-center gap-1">
              <Phone size={12} />
              {appointment.customer_phone}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {dateStr} at {timeStr} MST
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {appointment.showed_up === null && (
            <>
              <button
                onClick={() => markShowedUp(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100"
              >
                <CheckCircle size={12} />
                Showed Up
              </button>
              <button
                onClick={() => markShowedUp(false)}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100"
              >
                <XCircle size={12} />
                No Show
              </button>
            </>
          )}
          {appointment.showed_up && !appointment.closed && (
            <button
              onClick={markClosed}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
            >
              <CheckCircle size={12} />
              Mark Closed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
