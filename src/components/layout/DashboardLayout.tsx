"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Toaster } from "@/components/ui/sonner";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // The mobile nav drawer covers the page; lock the page scroll behind it.
  useBodyScrollLock(sidebarOpen);

  return (
    <div className={`crm-app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      {sidebarOpen && (
        <div
          className="crm-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="crm-main">
        <Header onMenuClick={() => setSidebarOpen((o) => !o)} />
        <main className="crm-main-scroll">
          {children}
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
