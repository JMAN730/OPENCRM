"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Toaster } from "@/components/ui/sonner";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-app">
      <Sidebar />
      <div className="crm-main">
        <Header />
        <main style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
