"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Phone,
  Calendar,
  MessageSquare,
  Users2,
  Settings,
  BarChart3,
  Bot,
  Search,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/app/_trpc/client";

const NAV_GROUPS = [
  {
    title: null,
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Workspace",
    items: [
      { id: "leads",    label: "Leads",    href: "/leads",    icon: Users },
      { id: "team",     label: "Team",     href: "/team",     icon: Users2 },
      { id: "scraper",  label: "Scraper",  href: "/scraper",  icon: Bot },
      { id: "outreach", label: "Outreach", href: "/outreach", icon: MessageSquare },
      { id: "tasks",    label: "Tasks",    href: "/tasks",    icon: Calendar },
      { id: "dialer",   label: "Dialer",   href: "/dialer",   icon: Phone },
    ],
  },
  {
    title: "Insights",
    items: [
      { id: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    title: null,
    items: [
      { id: "settings", label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const userRole = (session?.user as { role?: string })?.role ?? "";

  const { data: counts } = trpc.dashboard.sidebarCounts.useQuery(
    undefined,
    { enabled: !!session, staleTime: 30_000 },
  );
  const countById: Record<string, number | undefined> = {
    leads: counts?.leads,
    tasks: counts?.tasks,
    scraper: counts?.scraperActive,
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [menuOpen]);

  return (
    <aside className="crm-sidebar">
      <div className="crm-brand">
        <div className="crm-brand-mark">
          <span>O</span>
        </div>
        <div className="crm-brand-name">OpenCRM</div>
        <div style={{ marginLeft: "auto", width: 20, height: 20, borderRadius: "var(--crm-radius-sm)", background: "var(--crm-surface-hover)", display: "grid", placeItems: "center", color: "var(--crm-fg-faint)", cursor: "pointer" }}>
          <ChevronDown size={12} />
        </div>
      </div>

      <div className="crm-nav-search" role="button" tabIndex={0}>
        <Search size={14} />
        <span>Quick find</span>
        <kbd>⌘K</kbd>
      </div>

      {NAV_GROUPS.map((group, gi) => (
        <div key={gi}>
          {group.title && <div className="crm-nav-section">{group.title}</div>}
          {group.items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="crm-nav-item"
                aria-current={isActive ? "page" : undefined}
              >
                <span className="crm-nav-icon">
                  <Icon size={16} />
                </span>
                <span>{item.label}</span>
                {countById[item.id] != null && (
                  <span className="crm-nav-count">{countById[item.id]}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="crm-sidebar-footer" ref={menuRef} style={{ position: "relative" }}>
        {/* Avatar — navigates to profile/settings */}
        <Link href="/settings" style={{ textDecoration: "none" }}>
          <div
            className="crm-avatar c1"
            title="View profile"
            style={{ cursor: "pointer" }}
          >
            {initials(userName)}
          </div>
        </Link>
        <div className="crm-userblock">
          <span className="crm-name">{userName}</span>
          <span className="crm-role">{userRole}</span>
        </div>
        {/* Dropdown toggle */}
        <button
          className="crm-btn ghost icon"
          style={{ marginLeft: "auto", width: 24, height: 24, padding: 0, display: "grid", placeItems: "center" }}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="User menu"
        >
          <ChevronDown size={12} style={{ transform: menuOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div
            className="crm-card"
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              right: 0,
              padding: "4px",
              zIndex: 100,
              boxShadow: "0 4px 24px rgba(0,0,0,.25)",
              borderRadius: "var(--crm-radius-md)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              animation: "crm-fade-in 0.12s ease-out",
            }}
          >
            <Link
              href="/settings"
              className="crm-nav-item"
              style={{ borderRadius: "var(--crm-radius-sm)", fontSize: 13 }}
              onClick={() => setMenuOpen(false)}
            >
              <User size={14} />
              <span>Profile &amp; Settings</span>
            </Link>
            <div style={{ height: 1, background: "var(--crm-border)", margin: "2px 6px" }} />
            <button
              className="crm-nav-item"
              style={{
                borderRadius: "var(--crm-radius-sm)",
                fontSize: 13,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--crm-neg)",
                width: "100%",
                textAlign: "left",
              }}
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

