import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listPhoneNumbers, sendSMS } from "@/lib/quo-api";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * Returns the correct UTC offset string for Calgary (America/Edmonton).
 * MDT (Mar–Nov) = "-06:00", MST (Nov–Mar) = "-07:00".
 * We determine this by checking what offset JS gives for a date in that zone.
 */
function getCalgaryUTCOffset(date: string, time: string): string {
  const probe = new Date(`${date}T${time}:00Z`);
  const calgaryStr = probe.toLocaleString("en-US", { timeZone: "America/Edmonton" });
  const calgaryLocal = new Date(calgaryStr);
  const diffMinutes = (probe.getTime() - calgaryLocal.getTime()) / 60000;
  const sign = diffMinutes >= 0 ? "-" : "+";
  const absMin = Math.abs(diffMinutes);
  const hours = String(Math.floor(absMin / 60)).padStart(2, "0");
  const mins = String(absMin % 60).padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("appointments")
    .select("*, contacts(*)")
    .order("scheduled_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  try {
    const body = await req.json();
    const { firstName, lastName, phone, date, time } = body;

    if (!firstName || !lastName || !phone || !date || !time) {
      return NextResponse.json(
        { error: "First name, last name, phone, date, and time are required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    // Validate phone: check if we have call records or contacts for this number
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone")
      .eq("phone", normalizedPhone)
      .single();

    const { count: callCount } = await supabase
      .from("call_records")
      .select("*", { count: "exact", head: true })
      .or(`from_number.eq.${normalizedPhone},to_number.eq.${normalizedPhone}`);

    const phoneVerified = !!existingContact || (callCount ?? 0) > 0;

    // Build scheduled_at in Calgary timezone (handles MST/MDT automatically)
    const calgaryOffset = getCalgaryUTCOffset(date, time);
    const scheduledAt = new Date(`${date}T${time}:00${calgaryOffset}`);

    const customerName = `${firstName.trim()} ${lastName.trim()}`;

    // Create appointment
    const { data: appointment, error: insertError } = await supabase
      .from("appointments")
      .insert({
        contact_id: existingContact?.id ?? null,
        customer_name: customerName,
        customer_phone: normalizedPhone,
        scheduled_at: scheduledAt.toISOString(),
        appointment_type: "in_person",
        source: "outbound_call",
        confirmed: false,
        sms_sent: false,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update contact status if exists
    if (existingContact) {
      await supabase
        .from("contacts")
        .update({
          status: "appointment_booked",
          next_action: "book_appointment",
          next_action_at: scheduledAt.toISOString(),
        })
        .eq("id", existingContact.id);
    }

    // Format the appointment time for SMS
    const displayDate = new Date(`${date}T${time}:00`);
    const timeStr = displayDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // Send SMS via Quo
    let smsSent = false;
    try {
      const phoneNumbers = await listPhoneNumbers();
      if (phoneNumbers.length > 0) {
        const smsContent =
          `Hi ${firstName.trim()}, your appt is set for ${timeStr} ${date} ` +
          `South Trail Nissan 6603 130 Ave SE, Calgary, AB ` +
          `Hammad will be happy to assist when you arrive! Reply C to confirm`;

        await sendSMS(phoneNumbers[0].id, normalizedPhone, smsContent);
        smsSent = true;

        await supabase
          .from("appointments")
          .update({ sms_sent: true })
          .eq("id", appointment.id);
      }
    } catch (smsError) {
      console.error("SMS send failed:", smsError);
    }

    // Update daily stats
    const today = new Date().toISOString().split("T")[0];
    const { data: existingStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", today)
      .eq("user_role", "jea")
      .single();

    if (existingStats) {
      await supabase
        .from("daily_stats")
        .update({
          appointments_booked: (existingStats.appointments_booked ?? 0) + 1,
        })
        .eq("id", existingStats.id);
    } else {
      await supabase.from("daily_stats").insert({
        date: today,
        user_role: "jea",
        appointments_booked: 1,
      });
    }

    return NextResponse.json({
      appointment,
      phoneVerified,
      smsSent,
    }, { status: 201 });
  } catch (error) {
    console.error("Appointment creation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
