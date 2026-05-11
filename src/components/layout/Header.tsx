"use client";

import { usePathname } from "next/navigation";
import { Bell, Inbox, Sparkles, Plus, ChevronRight, Menu } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/scraper": "Scraper",
  "/tasks": "Tasks",
  "/dialer": "Dialer",
  "/outreach": "Outreach",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? PAGE_TITLES[Object.keys(PAGE_TITLES).find((k) => pathname.startsWith(k)) ?? ""] ?? "Dashboard";

  return (
    <div className="crm-topbar">
      <button
        className="crm-btn ghost icon crm-menu-toggle"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <Menu size={18} />
      </button>
      <div className="crm-crumbs">
        <span>Sales</span>
        <span className="crm-sep">
          <ChevronRight size={12} />
        </span>
        <span className="crm-current">{title}</span>
      </div>

      <div className="crm-topbar-actions">
        <button className="crm-btn ghost icon" title="Notifications">
          <Bell size={15} />
        </button>
        <button className="crm-btn ghost icon" title="Inbox">
          <Inbox size={15} />
        </button>
        <div style={{ width: 1, height: 20, background: "var(--crm-border)", margin: "0 4px" }} />
        <button className="crm-btn">
          <Sparkles size={14} />
          Ask AI
          <span className="crm-kbd">⌘J</span>
        </button>
        <button className="crm-btn primary">
          <Plus size={14} />
          New lead
        </button>
      </div>
    </div>
  );
}
