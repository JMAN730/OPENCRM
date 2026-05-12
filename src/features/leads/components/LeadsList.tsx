"use client";

import { trpc } from "@/app/_trpc/client";
import {
  Plus, Search, Filter, MoreVertical, X, Check, MoreHorizontal,
  Phone, Mail, Star, ArrowUpDown, ArrowUp, ArrowDown,
  Columns, Flame, Sun, Snowflake, ChevronLeft, ChevronRight,
  NotebookPen, Globe,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
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
  callOutcome?: string | null;
  callNotes?: string | null;
  createdAt: string;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string | null; email: string | null; image: string | null } | null;
};

const STATUS_LABELS: Record<string, { cls: string; label: string }> = {
  NOT_CONTACTED: { cls: "plain", label: "Not Contacted" },
  CONNECTED:     { cls: "pos",   label: "Connected" },
  AI_VOICEMAIL:  { cls: "warn",  label: "AI Voicemail" },
  NO_ANSWER:     { cls: "cool",  label: "No Answer" },
  HUNG_UP:       { cls: "neg",   label: "Hung Up" },
};

const STAGE_ORDER = ["CONNECTED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP", "NOT_CONTACTED"];

const OUTCOMES = [
  { id: "ANSWERED",      label: "Connected",     tone: "pos",  hint: "Reached the lead, had a conversation" },
  { id: "AI_VOICEMAIL",  label: "AI Voicemail",  tone: "warn", hint: "AI voicemail screen, message left" },
  { id: "NO_ANSWER",     label: "No Answer",     tone: "cool", hint: "Ringed out, no pickup" },
  { id: "HUNG_UP",       label: "Hung Up",       tone: "neg",  hint: "Picked up but ended the call" },
  { id: "NOT_CONTACTED", label: "Not Contacted", tone: "cool", hint: "Hasn't been reached yet" },
] as const;

function fullNameOf(l: Lead) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead";
}
function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarClass(seed: string) {
  const n = ((seed?.charCodeAt(0) || 0) % 6) + 1;
  return `c${n}`;
}

// Derive a lightweight "score" + "temperature" from the lead's status & outcome
// so the refined table has the at-a-glance signal from the design without
// needing schema changes.
function scoreOf(l: Lead): number {
  switch (l.status) {
    case "CONNECTED":     return 90;
    case "AI_VOICEMAIL":  return 65;
    case "NO_ANSWER":     return 45;
    case "NOT_CONTACTED": return 30;
    case "HUNG_UP":       return 15;
    default:              return 30;
  }
}
function tempOf(score: number): "hot" | "warm" | "cool" {
  if (score >= 70) return "hot";
  if (score >= 45) return "warm";
  return "cool";
}
function tempLabel(t: "hot" | "warm" | "cool") {
  return t === "hot" ? "Hot" : t === "warm" ? "Warm" : "Cool";
}

function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diffMs = Date.now() - d;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ─── Tiny UI atoms ─────────────────────────────────────────────────── */

function StageTag({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? STATUS_LABELS.NEW;
  return <span className={`crm-tag ${cfg.cls}`}>{cfg.label}</span>;
}

function ScoreBar({ score, temp, showNum = true }: { score: number; temp: "hot" | "warm" | "cool"; showNum?: boolean }) {
  return (
    <span className="crm-score">
      {showNum && <span className="crm-score-num">{score}</span>}
      <span className={`crm-score-bar t-${temp}`}><span style={{ width: `${score}%`, display: "block", height: "100%" }} /></span>
    </span>
  );
}

function TempPill({ temp }: { temp: "hot" | "warm" | "cool" }) {
  const Icon = temp === "hot" ? Flame : temp === "warm" ? Sun : Snowflake;
  return (
    <span className={`crm-temp t-${temp}`}>
      <Icon size={11} />
      {tempLabel(temp)}
    </span>
  );
}

function Touches({ n, max = 6 }: { n: number; max?: number }) {
  const dots = [];
  for (let i = 0; i < max; i++) {
    dots.push(<span key={i} className={`dot ${i < n ? "" : "empty"}`} />);
  }
  return (
    <span className="crm-touches">
      {dots}
      <span className="num">{n}</span>
    </span>
  );
}

function NextActionChip({ label, state }: { label?: string; state?: "due" | "today" | "upcoming" }) {
  if (!label) return <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>—</span>;
  return (
    <span className={`crm-next ${state || ""}`}>
      <Phone size={11} />
      <span className="label">{label}</span>
    </span>
  );
}

/* ─── Log Note Dialog ───────────────────────────────────────────────── */

function LogNoteDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const utils = trpc.useUtils();
  const createNote = trpc.leads.createNote.useMutation({
    onSuccess: () => {
      toast.success("Note saved");
      utils.leads.getNotes.invalidate({ leadId });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "oklch(15% 0.012 70 / 0.45)",
        backdropFilter: "blur(2px)", zIndex: 70, display: "grid", placeItems: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--crm-surface)", border: "1px solid var(--crm-border)",
          borderRadius: "var(--crm-radius-lg)", padding: 24, width: 440,
          boxShadow: "var(--crm-shadow-pop)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--crm-fg)" }}>
          Log note
        </h3>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your note…"
          rows={5}
          style={{
            width: "100%", padding: "10px 12px", border: "1px solid var(--crm-border)",
            borderRadius: "var(--crm-radius-sm)", background: "var(--crm-surface-2)",
            fontSize: 13, fontFamily: "var(--crm-font-sans)", color: "var(--crm-fg)",
            outline: "none", resize: "vertical", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className="crm-btn ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="crm-btn primary"
            style={{ flex: 1, justifyContent: "center" }}
            disabled={!text.trim() || createNote.isPending}
            onClick={() => createNote.mutate({ leadId, content: text.trim() })}
          >
            {createNote.isPending ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Centered Lead Modal ───────────────────────────────────────────── */

function LeadModal({
  lead, onClose, onPrev, onNext,
}: {
  lead: Lead;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const name = fullNameOf(lead);
  const score = scoreOf(lead);
  const temp = tempOf(score);

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED" ? lead.callOutcome : null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const assignRef = useRef<HTMLDivElement | null>(null);

  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as string | undefined;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const { data: notes = [] } = trpc.leads.getNotes.useQuery({ leadId: lead.id });
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });

  const assignableUsers = isAdminOrManager
    ? (orgMembers ?? [])
    : (myTeam?.users ?? []);
  const canAssign = isAdminOrManager || (myTeam?.users ?? []).length > 0;

  const utils = trpc.useUtils();
  const updateOutcome = trpc.leads.updateCallOutcome.useMutation({
    onSuccess: () => {
      toast.success("Outcome saved");
      utils.leads.getAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const assignMutation = trpc.leads.assign.useMutation({
    onSuccess: () => {
      toast.success("Lead reassigned");
      setAssignOpen(false);
      utils.leads.getAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    setOutcome(lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED" ? lead.callOutcome : null);
    setOutcomeOpen(false);
  }, [lead.id, lead.callOutcome]);

  useEffect(() => {
    if (!outcomeOpen) return;
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOutcomeOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [outcomeOpen]);

  useEffect(() => {
    if (!assignOpen) return;
    const h = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setAssignOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [assignOpen]);

  const chooseOutcome = (id: string | null) => {
    setOutcome(id);
    setOutcomeOpen(false);
    updateOutcome.mutate({ id: lead.id, callOutcome: (id ?? "NOT_CONTACTED") as never });
  };

  const outcomeCfg = OUTCOMES.find((o) => o.id === outcome);

  return (
    <>
    {noteOpen && <LogNoteDialog leadId={lead.id} onClose={() => setNoteOpen(false)} />}
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal crm-app" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-head">
          <div className={`crm-avatar lg ${avatarClass(name)}`}>{initials(name)}</div>
          <div className="crm-modal-meta">
            <div className="crm-modal-name">
              {name}
              <TempPill temp={temp} />
            </div>
            <div className="crm-modal-sub">
              {[lead.company, lead.source].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <button className="crm-btn ghost icon" onClick={onClose} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>

        <div className="crm-modal-actions">
          {lead.phone && (
            <a className="crm-btn primary" href={`tel:${lead.phone}`}>
              <Phone size={13} /> Call
            </a>
          )}
          {lead.email && (
            <a className="crm-btn" href={`mailto:${lead.email}`}>
              <Mail size={13} /> Email
            </a>
          )}
          <button className="crm-btn" onClick={() => setNoteOpen(true)}><NotebookPen size={13} /> Log note</button>

          <div className="crm-outcome-wrap" ref={popRef}>
            <button
              type="button"
              className={`crm-btn crm-outcome-btn ${outcome ? "set" : ""}`}
              onClick={() => setOutcomeOpen((o) => !o)}
              aria-expanded={outcomeOpen}
            >
              <Phone size={13} />
              {outcome ? (
                <>
                  <span style={{ color: "var(--crm-fg-faint)" }}>Outcome:</span>
                  <span style={{ fontWeight: 500 }}>{outcomeCfg?.label}</span>
                </>
              ) : (
                <>Log outcome</>
              )}
              <span className="crm-outcome-caret"><ArrowDown size={10} /></span>
            </button>

            {outcomeOpen && (
              <div className="crm-outcome-pop" role="menu">
                <div className="crm-outcome-pop-head">Call outcome</div>
                {OUTCOMES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="menuitem"
                    className={`crm-outcome-item ${outcome === o.id ? "active" : ""}`}
                    onClick={() => chooseOutcome(o.id)}
                  >
                    <span className={`crm-outcome-dot t-${o.tone}`} />
                    <span className="lab">
                      <span className="t">{o.label}</span>
                      <span className="h">{o.hint}</span>
                    </span>
                    {outcome === o.id && <Check size={11} />}
                  </button>
                ))}
                {outcome && (
                  <button type="button" className="crm-outcome-clear" onClick={() => chooseOutcome(null)}>
                    Clear outcome
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="crm-btn ghost icon" title="Star"><Star size={14} /></button>
            <button className="crm-btn ghost icon" title="More"><MoreHorizontal size={14} /></button>
          </div>
        </div>

        <div className="crm-modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <h4>Details</h4>
              <div className="crm-kv">
                <span className="crm-k">Stage</span>
                <span className="crm-v"><StageTag status={lead.status} /></span>
                <span className="crm-k">Owner</span>
                <span className="crm-v">
                  {canAssign ? (
                    <div ref={assignRef} style={{ position: "relative", display: "inline-block" }}>
                      <button
                        type="button"
                        className="crm-btn ghost sm"
                        style={{ height: 22, padding: "0 7px", fontSize: 12, gap: 5 }}
                        onClick={() => setAssignOpen((o) => !o)}
                      >
                        {lead.assignedTo ? (
                          <>
                            <div className={`crm-avatar xs ${avatarClass(lead.assignedTo.name || "?")}`} style={{ width: 16, height: 16, fontSize: 8 }}>
                              {initials(lead.assignedTo.name || lead.assignedTo.email || "?")}
                            </div>
                            {lead.assignedTo.name || lead.assignedTo.email}
                          </>
                        ) : (
                          <span style={{ color: "var(--crm-fg-faint)" }}>Unassigned</span>
                        )}
                        <ArrowDown size={9} />
                      </button>
                      {assignOpen && (
                        <div
                          className="crm-card"
                          style={{
                            position: "absolute",
                            top: "calc(100% + 4px)",
                            left: 0,
                            minWidth: 180,
                            padding: 4,
                            zIndex: 80,
                            boxShadow: "0 6px 24px rgba(0,0,0,.25)",
                            borderRadius: "var(--crm-radius-md)",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {assignableUsers.map((u) => (
                            <button
                              key={u.id}
                              className="crm-nav-item"
                              style={{ borderRadius: "var(--crm-radius-sm)", fontSize: 12, width: "100%", textAlign: "left" }}
                              onClick={() => assignMutation.mutate({ leadIds: [lead.id], assigneeId: u.id })}
                            >
                              <div className={`crm-avatar xs ${avatarClass(u.name || "?")}`} style={{ width: 18, height: 18, fontSize: 9 }}>
                                {initials(u.name || u.email || "?")}
                              </div>
                              <span>{u.name || u.email}</span>
                            </button>
                          ))}
                          {lead.assignedToId && (
                            <>
                              <div style={{ height: 1, background: "var(--crm-border)", margin: "4px 6px" }} />
                              <button
                                className="crm-nav-item"
                                style={{ borderRadius: "var(--crm-radius-sm)", fontSize: 12, width: "100%", textAlign: "left", color: "var(--crm-fg-faint)" }}
                                onClick={() => assignMutation.mutate({ leadIds: [lead.id], assigneeId: null })}
                              >
                                Unassign
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    lead.assignedTo
                      ? (lead.assignedTo.name || lead.assignedTo.email)
                      : <span style={{ color: "var(--crm-fg-faint)" }}>Unassigned</span>
                  )}
                </span>
                <span className="crm-k">Source</span>
                <span className="crm-v">{lead.source || "—"}</span>
                {lead.email && (
                  <>
                    <span className="crm-k">Email</span>
                    <span className="crm-v" style={{ color: "var(--crm-accent-fg)" }}>{lead.email}</span>
                  </>
                )}
                {lead.phone && (
                  <>
                    <span className="crm-k">Phone</span>
                    <span className="crm-v" style={{ fontFamily: "var(--crm-font-mono)", fontSize: 12.5 }}>{lead.phone}</span>
                  </>
                )}
                {lead.website && (
                  <>
                    <span className="crm-k">Website</span>
                    <span className="crm-v" style={{ color: "var(--crm-accent-fg)" }}>{lead.website}</span>
                  </>
                )}
                <span className="crm-k">Created</span>
                <span className="crm-v" style={{ color: "var(--crm-fg-muted)" }}>
                  {new Date(lead.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div>
              <h4>Engagement</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 4 }}>Lead score</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ScoreBar score={score} temp={temp} />
                    <span style={{ fontSize: 12, color: "var(--crm-fg-muted)" }}>{tempLabel(temp)}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 4 }}>Last activity</div>
                  <span className="mono" style={{ fontFamily: "var(--crm-font-mono)", fontSize: 12, color: "var(--crm-fg-muted)" }}>
                    {relativeTime(lead.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4>Recent activity</h4>
            <div className="crm-timeline">
              <div className="crm-tl-row">
                <span className="ico"><NotebookPen size={11} /></span>
                <span className="body">Lead created from {lead.source || "manual entry"}</span>
                <span className="ts">{relativeTime(lead.createdAt)}</span>
              </div>
              {notes.map((n) => (
                <div key={n.id} className="crm-tl-row">
                  <span className="ico"><NotebookPen size={11} /></span>
                  <span className="body">{n.content}</span>
                  <span className="ts">{relativeTime(n.createdAt as unknown as string)}</span>
                </div>
              ))}
              {lead.callNotes && (
                <div className="crm-tl-row">
                  <span className="ico"><Phone size={11} /></span>
                  <span className="body">{lead.callNotes}</span>
                  <span className="ts">—</span>
                </div>
              )}
              <div className="crm-tl-row">
                <span className="ico"><Globe size={11} /></span>
                <span className="body">Stage: <StageTag status={lead.status} /></span>
                <span className="ts">now</span>
              </div>
            </div>
          </div>
        </div>

        <div className="crm-modal-foot">
          <div className="nav">
            <button className="crm-btn ghost sm icon" onClick={onPrev} title="Previous"><ChevronLeft size={12} /></button>
            <button className="crm-btn ghost sm icon" onClick={onNext} title="Next"><ChevronRight size={12} /></button>
            <span style={{ marginLeft: 6 }}>
              <span className="kb">↑</span><span className="kb">↓</span> to move · <span className="kb">Esc</span> close
            </span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/* ─── Add Lead Dialog (minimal, inline) ─────────────────────────────── */
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

/* ─── Main Leads Component ──────────────────────────────────────────── */
export function LeadsList() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [stageFilter, setStageFilter] = useState(new Set<string>());
  const [sortBy, setSortBy] = useState<{ key: keyof Lead | "score"; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [selected, setSelected] = useState(new Set<string>());
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as string | undefined;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const utils = trpc.useUtils();
  const { data: leads = [], isLoading } = trpc.leads.getAll.useQuery({
    search: debouncedSearch,
  });
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });
  const assignMutation = trpc.leads.assign.useMutation({
    onSuccess: () => {
      toast.success("Leads reassigned");
      setSelected(new Set());
      setShowAssign(false);
      utils.leads.getAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const assignableUsers = isAdminOrManager
    ? (orgMembers ?? [])
    : (myTeam?.users ?? []);
  const canAssign = isAdminOrManager || (myTeam?.users ?? []).length > 0;

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => { toast.success("Lead created"); setShowAdd(false); utils.leads.getAll.invalidate(); },
    onError:   (e) => toast.error(e.message),
  });
  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => { toast.success("Lead deleted"); utils.leads.getAll.invalidate(); },
    onError:   (e) => toast.error(e.message),
  });

  const allLeads = leads as Lead[];

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const k of STAGE_ORDER) c[k] = 0;
    for (const l of allLeads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [allLeads]);

  const filtered = useMemo(() => {
    let rows = allLeads.slice();
    if (stageFilter.size) rows = rows.filter((l) => stageFilter.has(l.status));
    rows.sort((a, b) => {
      const ak = sortBy.key === "score" ? scoreOf(a) : (a[sortBy.key as keyof Lead] ?? "");
      const bk = sortBy.key === "score" ? scoreOf(b) : (b[sortBy.key as keyof Lead] ?? "");
      const cmp = typeof ak === "number" && typeof bk === "number"
        ? ak - bk
        : String(ak).localeCompare(String(bk));
      return sortBy.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [allLeads, stageFilter, sortBy]);

  const toggleStage = (s: string) => {
    const next = new Set(stageFilter);
    next.has(s) ? next.delete(s) : next.add(s);
    setStageFilter(next);
  };

  const toggleSel = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((l) => l.id)));
  };

  const sortHeader = (label: string, key: keyof Lead | "score") => {
    const active = sortBy.key === key;
    const Icon = active ? (sortBy.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <th
        onClick={() => setSortBy((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {label}
          <span style={{ opacity: active ? 0.9 : 0.45, display: "inline-flex" }}><Icon size={11} /></span>
        </span>
      </th>
    );
  };

  // Modal keyboard navigation
  const idx = selectedLead ? filtered.findIndex((l) => l.id === selectedLead.id) : -1;
  const prev = () => idx > 0 && setSelectedLead(filtered[idx - 1]);
  const next = () => idx >= 0 && idx < filtered.length - 1 && setSelectedLead(filtered[idx + 1]);

  useEffect(() => {
    if (!selectedLead) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedLead(null);
      else if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); next(); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedLead, idx, filtered]);

  return (
    <>
      {showAdd && (
        <AddLeadForm
          onCancel={() => setShowAdd(false)}
          onSubmit={(data) => createLead.mutate({ ...data, source: "Manual" })}
        />
      )}

      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onPrev={prev}
          onNext={next}
        />
      )}

      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Leads</h1>
            <div className="crm-page-sub">
              {filtered.length} of {allLeads.length} leads · sorted by {sortBy.key}
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
                placeholder="Search leads, companies, notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="crm-divider-v" />
            <button
              className="crm-chip"
              aria-pressed={stageFilter.size === 0}
              onClick={() => setStageFilter(new Set())}
            >
              All <span className="crm-chip-count">{allLeads.length}</span>
            </button>
            {STAGE_ORDER.map((k) => (
              <button
                key={k}
                className="crm-chip"
                aria-pressed={stageFilter.has(k)}
                onClick={() => toggleStage(k)}
              >
                {STATUS_LABELS[k]?.label ?? k}
                <span className="crm-chip-count">{stageCounts[k] ?? 0}</span>
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="crm-btn ghost"><Filter size={13} /> Filters</button>
              <button className="crm-btn ghost"><Columns size={13} /> Columns</button>
              <button className="crm-btn ghost icon"><MoreVertical size={13} /></button>
            </div>
          </div>

          <table className="crm-table-v1">
            <thead>
              <tr>
                <th className="cb" onClick={(e) => e.stopPropagation()}>
                  <span className="crm-checkbox" data-checked={allSelected} onClick={toggleAll}>
                    {allSelected && <Check size={9} strokeWidth={2.6} />}
                  </span>
                </th>
                {sortHeader("Lead", "firstName")}
                {sortHeader("Company", "company")}
                <th>Owner</th>
                {sortHeader("Stage", "status")}
                {sortHeader("Score", "score")}
                <th>Touches</th>
                <th>Next action</th>
                {sortHeader("Last touch", "createdAt")}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
                    Loading leads…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
                    No leads found.
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => {
                  const name = fullNameOf(lead);
                  const checked = selected.has(lead.id);
                  const score = scoreOf(lead);
                  const temp = tempOf(score);
                  const touches = lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED" ? 1 : 0;
                  return (
                    <tr
                      key={lead.id}
                      className={checked ? "selected" : ""}
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="cb" onClick={(e) => { e.stopPropagation(); toggleSel(lead.id); }}>
                        <span className="crm-checkbox" data-checked={checked}>
                          {checked && <Check size={9} strokeWidth={2.6} />}
                        </span>
                      </td>
                      <td>
                        <div className="crm-contact">
                          <div className={`crm-avatar sm ${avatarClass(name)}`}>
                            {initials(name)}
                          </div>
                          <div className="crm-meta">
                            <span className="crm-n">{name}</span>
                            {lead.email && <span className="crm-c">{lead.email}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ color: "var(--crm-fg)" }}>{lead.company || "—"}</span>
                          {lead.source && (
                            <span style={{ color: "var(--crm-fg-faint)", fontSize: 11.5 }}>{lead.source}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {lead.assignedTo ? (
                          <div className="crm-contact" title={lead.assignedTo.name || lead.assignedTo.email || ""}>
                            <div className={`crm-avatar xs ${avatarClass(lead.assignedTo.name || "?")}`}>
                              {initials(lead.assignedTo.name || lead.assignedTo.email || "?")}
                            </div>
                            <span style={{ fontSize: 12 }}>{lead.assignedTo.name || lead.assignedTo.email || "—"}</span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>Unassigned</span>
                        )}
                      </td>
                      <td><StageTag status={lead.status} /></td>
                      <td><ScoreBar score={score} temp={temp} /></td>
                      <td><Touches n={touches} /></td>
                      <td>
                        <NextActionChip
                          label={lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED" ? "Follow up" : "First outreach"}
                          state={lead.status === "CONNECTED" ? "today" : "upcoming"}
                        />
                      </td>
                      <td className="mono">{relativeTime(lead.createdAt)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className="crm-btn ghost sm icon"
                          title="Delete"
                          onClick={() => {
                            if (confirm("Delete this lead?")) deleteLead.mutate({ id: lead.id });
                          }}
                        >
                          <MoreHorizontal size={13} />
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
          <div className="crm-selbar" style={{ position: "relative" }}>
            <span>{selected.size} selected</span>
            <button
              className="crm-pill-btn"
              disabled={!canAssign}
              title={canAssign ? "Reassign selected leads" : "Only team leaders or admins can reassign"}
              onClick={() => setShowAssign((v) => !v)}
            >
              Assign
            </button>
            <button className="crm-pill-btn">Change stage</button>
            <button className="crm-pill-btn">Sequence</button>
            <button className="crm-pill-btn" onClick={() => setSelected(new Set())}>Clear</button>

            {showAssign && (
              <div
                className="crm-card"
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: 90,
                  minWidth: 220,
                  padding: 4,
                  zIndex: 50,
                  boxShadow: "0 6px 24px rgba(0,0,0,.25)",
                  borderRadius: "var(--crm-radius-md)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--crm-fg-faint)", textTransform: "uppercase" }}>
                  Assign to
                </div>
                {assignableUsers.map((u) => (
                  <button
                    key={u.id}
                    className="crm-nav-item"
                    style={{ borderRadius: "var(--crm-radius-sm)", fontSize: 13, width: "100%", textAlign: "left" }}
                    onClick={() =>
                      assignMutation.mutate({ leadIds: Array.from(selected), assigneeId: u.id })
                    }
                  >
                    <div className={`crm-avatar xs ${avatarClass(u.name || "?")}`}>
                      {initials(u.name || u.email || "?")}
                    </div>
                    <span>{u.name || u.email}</span>
                  </button>
                ))}
                <div style={{ height: 1, background: "var(--crm-border)", margin: "4px 6px" }} />
                <button
                  className="crm-nav-item"
                  style={{ borderRadius: "var(--crm-radius-sm)", fontSize: 13, width: "100%", textAlign: "left", color: "var(--crm-fg-faint)" }}
                  onClick={() =>
                    assignMutation.mutate({ leadIds: Array.from(selected), assigneeId: null })
                  }
                >
                  Unassign
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
