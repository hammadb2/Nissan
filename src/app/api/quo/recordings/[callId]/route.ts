import { NextRequest, NextResponse } from "next/server";
import { getCallRecordings } from "@/lib/quo-api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

  try {
    const recordings = await getCallRecordings(callId);
    return NextResponse.json({ recordings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
