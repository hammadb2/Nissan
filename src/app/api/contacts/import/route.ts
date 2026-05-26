import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

interface ImportRow {
  "First Name"?: string;
  "Last Name"?: string;
  Phone?: string;
  Email?: string;
  Year?: number | string;
  Make?: string;
  Model?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  vehicle_year?: number | string;
  vehicle_make?: string;
  vehicle_model?: string;
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
    const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet);

    const supabase = getSupabaseAdmin();
    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const batchId = batchName ?? new Date().toISOString().split("T")[0];

    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const contacts = [];

      for (const row of batch) {
        const firstName = row["First Name"] ?? row.first_name;
        const lastName = row["Last Name"] ?? row.last_name;
        const rawPhone = row.Phone ?? row.phone;

        if (!firstName || !lastName || !rawPhone) {
          errors++;
          continue;
        }

        const phone = normalizePhone(String(rawPhone));
        const yearVal = row.Year ?? row.vehicle_year;

        contacts.push({
          first_name: String(firstName).trim(),
          last_name: String(lastName).trim(),
          phone,
          email: (row.Email ?? row.email) ? String(row.Email ?? row.email).trim() : null,
          vehicle_year: yearVal ? parseInt(String(yearVal)) : null,
          vehicle_make: (row.Make ?? row.vehicle_make) ? String(row.Make ?? row.vehicle_make).trim() : null,
          vehicle_model: (row.Model ?? row.vehicle_model) ? String(row.Model ?? row.vehicle_model).trim() : null,
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
          await supabase
            .from("contacts")
            .update({
              vehicle_year: contact.vehicle_year,
              vehicle_make: contact.vehicle_make,
              vehicle_model: contact.vehicle_model,
              updated_at: new Date().toISOString(),
            })
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
      total: rows.length,
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
