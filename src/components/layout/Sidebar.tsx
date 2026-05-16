"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Phone,
  Calendar,
  CalendarDays,
  MessageSquare,
  Users2,
  Settings,
  BarChart3,
  Bot,
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
      { id: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
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
      { id: "scoring", label: "Lead Scoring", href: "/settings/scoring", icon: BarChart3 },
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

export function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: { isOpen?: boolean; onClose?: () => void; collapsed?: boolean; onToggleCollapse?: () => void }) {
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
    <aside className={`crm-sidebar${isOpen ? " is-open" : ""}${collapsed ? " is-collapsed" : ""}`}>
      <div className="crm-brand">
        <div className="crm-brand-mark">
          <span>O</span>
        </div>
        {!collapsed && <div className="crm-brand-name">OpenCRM</div>}
        <button
          className="crm-sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{ marginLeft: "auto" }}
        >
          <ChevronDown size={12} style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.2s" }} />
        </button>
      </div>

      {NAV_GROUPS.map((group, gi) => (
        <div key={gi}>
          {group.title && !collapsed && <div className="crm-nav-section">{group.title}</div>}
          {group.items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`crm-nav-item${collapsed ? " collapsed" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                onClick={onClose}
              >
                <span className="crm-nav-icon">
                  <Icon size={16} />
                </span>
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && countById[item.id] != null && (
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
            title={collapsed ? userName : "View profile"}
            style={{ cursor: "pointer" }}
          >
            {initials(userName)}
          </div>
        </Link>
        {!collapsed && (
          <div className="crm-userblock">
            <span className="crm-name">{userName}</span>
            <span className="crm-role">{userRole}</span>
          </div>
        )}
        {/* Dropdown toggle */}
        {!collapsed && (
          <button
            className="crm-btn ghost icon"
            style={{ marginLeft: "auto", width: 24, height: 24, padding: 0, display: "grid", placeItems: "center" }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="User menu"
          >
            <ChevronDown size={12} style={{ transform: menuOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
          </button>
        )}

        {/* Dropdown menu */}
        {menuOpen && !collapsed && (
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
              onClick={() => signOut({ callbackUrl: `${window.location.origin}/auth/signin` })}
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
