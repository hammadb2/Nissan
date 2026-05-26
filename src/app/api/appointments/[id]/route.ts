import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listPhoneNumbers, sendSMS } from "@/lib/quo-api";

export const dynamic = "force-dynamic";

/**
 * Returns the correct UTC offset string for Calgary (America/Edmonton).
 * MDT (Mar–Nov) = "-06:00", MST (Nov–Mar) = "-07:00".
 */
function getCalgaryUTCOffset(date: string, time: string): string {
  const probe = new Date(`${date}T${time}:00Z`);
  const calgaryStr = probe.toLocaleString("en-US", { timeZone: "America/Edmonton" });
  const calgaryLocal = new Date(calgaryStr);
  const diffMinutes = (probe.getTime() - calgaryLocal.getTime()) / 60000;
  const sign = diffMinutes >= 0 ? "+" : "-";
  const absMin = Math.abs(diffMinutes);
  const hours = String(Math.floor(absMin / 60)).padStart(2, "0");
  const mins = String(absMin % 60).padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

async function sendAppointmentSMS(customerPhone: string, message: string) {
  try {
    const phoneNumbers = await listPhoneNumbers();
    if (phoneNumbers.length > 0) {
      await sendSMS(phoneNumbers[0].id, customerPhone, message);
      return true;
    }
  } catch (err) {
    console.error("Failed to send appointment SMS:", err);
  }
  return false;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  // Fetch current appointment for context
  const { data: existing } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const firstName = existing.customer_name?.split(" ")[0] ?? "there";

  // Handle reschedule: body contains { reschedule_date, reschedule_time }
  if (body.reschedule_date && body.reschedule_time) {
    const offset = getCalgaryUTCOffset(body.reschedule_date, body.reschedule_time);
    const newScheduledAt = new Date(`${body.reschedule_date}T${body.reschedule_time}:00${offset}`);

    const displayTime = new Date(`${body.reschedule_date}T${body.reschedule_time}:00`);
    const timeStr = displayTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const { data, error } = await supabase
      .from("appointments")
      .update({
        scheduled_at: newScheduledAt.toISOString(),
        confirmed: false,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const smsMessage =
      `Hi ${firstName}, your appointment at South Trail Nissan has been rescheduled to ${timeStr} on ${body.reschedule_date}. ` +
      `6603 130 Ave SE, Calgary, AB. Reply C to confirm`;

    const smsSent = await sendAppointmentSMS(existing.customer_phone, smsMessage);

    if (smsSent) {
      await supabase.from("appointments").update({ sms_sent: true }).eq("id", id);
    }

    return NextResponse.json({ ...data, sms_sent: smsSent, action: "rescheduled" });
  }

  // Handle cancel: body contains { cancelled: true }
  if (body.cancelled) {
    const { data, error } = await supabase
      .from("appointments")
      .update({ closed: true, showed_up: false })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const smsMessage =
      `Hi ${firstName}, your appointment at South Trail Nissan has been cancelled. ` +
      `If you'd like to rebook, just give us a call. Have a great day!`;

    const smsSent = await sendAppointmentSMS(existing.customer_phone, smsMessage);

    return NextResponse.json({ ...data, sms_sent: smsSent, action: "cancelled" });
  }

  // Handle no-show: body contains { showed_up: false }
  if (body.showed_up === false) {
    const { data, error } = await supabase
      .from("appointments")
      .update({ showed_up: false })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const smsMessage =
      `Hi ${firstName}, we missed you today at South Trail Nissan! ` +
      `No worries — we'd love to reschedule at a time that works for you. ` +
      `Just give us a call and we'll get you set up.`;

    const smsSent = await sendAppointmentSMS(existing.customer_phone, smsMessage);

    return NextResponse.json({ ...data, sms_sent: smsSent, action: "no_show" });
  }

  // Default: generic update (showed_up: true, closed, etc.)
  const { data, error } = await supabase
    .from("appointments")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
