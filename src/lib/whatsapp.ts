import type { Appointment } from "./types";

export async function sendAppointmentToWhatsApp(
  appointment: Appointment
): Promise<boolean> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const groupId = process.env.WHATSAPP_GROUP_ID;

  if (!token || !groupId) {
    console.warn("WhatsApp API not configured — skipping notification");
    return false;
  }

  const scheduledDate = new Date(appointment.scheduled_at);
  const dateStr = scheduledDate.toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Edmonton",
  });
  const timeStr = scheduledDate.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
  });

  const message = `🚗 *NEW APPOINTMENT*

*Name:* ${appointment.customer_name ?? "N/A"}
*Phone:* ${appointment.customer_phone ?? "N/A"}
*Vehicle:* ${appointment.vehicle_interested ?? "N/A"}
*Budget:* ${appointment.budget ?? "N/A"}
*Trade-in:* ${appointment.trade_in ? "Yes" : "No"}
*Type:* ${appointment.appointment_type === "in_person" ? "In-Person" : "Phone Call"}
*Date:* ${dateStr}
*Time:* ${timeStr}
*Source:* ${appointment.source === "outbound_call" ? "Outbound Call (Jea)" : appointment.source === "marketplace" ? "Marketplace (Dann)" : "Walk-in"}`;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${groupId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: groupId,
          type: "text",
          text: { body: message },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("WhatsApp API error:", errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("WhatsApp send failed:", error);
    return false;
  }
}
