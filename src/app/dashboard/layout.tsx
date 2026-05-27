"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Phone,
  LayoutDashboard,
  ShoppingBag,
  Users,
  Upload,
  PhoneIncoming,
  ClipboardList,
  Calendar,
  LogOut,
  BookOpen,
  MessageCircle,
  Clock,
  FileText,
  Menu,
  X,
} from "lucide-react";

type UserRole = "hammad" | "jea" | "dann";

const allNavItems = [
  { href: "/dashboard/boss", label: "Boss View", icon: LayoutDashboard, roles: ["hammad"] },
  { href: "/dashboard/jea", label: "Jea", icon: Phone, roles: ["hammad", "jea"] },
  { href: "/dashboard/dann", label: "Dann", icon: ShoppingBag, roles: ["hammad", "dann"] },
  { href: "/dashboard/call-list", label: "Call List", icon: ClipboardList, roles: ["hammad", "jea"] },
  { href: "/dashboard/appointments", label: "Appts", icon: Calendar, roles: ["hammad", "jea"] },
  { href: "/dashboard/coaching", label: "Coaching", icon: BookOpen, roles: ["hammad", "jea"] },
  { href: "/dashboard/eod-report", label: "EOD", icon: FileText, roles: ["hammad", "jea"] },
  { href: "/dashboard/objections", label: "Objections", icon: MessageCircle, roles: ["hammad", "jea"] },
  { href: "/dashboard/calls", label: "Calls", icon: PhoneIncoming, roles: ["hammad"] },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users, roles: ["hammad"] },
  { href: "/dashboard/import", label: "Import", icon: Upload, roles: ["hammad"] },
];

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const syncRef = useRef(false);
  const [role] = useState<UserRole | null>(() => {
    if (typeof document === "undefined") return null;
    return getCookie("bdc_role") as UserRole | null;
  });

  const formatCalgaryTime = useCallback(() => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", {
      timeZone: "America/Edmonton",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    const date = now.toLocaleDateString("en-US", {
      timeZone: "America/Edmonton",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return { time, date };
  }, []);

  const [calgaryTime, setCalgaryTime] = useState(formatCalgaryTime);

  useEffect(() => {
    const timer = setInterval(() => setCalgaryTime(formatCalgaryTime()), 1_000);
    return () => clearInterval(timer);
  }, [formatCalgaryTime]);

  useEffect(() => {
    if (!role) {
      window.location.assign("/login");
    }
  }, [role]);

  useEffect(() => {
    let cancelled = false;

    async function syncLoop() {
      while (!cancelled) {
        syncRef.current = true;
        try {
          await fetch("/api/quo/sync-recent");
        } catch { /* ignore network errors */ }
        syncRef.current = false;
        // 2s pause between cycles to respect Quo's 10 req/sec rate limit
        if (!cancelled) await new Promise((r) => setTimeout(r, 2_000));
      }
    }

    syncLoop();
    return () => { cancelled = true; };
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/pin", { method: "DELETE" });
    document.cookie = "bdc_role=; path=/; max-age=0";
    window.location.assign("/login");
  }

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = role
    ? allNavItems.filter((item) => item.roles.includes(role))
    : [];

  if (!role) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3 shrink-0">
              <Link href={navItems[0]?.href ?? "/dashboard/boss"} className="font-bold text-lg">
                BDC
              </Link>
              <div className="hidden md:flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-lg text-xs">
                <Clock size={12} className="text-gray-500" />
                <span className="font-mono font-medium text-gray-700">{calgaryTime.time}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">{calgaryTime.date}</span>
              </div>
            </div>
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-0.5">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                    title={item.label}
                  >
                    <Icon size={14} />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors ml-1"
                title="Log out"
              >
                <LogOut size={14} />
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
            >
              <LogOut size={16} />
              Log Out
            </button>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
