import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import type { UserProfile } from "./types";

export type UserRole = "hammad" | "jea" | "dann";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  display_name: string;
}

/**
 * Extract and verify auth from request.
 * Returns the authenticated user or null if not authenticated.
 */
export async function getAuthUser(
  req: NextRequest
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  const userProfile = profile as UserProfile;
  return {
    id: user.id,
    email: userProfile.email,
    role: userProfile.role,
    display_name: userProfile.display_name,
  };
}

/**
 * Require authentication. Returns 401 if not authenticated.
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: UserRole[]
): Promise<AuthenticatedUser | NextResponse> {
  const user = await getAuthUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return user;
}

export function isAuthError(
  result: AuthenticatedUser | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
