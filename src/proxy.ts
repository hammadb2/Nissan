import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type UserRole = "hammad" | "jea" | "dann";

const ROLE_ROUTES: Record<UserRole, string[]> = {
  hammad: ["/dashboard"],
  jea: ["/dashboard/call-list", "/dashboard/appointments", "/dashboard/jea", "/dashboard/coaching", "/dashboard/objections"],
  dann: ["/dashboard/dann"],
};

const ROLE_HOME: Record<UserRole, string> = {
  hammad: "/dashboard/boss",
  jea: "/dashboard/call-list",
  dann: "/dashboard/dann",
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const role = request.cookies.get("bdc_role")?.value as UserRole | undefined;

  // Not logged in → redirect to login
  if (!role) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Root → redirect to role's home page
  if (pathname === "/") {
    return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
  }

  // Check route access for non-boss roles
  if (role !== "hammad" && pathname.startsWith("/dashboard")) {
    const allowed = ROLE_ROUTES[role];
    const hasAccess = allowed.some((route) => pathname.startsWith(route));
    if (!hasAccess) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|.*\\.ico$).*)"],
};
