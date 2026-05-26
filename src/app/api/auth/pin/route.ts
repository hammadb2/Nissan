import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

type UserRole = "hammad" | "jea" | "dann";

const PIN_MAP: Record<string, UserRole> = {
  "1721": "hammad",
  "1722": "jea",
  "1723": "dann",
};

const ROLE_LABELS: Record<UserRole, string> = {
  hammad: "Hammad",
  jea: "Jea",
  dann: "Dann",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pin = (body as Record<string, string>).pin;

  if (!pin || typeof pin !== "string") {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const role = PIN_MAP[pin];
  if (!role) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set("bdc_role", role, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
  });

  return NextResponse.json({ role, name: ROLE_LABELS[role] });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("bdc_role");
  return NextResponse.json({ status: "logged_out" });
}
