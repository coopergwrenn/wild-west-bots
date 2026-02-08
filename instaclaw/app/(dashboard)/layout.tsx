"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  LogOut,
  MessageSquare,
  Clock,
  FolderOpen,
  Key,
} from "lucide-react";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: MessageSquare },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/scheduled", label: "Tasks", icon: Clock },
  { href: "/env-vars", label: "API Keys", icon: Key },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen" data-theme="dashboard">
      {/* Top nav */}
      <nav
        className="border-b transition-colors"
        style={{ borderColor: "var(--border)", background: "var(--background)" }}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-1 text-xl tracking-[-0.5px] transition-opacity hover:opacity-70" style={{ fontFamily: "var(--font-serif)" }}>
            <Image src="/logo.png" alt="InstaClaw" width={44} height={44} unoptimized style={{ imageRendering: "pixelated" }} />
            Instaclaw
          </Link>

          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-snappy transition-colors"
                style={{
                  color: pathname === item.href ? "var(--foreground)" : "var(--muted)",
                  background:
                    pathname === item.href
                      ? "rgba(0,0,0,0.06)"
                      : "transparent",
                }}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            ))}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-snappy transition-colors cursor-pointer ml-2 hover:bg-[rgba(0,0,0,0.04)]"
              style={{ color: "var(--muted)" }}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-12 sm:py-16">{children}</main>
    </div>
  );
}
