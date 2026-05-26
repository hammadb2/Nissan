"use client";

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
} from "lucide-react";

const navItems = [
  { href: "/dashboard/boss", label: "Boss View", icon: LayoutDashboard },
  { href: "/dashboard/jea", label: "Jea", icon: Phone },
  { href: "/dashboard/dann", label: "Dann", icon: ShoppingBag },
  { href: "/dashboard/call-list", label: "Call List", icon: ClipboardList },
  { href: "/dashboard/appointments", label: "Appts", icon: Calendar },
  { href: "/dashboard/calls", label: "Calls", icon: PhoneIncoming },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/import", label: "Import", icon: Upload },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard/boss" className="font-bold text-lg">
              Hammad BDC
            </Link>
            <div className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
