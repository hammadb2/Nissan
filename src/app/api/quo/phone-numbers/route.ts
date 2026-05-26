import { NextResponse } from "next/server";
import { listPhoneNumbers } from "@/lib/quo-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const phoneNumbers = await listPhoneNumbers();
    return NextResponse.json({ phoneNumbers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
