"use client";

import { useState, useRef, useEffect } from "react";
import { Link2, X, Search } from "lucide-react";
import { trpc } from "@/app/_trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

export type LeadResult = inferRouterOutputs<AppRouter>["leads"]["getAll"]["items"][number];

export function leadDisplayName(lead: Pick<LeadResult, "company" | "firstName" | "lastName">) {
  return lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed";
}

export function LeadCombobox({
  value,
  onChange,
  placeholder = "Search leads by name, company, email…",
}: {
  value: string;
  onChange: (id: string, name: string, lead?: LeadResult) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = trpc.leads.getAll.useQuery(
    { search: search || undefined, limit: 10 },
    { enabled: open && search.length > 0 },
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const leads = data?.items ?? [];

  function select(lead: LeadResult) {
    const name = leadDisplayName(lead);
    onChange(lead.id, name, lead);
    setDisplayName(name);
    setSearch("");
    setOpen(false);
  }

  function clear() {
    onChange("", "");
    setDisplayName("");
    setSearch("");
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {value && !open ? (
          <div style={{
            flex: 1, padding: "6px 10px", border: "1px solid var(--crm-border)",
            borderRadius: 6, fontSize: 13, color: "var(--crm-fg)", display: "flex",
            alignItems: "center", justifyContent: "space-between", gap: 6,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Link2 size={12} style={{ color: "var(--crm-fg-muted)" }} />
              {displayName}
            </span>
            <button type="button" onClick={clear} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <X size={12} style={{ color: "var(--crm-fg-muted)" }} />
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--crm-fg-faint)" }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder={placeholder}
              style={{
                width: "100%", padding: "6px 10px 6px 28px",
                border: "1px solid var(--crm-border)", borderRadius: 6,
                fontSize: 13, color: "var(--crm-fg)", background: "var(--crm-bg-card)",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>
      {open && search.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "var(--crm-bg-card)", border: "1px solid var(--crm-border)",
          borderRadius: 8, marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          maxHeight: 240, overflowY: "auto",
        }}>
          {leads.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--crm-fg-faint)" }}>No leads found</div>
          ) : leads.map((lead) => {
            const name = leadDisplayName(lead);
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => select(lead)}
                style={{
                  width: "100%", padding: "8px 14px", border: "none", background: "none",
                  cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--crm-fg)",
                  display: "flex", flexDirection: "column", gap: 2,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--crm-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ fontWeight: 500 }}>{name}</span>
                {lead.email && <span style={{ fontSize: 11, color: "var(--crm-fg-muted)" }}>{lead.email}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
