import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendAppointmentToWhatsApp } from "@/lib/whatsapp";
import type { Appointment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("appointments")
    .select("*, contacts(*), listings(*)")
    .order("scheduled_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { data, error } = await supabase
    .from("appointments")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const appointment = data as Appointment;

  // Send WhatsApp notification
  const whatsappSent = await sendAppointmentToWhatsApp(appointment);
  if (whatsappSent) {
    await supabase
      .from("appointments")
      .update({ whatsapp_sent: true })
      .eq("id", appointment.id);
  }

  // Update daily stats for the source
  const today = new Date().toISOString().split("T")[0];
  const userRole = body.source === "outbound_call" ? "jea" : "dann";

  const { data: existingStats } = await supabase
    .from("daily_stats")
    .select("*")
    .eq("date", today)
    .eq("user_role", userRole)
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
      user_role: userRole,
      appointments_booked: 1,
    });
  }

  // If from listing, increment listing appointments
  if (body.listing_id) {
    const { data: listing } = await supabase
      .from("listings")
      .select("appointments_booked")
      .eq("id", body.listing_id)
      .single();

    if (listing) {
      await supabase
        .from("listings")
        .update({
          appointments_booked: (listing.appointments_booked ?? 0) + 1,
        })
        .eq("id", body.listing_id);
    }
  }

  return NextResponse.json(data, { status: 201 });
}
