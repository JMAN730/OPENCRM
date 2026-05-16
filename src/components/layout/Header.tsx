"use client";

import { usePathname } from "next/navigation";
import { Bell, Inbox, Sparkles, Menu, Sun, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

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

type Panel = "bell" | "inbox" | "ai" | null;

const POPOVER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 240,
  padding: "16px",
  zIndex: 200,
  boxShadow: "0 4px 24px rgba(0,0,0,.18)",
  borderRadius: "var(--crm-radius-md)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  textAlign: "center",
  animation: "crm-fade-in 0.12s ease-out",
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? PAGE_TITLES[Object.keys(PAGE_TITLES).find((k) => pathname.startsWith(k)) ?? ""] ?? "Dashboard";

  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    if (!openPanel) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openPanel]);

  const toggle = (panel: Panel) => setOpenPanel((p) => (p === panel ? null : panel));

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
        <span className="crm-current">{title}</span>
      </div>

      <div className="crm-topbar-actions" ref={panelRef} style={{ position: "relative" }}>
        <button
          className="crm-btn ghost icon"
          title="Notifications"
          aria-pressed={openPanel === "bell"}
          onClick={() => toggle("bell")}
        >
          <Bell size={15} />
        </button>
        <button
          className="crm-btn ghost icon"
          title="Inbox"
          aria-pressed={openPanel === "inbox"}
          onClick={() => toggle("inbox")}
        >
          <Inbox size={15} />
        </button>
        <button
          className="crm-btn ghost icon"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          suppressHydrationWarning
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <div style={{ width: 1, height: 20, background: "var(--crm-border)", margin: "0 4px" }} />
        <button className="crm-btn" aria-pressed={openPanel === "ai"} onClick={() => toggle("ai")}>
          <Sparkles size={14} />
          Ask AI
          <span className="crm-kbd">⌘J</span>
        </button>

        {openPanel === "bell" && (
          <div className="crm-card" style={POPOVER_STYLE}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>No notifications</span>
            <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>You&apos;re all caught up.</span>
          </div>
        )}

        {openPanel === "inbox" && (
          <div className="crm-card" style={POPOVER_STYLE}>
            <span style={{ fontSize: 22 }}>📬</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>No messages</span>
            <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>Your inbox is empty.</span>
          </div>
        )}

        {openPanel === "ai" && (
          <div className="crm-card" style={POPOVER_STYLE}>
            <span style={{ fontSize: 22 }}>✨</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Ask AI — Coming Soon</span>
            <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>AI-powered lead insights are on the way.</span>
          </div>
        )}
      </div>
    </div>
  );
}
