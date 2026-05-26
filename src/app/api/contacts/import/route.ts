import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const HEADER_VARIANTS: Record<string, string> = {
  "first name": "firstName",
  "first_name": "firstName",
  "firstname": "firstName",
  "last name": "lastName",
  "last_name": "lastName",
  "lastname": "lastName",
  "phone": "phone",
  "phone number": "phone",
  "phone_number": "phone",
  "email": "email",
  "email address": "email",
  "year": "year",
  "vehicle_year": "year",
  "make": "make",
  "vehicle_make": "make",
  "model": "model",
  "vehicle_model": "model",
};

function findHeaderRow(rawRows: unknown[][]): number {
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c ?? "").trim().toLowerCase());
    const matches = cells.filter((c) => HEADER_VARIANTS[c]);
    if (matches.length >= 3) return i;
  }
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const batchName = formData.get("batch") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Read as raw arrays to find the header row
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const headerRowIdx = findHeaderRow(rawRows);
    const headerRow = (rawRows[headerRowIdx] ?? []).map((c) =>
      String(c ?? "").trim().toLowerCase()
    );

    // Build column index map
    const colMap: Record<string, number> = {};
    for (let i = 0; i < headerRow.length; i++) {
      const mapped = HEADER_VARIANTS[headerRow[i]];
      if (mapped && !(mapped in colMap)) {
        colMap[mapped] = i;
      }
    }

    if (!("phone" in colMap)) {
      return NextResponse.json(
        { error: `Could not find a "Phone" column. Found headers: ${headerRow.filter(Boolean).join(", ")}` },
        { status: 400 }
      );
    }

    // Data rows start after header
    const dataRows = rawRows.slice(headerRowIdx + 1);

    const supabase = getSupabaseAdmin();
    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const batchId = batchName ?? new Date().toISOString().split("T")[0];

    function getCell(row: unknown[], field: string): string | undefined {
      const idx = colMap[field];
      if (idx === undefined) return undefined;
      const val = row[idx];
      if (val === null || val === undefined || val === "") return undefined;
      return String(val).trim();
    }

    const BATCH_SIZE = 100;
    for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
      const batch = dataRows.slice(i, i + BATCH_SIZE);
      const contacts = [];

      for (const row of batch) {
        if (!Array.isArray(row)) continue;

        const firstName = getCell(row, "firstName");
        const lastName = getCell(row, "lastName");
        const rawPhone = getCell(row, "phone");

        if (!rawPhone) {
          errors++;
          continue;
        }

        const phone = normalizePhone(rawPhone);
        const yearVal = getCell(row, "year");

        contacts.push({
          first_name: firstName ?? "",
          last_name: lastName ?? "",
          phone,
          email: getCell(row, "email") ?? null,
          vehicle_year: yearVal ? parseInt(yearVal) : null,
          vehicle_make: getCell(row, "make") ?? null,
          vehicle_model: getCell(row, "model") ?? null,
          import_batch: batchId,
        });
      }

      for (const contact of contacts) {
        const { data: existing } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone", contact.phone)
          .single();

        if (existing) {
          const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (contact.first_name) updates.first_name = contact.first_name;
          if (contact.last_name) updates.last_name = contact.last_name;
          if (contact.vehicle_year) updates.vehicle_year = contact.vehicle_year;
          if (contact.vehicle_make) updates.vehicle_make = contact.vehicle_make;
          if (contact.vehicle_model) updates.vehicle_model = contact.vehicle_model;
          if (contact.email) updates.email = contact.email;

          await supabase
            .from("contacts")
            .update(updates)
            .eq("id", existing.id);
          duplicates++;
        } else {
          const { error: insertError } = await supabase
            .from("contacts")
            .insert(contact);
          if (insertError) {
            errors++;
          } else {
            imported++;
          }
        }
      }
    }

    return NextResponse.json({
      imported,
      duplicates,
      errors,
      total: dataRows.length,
      batch: batchId,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import contacts" },
      { status: 500 }
    );
  }
}
