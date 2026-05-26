import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      callIds?: string[];
      format?: "json" | "xlsx";
      includeTranscripts?: boolean;
      includeRecordings?: boolean;
    };

    const {
      callIds,
      format = "json",
      includeTranscripts = true,
      includeRecordings = true,
    } = body;

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("call_records")
      .select("*, contacts(first_name, last_name, phone)")
      .order("called_at", { ascending: false });

    if (callIds && callIds.length > 0) {
      query = query.in("id", callIds);
    }

    const { data: calls, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!calls || calls.length === 0) {
      return NextResponse.json({ error: "No calls found" }, { status: 404 });
    }

    if (format === "xlsx") {
      const rows = calls.map((call) => {
        const contact = call.contacts as {
          first_name: string;
          last_name: string;
          phone: string;
        } | null;

        const row: Record<string, unknown> = {
          "Date": call.called_at
            ? new Date(call.called_at).toLocaleString("en-CA", {
                timeZone: "America/Edmonton",
              })
            : "",
          "Contact": contact
            ? `${contact.first_name} ${contact.last_name}`
            : "Unknown",
          "Phone": contact?.phone ?? "",
          "Duration (s)": call.duration_seconds ?? "",
          "Outcome": call.outcome ?? "",
          "Sentiment": call.sentiment ?? "",
          "Interest": call.interest_level ?? "",
          "Summary": call.gpt_summary ?? call.quo_summary ?? "",
          "CRM Notes": call.crm_notes ?? "",
          "Next Action": call.next_action ?? "",
          "Coaching Tip": call.coaching_tip ?? "",
        };

        if (includeTranscripts) {
          row["Transcript"] = call.transcript ?? "";
        }
        if (includeRecordings) {
          row["Recording URL"] = call.recording_url ?? "";
        }

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Calls");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buf, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="calls-export-${Date.now()}.xlsx"`,
        },
      });
    }

    // JSON format
    const exportData = calls.map((call) => {
      const contact = call.contacts as {
        first_name: string;
        last_name: string;
        phone: string;
      } | null;

      const record: Record<string, unknown> = {
        id: call.id,
        quo_call_id: call.quo_call_id,
        date: call.called_at,
        contact_name: contact
          ? `${contact.first_name} ${contact.last_name}`
          : null,
        contact_phone: contact?.phone ?? null,
        duration_seconds: call.duration_seconds,
        outcome: call.outcome,
        sentiment: call.sentiment,
        interest_level: call.interest_level,
        summary: call.gpt_summary ?? call.quo_summary,
        crm_notes: call.crm_notes,
        next_action: call.next_action,
        coaching_tip: call.coaching_tip,
      };

      if (includeTranscripts) {
        record.transcript = call.transcript;
      }
      if (includeRecordings) {
        record.recording_url = call.recording_url;
      }

      return record;
    });

    return NextResponse.json({ calls: exportData, total: exportData.length });
  } catch (error) {
    console.error("Export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
