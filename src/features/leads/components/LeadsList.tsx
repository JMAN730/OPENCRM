"use client";

import { trpc } from "@/app/_trpc/client";
import {
  Plus, Search, Filter, MoreVertical, X, Check, MoreHorizontal,
  Phone, Mail, Star, ArrowUpDown, ArrowUp, ArrowDown, Upload,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { ImportLeadsDialog } from "./ImportLeadsDialog";
import { useDebounce } from "@/hooks/use-debounce";

type Lead = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  status: string;
  source?: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, { cls: string; label: string }> = {
  NEW:         { cls: "plain",  label: "New" },
  CONTACTED:   { cls: "accent", label: "Contacted" },
  QUALIFIED:   { cls: "",       label: "Qualified" },
  UNQUALIFIED: { cls: "neg",    label: "Unqualified" },
  LOST:        { cls: "neg",    label: "Lost" },
  WON:         { cls: "pos",    label: "Won" },
};

const OUTCOME_CHIPS = ["Connected", "Voicemail", "AI voicemail", "No answer", "Hung up", "Wrong number"];

function StageTag({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? STATUS_LABELS.NEW;
  return <span className={`crm-tag ${cfg.cls}`}>{cfg.label}</span>;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function avatarClass(seed: string) {
  const n = (seed.charCodeAt(0) % 6) + 1;
  return `c${n}`;
}

/* ── Lead Drawer ── */
function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.company || "Lead";
  const email = lead.email || "";
  const company = lead.company || "";
  const status = lead.status;

  return (
    <>
      <div className="crm-drawer-backdrop" onClick={onClose} />
      <div className="crm-drawer">
        <div className="crm-drawer-head">
          <div className={`crm-avatar lg ${avatarClass(fullName)}`}>{initials(fullName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--crm-fg)" }}>{fullName}</div>
            <div style={{ fontSize: 12, color: "var(--crm-fg-faint)" }}>{company}</div>
          </div>
          <button className="crm-btn ghost icon" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="crm-drawer-body">
          <div style={{ display: "flex", gap: 8 }}>
            <button className="crm-btn primary" style={{ flex: 1 }}>
              <Phone size={13} /> Call
            </button>
            <button className="crm-btn" style={{ flex: 1 }}>
              <Mail size={13} /> Email
            </button>
            <button className="crm-btn icon"><Star size={14} /></button>
            <button className="crm-btn icon"><MoreHorizontal size={14} /></button>
          </div>

          <div className="crm-drawer-section">
            <h4>Details</h4>
            <div className="crm-kv">
              <span className="crm-k">Status</span>
              <span className="crm-v"><StageTag status={status} /></span>
              <span className="crm-k">Source</span>
              <span className="crm-v">{lead.source || "—"}</span>
              {email && (
                <>
                  <span className="crm-k">Email</span>
                  <span className="crm-v" style={{ color: "var(--crm-accent-fg)" }}>{email}</span>
                </>
              )}
              {lead.phone && (
                <>
                  <span className="crm-k">Phone</span>
                  <span className="crm-v">{lead.phone}</span>
                </>
              )}
              {lead.website && (
                <>
                  <span className="crm-k">Website</span>
                  <span className="crm-v" style={{ color: "var(--crm-accent-fg)" }}>{lead.website}</span>
                </>
              )}
              <span className="crm-k">Created</span>
              <span className="crm-v">{new Date(lead.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Add Lead Dialog (minimal, inline) ── */
function AddLeadForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (data: Record<string, string>) => void }) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSubmit({
      firstName: fd.get("firstName") as string,
      lastName:  fd.get("lastName")  as string,
      company:   fd.get("company")   as string,
      email:     fd.get("email")     as string,
      phone:     fd.get("phone")     as string,
    });
  };
  return (
    <div style={{
      position: "fixed", inset: 0, background: "oklch(15% 0.012 70 / 0.32)",
      backdropFilter: "blur(2px)", zIndex: 60, display: "grid", placeItems: "center",
    }}>
      <div style={{
        background: "var(--crm-surface)", border: "1px solid var(--crm-border)",
        borderRadius: "var(--crm-radius-lg)", padding: 28, width: 440,
        boxShadow: "var(--crm-shadow-pop)",
      }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--crm-fg)" }}>
          New lead
        </h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["firstName", "First name"], ["lastName", "Last name"]].map(([n, l]) => (
              <label key={n} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "var(--crm-fg-muted)", fontWeight: 500 }}>{l}</span>
                <input name={n} style={{
                  height: 34, padding: "0 10px", border: "1px solid var(--crm-border)",
                  borderRadius: "var(--crm-radius-sm)", background: "var(--crm-surface-2)",
                  fontSize: 13, fontFamily: "var(--crm-font-sans)", color: "var(--crm-fg)", outline: "none",
                }} />
              </label>
            ))}
          </div>
          {[["company", "Company"], ["email", "Work email"], ["phone", "Phone"]].map(([n, l]) => (
            <label key={n} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12, color: "var(--crm-fg-muted)", fontWeight: 500 }}>{l}</span>
              <input name={n} type={n === "email" ? "email" : "text"} style={{
                height: 34, padding: "0 10px", border: "1px solid var(--crm-border)",
                borderRadius: "var(--crm-radius-sm)", background: "var(--crm-surface-2)",
                fontSize: 13, fontFamily: "var(--crm-font-sans)", color: "var(--crm-fg)", outline: "none",
              }} />
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" className="crm-btn ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancel</button>
            <button type="submit" className="crm-btn primary" style={{ flex: 1, justifyContent: "center" }}>Create lead</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Leads Component ── */
export function LeadsList() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [outcomeFilter, setOutcomeFilter] = useState(new Set<string>());
  const [sortBy, setSortBy] = useState<{ key: keyof Lead; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [selected, setSelected] = useState(new Set<string>());
  const [showAdd, setShowAdd] = useState(false);

  const utils = trpc.useUtils();
  const { data: leads = [], isLoading } = trpc.leads.getAll.useQuery({ search: debouncedSearch });

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => { toast.success("Lead created"); setShowAdd(false); utils.leads.getAll.invalidate(); },
    onError:   (e) => toast.error(e.message),
  });
  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => { toast.success("Lead deleted"); utils.leads.getAll.invalidate(); },
    onError:   (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let rows = (leads as Lead[]).slice();
    if (outcomeFilter.size) {
      rows = rows.filter((l: Lead) => outcomeFilter.has(l.status) || outcomeFilter.size === 0);
    }
    rows.sort((a: Lead, b: Lead) => {
      const av = a[sortBy.key] ?? "";
      const bv = b[sortBy.key] ?? "";
      const cmp = String(av).localeCompare(String(bv));
      return sortBy.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [leads, outcomeFilter, sortBy]);

  const toggleOutcome = (s: string) => {
    const next = new Set(outcomeFilter);
    next.has(s) ? next.delete(s) : next.add(s);
    setOutcomeFilter(next);
  };

  const toggleSel = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const allSelected = filtered.length > 0 && filtered.every((l: Lead) => selected.has(l.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((l: Lead) => l.id)));
  };

  const sortHeader = (label: string, key: keyof Lead) => {
    const active = sortBy.key === key;
    const Icon = active ? (sortBy.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <th
        onClick={() => setSortBy((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
      >
        {label}
        <span className="crm-sort"><Icon size={11} /></span>
      </th>
    );
  };

  return (
    <>
      {showAdd && (
        <AddLeadForm
          onCancel={() => setShowAdd(false)}
          onSubmit={(data) => createLead.mutate({ ...data, source: "Manual" })}
        />
      )}

      {selectedLead && <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />}

      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Leads</h1>
            <div className="crm-page-sub">
              {filtered.length} of {leads.length} leads · sorted by {sortBy.key}
            </div>
          </div>
          <div className="crm-page-head-actions">
            <ImportLeadsDialog onImported={() => utils.leads.getAll.invalidate()} />
            <button className="crm-btn primary" onClick={() => setShowAdd(true)}>
              <Plus size={13} /> New lead
            </button>
          </div>
        </div>

        <div className="crm-card flush">
          <div className="crm-leads-toolbar">
            <div className="crm-search">
              <Search size={14} />
              <input
                placeholder="Search name, company, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ width: 1, height: 20, background: "var(--crm-border)" }} />
            {OUTCOME_CHIPS.map((s) => (
              <button
                key={s} className="crm-chip"
                aria-pressed={outcomeFilter.has(s)}
                onClick={() => toggleOutcome(s)}
              >
                {s}
                {outcomeFilter.has(s) && (
                  <span style={{ color: "var(--crm-fg-faint)" }}>
                    <X size={10} strokeWidth={2.4} />
                  </span>
                )}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="crm-btn ghost"><Filter size={14} /> More filters</button>
              <button className="crm-btn ghost icon"><MoreVertical size={14} /></button>
            </div>
          </div>

          <table className="crm-table leads">
            <thead>
              <tr>
                <th className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                  <span className="crm-checkbox" data-checked={allSelected} onClick={toggleAll}>
                    {allSelected && <Check size={9} strokeWidth={2.6} />}
                  </span>
                </th>
                {sortHeader("Lead", "firstName")}
                {sortHeader("Company", "company")}
                {sortHeader("Status", "status")}
                {sortHeader("Source", "source")}
                {sortHeader("Created", "createdAt")}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
                    Loading leads…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
                    No leads found.
                  </td>
                </tr>
              ) : (
                filtered.map((lead: Lead) => {
                  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
                  const displayName = fullName || lead.company || "—";
                  const checked = selected.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      className={checked ? "selected" : ""}
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="checkbox-cell" onClick={(e) => { e.stopPropagation(); toggleSel(lead.id); }}>
                        <span className="crm-checkbox" data-checked={checked}>
                          {checked && <Check size={9} strokeWidth={2.6} />}
                        </span>
                      </td>
                      <td>
                        <div className="crm-contact-cell">
                          <div className={`crm-avatar sm ${avatarClass(displayName)}`}>
                            {initials(displayName)}
                          </div>
                          <div className="crm-meta">
                            <span className="crm-n">{displayName}</span>
                            {lead.email && <span className="crm-c">{lead.email}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: "var(--crm-fg)" }}>{lead.company || "—"}</span>
                      </td>
                      <td><StageTag status={lead.status} /></td>
                      <td><span className="crm-tag plain">{lead.source || "—"}</span></td>
                      <td className="mono" style={{ color: "var(--crm-fg-faint)" }}>
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className="crm-btn ghost icon"
                          style={{ height: 28, width: 28 }}
                          title="Delete"
                          onClick={() => {
                            if (confirm("Delete this lead?")) deleteLead.mutate({ id: lead.id });
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selected.size > 0 && (
          <div className="crm-selbar">
            <span>{selected.size} selected</span>
            <button className="crm-pill-btn">Assign</button>
            <button className="crm-pill-btn">Change status</button>
            <button className="crm-pill-btn" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
      </div>
    </>
  );
}
