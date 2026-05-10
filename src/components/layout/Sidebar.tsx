"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Phone,
  Calendar,
  MessageSquare,
  Settings,
  BarChart3,
  Bot,
  Search,
  ChevronDown,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";

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
      { id: "leads",    label: "Leads",    href: "/leads",    icon: Users,          count: 1248 },
      { id: "scraper",  label: "Scraper",  href: "/scraper",  icon: Bot,            count: 28 },
      { id: "outreach", label: "Outreach", href: "/outreach", icon: MessageSquare,  count: 6 },
      { id: "tasks",    label: "Tasks",    href: "/tasks",    icon: Calendar,       count: 6 },
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
  const userName = session?.user?.name || "Jordan Mehta";
  const userRole = (session?.user as { role?: string })?.role || "Account Executive";

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
                {"count" in item && item.count != null && (
                  <span className="crm-nav-count">{item.count}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="crm-sidebar-footer">
        <div
          className="crm-avatar c1"
          title={userName}
          style={{ cursor: "pointer" }}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          {initials(userName)}
        </div>
        <div className="crm-userblock">
          <span className="crm-name">{userName}</span>
          <span className="crm-role">{userRole}</span>
        </div>
      </div>
    </aside>
  );
}
