"use client";

import { trpc } from "@/app/_trpc/client";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Mail,
  MoreHorizontal,
  NotebookPen,
  Phone,
  Star,
  X,
} from "lucide-react";
import {
  avatarClass,
  effectiveTempOf,
  fullNameOf,
  initials,
  normalizeWebsiteHref,
  outcomeLabel,
  OUTCOMES,
  relativeTime,
  reviewSummary,
  scoreOf,
  SessionUser,
  tempLabel,
  type AssignableUser,
  type Lead,
  type LeadNote,
} from "./shared";
import { ScoreBar, StageTag, TempPill } from "./LeadUi";

function LogNoteDialog({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const utils = trpc.useUtils();
  const createNote = trpc.leads.createNote.useMutation({
    onSuccess: () => {
      toast.success("Note saved");
      void utils.leads.getNotes.invalidate({ leadId });
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(15% 0.012 70 / 0.45)",
        backdropFilter: "blur(2px)",
        zIndex: 70,
        display: "grid",
        placeItems: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--crm-surface)",
          border: "1px solid var(--crm-border)",
          borderRadius: "var(--crm-radius-lg)",
          padding: 24,
          width: 440,
          boxShadow: "var(--crm-shadow-pop)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3
          style={{
            margin: "0 0 14px",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--crm-fg)",
          }}
        >
          Log note
        </h3>
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your note..."
          rows={5}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--crm-border)",
            borderRadius: "var(--crm-radius-sm)",
            background: "var(--crm-surface-2)",
            fontSize: 13,
            fontFamily: "var(--crm-font-sans)",
            color: "var(--crm-fg)",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            className="crm-btn ghost"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="crm-btn primary"
            style={{ flex: 1, justifyContent: "center" }}
            disabled={!text.trim() || createNote.isPending}
            onClick={() => createNote.mutate({ leadId, content: text.trim() })}
          >
            {createNote.isPending ? "Saving..." : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}

type LeadModalProps = {
  lead: Lead;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export function LeadModal({ lead, onClose, onPrev, onNext }: LeadModalProps) {
  const name = fullNameOf(lead);
  const score = scoreOf(lead);
  const temp = effectiveTempOf(lead);
  const websiteHref = normalizeWebsiteHref(lead.website);
  const reviews = reviewSummary(lead);

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(
    lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED"
      ? lead.callOutcome
      : null,
  );
  const [customOutcomeId, setCustomOutcomeId] = useState<string | null>(
    lead.customOutcome?.id ?? null,
  );
  const [addingOutcome, setAddingOutcome] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newHint, setNewHint] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const assignRef = useRef<HTMLDivElement | null>(null);

  const { data: session } = useSession();
  const userRole = (session?.user as SessionUser | undefined)?.role;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const { data: notesRaw } = trpc.leads.getNotes.useQuery({ leadId: lead.id });
  const notes: LeadNote[] = (notesRaw ?? []) as LeadNote[];
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });

  const assignableUsers: AssignableUser[] = (isAdminOrManager
    ? (orgMembers ?? [])
    : (myTeam?.users ?? [])) as AssignableUser[];
  const canAssign = isAdminOrManager || (myTeam?.users ?? []).length > 0;

  const utils = trpc.useUtils();
  const updateOutcome = trpc.leads.updateCallOutcome.useMutation({
    onSuccess: () => {
      toast.success("Outcome saved");
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const { data: customOutcomes = [] } = trpc.leads.customOutcomes.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const createCustomOutcome = trpc.leads.customOutcomes.create.useMutation({
    onSuccess: (created) => {
      toast.success("Outcome added");
      setAddingOutcome(false);
      setNewLabel("");
      setNewHint("");
      setOutcome("CUSTOM");
      setCustomOutcomeId(created.id);
      setOutcomeOpen(false);
      void utils.leads.customOutcomes.list.invalidate();
      updateOutcome.mutate({ id: lead.id, callOutcome: "CUSTOM" as never, customOutcomeId: created.id });
    },
    onError: (e) => toast.error(e.message),
  });
  const updateTemperatureOverride = trpc.leads.updateTemperatureOverride.useMutation({
    onSuccess: () => {
      toast.success("Temperature updated");
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const assignMutation = trpc.leads.assign.useMutation({
    onSuccess: () => {
      toast.success("Lead reassigned");
      setAssignOpen(false);
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteNote = trpc.leads.deleteNote.useMutation({
    onSuccess: () => {
      toast.success("Note deleted");
      void utils.leads.getNotes.invalidate({ leadId: lead.id });
    },
    onError: (error) => toast.error(error.message),
  });
  const [starred, setStarred] = useState(lead.starred ?? false);
  const toggleStar = trpc.leads.toggleStar.useMutation({
    onMutate: () => setStarred((s) => !s),
    onSuccess: (updated) => {
      setStarred(updated.starred);
      void utils.leads.getAll.invalidate();
    },
    onError: () => {
      setStarred((s) => !s);
      toast.error("Failed to update star");
    },
  });
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  useEffect(() => {
    if (!outcomeOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOutcomeOpen(false);
        setAddingOutcome(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [outcomeOpen]);

  useEffect(() => {
    setOutcome(
      lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED"
        ? lead.callOutcome
        : null,
    );
    setCustomOutcomeId(lead.customOutcome?.id ?? null);
  }, [lead.callOutcome, lead.id, lead.customOutcome?.id]);

  useEffect(() => {
    if (!assignOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(event.target as Node)) {
        setAssignOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [assignOpen]);

  const chooseOutcome = (nextOutcome: string | null, nextCustomId: string | null = null) => {
    setOutcome(nextOutcome);
    setCustomOutcomeId(nextCustomId);
    setOutcomeOpen(false);
    setAddingOutcome(false);
    updateOutcome.mutate({
      id: lead.id,
      callOutcome: (nextOutcome ?? "NOT_CONTACTED") as never,
      customOutcomeId: nextCustomId ?? undefined,
    });
  };

  return (
    <>
      {noteOpen ? <LogNoteDialog leadId={lead.id} onClose={() => setNoteOpen(false)} /> : null}
      <div className="crm-modal-backdrop" onClick={onClose}>
        <div className="crm-modal crm-app" onClick={(event) => event.stopPropagation()}>
          <div className="crm-modal-head">
            <div className={`crm-avatar lg ${avatarClass(name)}`}>{initials(name)}</div>
            <div className="crm-modal-meta">
              <div className="crm-modal-name">
                {name}
                <TempPill temp={temp} />
              </div>
              <div className="crm-modal-sub">
                {[lead.company, lead.source].filter(Boolean).join(" · ") || "-"}
              </div>
            </div>
            <button className="crm-btn ghost icon" onClick={onClose} title="Close (Esc)">
              <X size={14} />
            </button>
          </div>

          <div className="crm-modal-actions">
            {lead.phone ? (
              <a className="crm-btn primary" href={`tel:${lead.phone}`}>
                <Phone size={13} /> Call
              </a>
            ) : null}
            {lead.email ? (
              <a className="crm-btn" href={`mailto:${lead.email}`}>
                <Mail size={13} /> Email
              </a>
            ) : null}
            <button className="crm-btn" onClick={() => setNoteOpen(true)}>
              <NotebookPen size={13} /> Log note
            </button>

            <div className="crm-outcome-wrap" ref={popoverRef}>
              <button
                type="button"
                className={`crm-btn crm-outcome-btn ${outcome ? "set" : ""}`}
                onClick={() => setOutcomeOpen((value) => !value)}
                aria-expanded={outcomeOpen}
              >
                <Phone size={13} />
                {outcome ? (
                  <>
                    <span style={{ color: "var(--crm-fg-faint)" }}>Outcome:</span>
                    <span style={{ fontWeight: 500 }}>{outcomeLabel(lead)}</span>
                  </>
                ) : (
                  <>Log outcome</>
                )}
                <span className="crm-outcome-caret">
                  <ArrowDown size={10} />
                </span>
              </button>

              {outcomeOpen ? (
                <div className="crm-outcome-pop" role="menu">
                  <div className="crm-outcome-pop-head">Call outcome</div>
                  {OUTCOMES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={`crm-outcome-item ${outcome === item.id ? "active" : ""}`}
                      onClick={() => chooseOutcome(item.id)}
                    >
                      <span className={`crm-outcome-dot t-${item.tone}`} />
                      <span className="lab">
                        <span className="t">{item.label}</span>
                        <span className="h">{item.hint}</span>
                      </span>
                      {outcome === item.id ? <Check size={11} /> : null}
                    </button>
                  ))}
                  {customOutcomes.length > 0 ? (
                    <div style={{ borderTop: "1px solid var(--crm-border)", margin: "4px 0" }} />
                  ) : null}
                  {customOutcomes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={`crm-outcome-item ${outcome === "CUSTOM" && customOutcomeId === item.id ? "active" : ""}`}
                      onClick={() => chooseOutcome("CUSTOM", item.id)}
                    >
                      <span className="crm-outcome-dot t-cool" />
                      <span className="lab">
                        <span className="t">{item.label}</span>
                        {item.hint ? <span className="h">{item.hint}</span> : null}
                      </span>
                      {outcome === "CUSTOM" && customOutcomeId === item.id ? <Check size={11} /> : null}
                    </button>
                  ))}
                  {outcome ? (
                    <button
                      type="button"
                      className="crm-outcome-clear"
                      onClick={() => chooseOutcome(null)}
                    >
                      Clear outcome
                    </button>
                  ) : null}
                  {addingOutcome ? (
                    <div style={{ padding: "8px 10px", borderTop: "1px solid var(--crm-border)" }}>
                      <input
                        autoFocus
                        placeholder="Label (e.g. Left message)"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newLabel.trim()) {
                            createCustomOutcome.mutate({ label: newLabel.trim(), hint: newHint.trim() || undefined });
                          }
                          if (e.key === "Escape") setAddingOutcome(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "5px 8px",
                          border: "1px solid var(--crm-border)",
                          borderRadius: "var(--crm-radius-sm)",
                          background: "var(--crm-surface-2)",
                          fontSize: 12,
                          color: "var(--crm-fg)",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <input
                        placeholder="Hint (optional)"
                        value={newHint}
                        onChange={(e) => setNewHint(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") setAddingOutcome(false); }}
                        style={{
                          width: "100%",
                          marginTop: 5,
                          padding: "5px 8px",
                          border: "1px solid var(--crm-border)",
                          borderRadius: "var(--crm-radius-sm)",
                          background: "var(--crm-surface-2)",
                          fontSize: 12,
                          color: "var(--crm-fg)",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                        <button
                          type="button"
                          className="crm-btn ghost"
                          style={{ fontSize: 11, padding: "3px 8px" }}
                          onClick={() => setAddingOutcome(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="crm-btn primary"
                          style={{ fontSize: 11, padding: "3px 8px" }}
                          disabled={!newLabel.trim() || createCustomOutcome.isPending}
                          onClick={() => createCustomOutcome.mutate({ label: newLabel.trim(), hint: newHint.trim() || undefined })}
                        >
                          {createCustomOutcome.isPending ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="crm-outcome-clear"
                      style={{ color: "var(--crm-accent-fg, var(--crm-fg-faint))" }}
                      onClick={() => setAddingOutcome(true)}
                    >
                      + Add outcome
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button
                className="crm-btn ghost icon"
                title={starred ? "Unstar" : "Star"}
                onClick={() => toggleStar.mutate({ id: lead.id })}
                disabled={toggleStar.isPending}
              >
                <Star
                  size={14}
                  fill={starred ? "currentColor" : "none"}
                  style={{ color: starred ? "#f59e0b" : undefined }}
                />
              </button>
              <button className="crm-btn ghost icon" title="More">
                <MoreHorizontal size={14} />
              </button>
            </div>
          </div>

          <div className="crm-modal-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <div>
                <h4>Details</h4>
                <div className="crm-kv">
                  <span className="crm-k">Stage</span>
                  <span className="crm-v">
                    <StageTag status={lead.status} />
                  </span>
                  <span className="crm-k">Owner</span>
                  <span className="crm-v">
                    {canAssign ? (
                      <div ref={assignRef} style={{ position: "relative", display: "inline-block" }}>
                        <button
                          type="button"
                          className="crm-btn ghost sm"
                          style={{ height: 22, padding: "0 7px", fontSize: 12, gap: 5 }}
                          onClick={() => setAssignOpen((value) => !value)}
                        >
                          {lead.assignedTo ? (
                            <>
                              <div
                                className={`crm-avatar xs ${avatarClass(lead.assignedTo.name || "?")}`}
                                style={{ width: 16, height: 16, fontSize: 8 }}
                              >
                                {initials(lead.assignedTo.name || lead.assignedTo.email || "?")}
                              </div>
                              {lead.assignedTo.name || lead.assignedTo.email}
                            </>
                          ) : (
                            <span style={{ color: "var(--crm-fg-faint)" }}>Unassigned</span>
                          )}
                          <ArrowDown size={9} />
                        </button>
                        {assignOpen ? (
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
                            onClick={(event) => event.stopPropagation()}
                          >
                            {assignableUsers.map((user) => (
                              <button
                                key={user.id}
                                className="crm-nav-item"
                                style={{
                                  borderRadius: "var(--crm-radius-sm)",
                                  fontSize: 12,
                                  width: "100%",
                                  textAlign: "left",
                                }}
                                onClick={() =>
                                  assignMutation.mutate({ leadIds: [lead.id], assigneeId: user.id })
                                }
                              >
                                <div
                                  className={`crm-avatar xs ${avatarClass(user.name || "?")}`}
                                  style={{ width: 18, height: 18, fontSize: 9 }}
                                >
                                  {initials(user.name || user.email || "?")}
                                </div>
                                <span>{user.name || user.email}</span>
                              </button>
                            ))}
                            {lead.assignedToId ? (
                              <>
                                <div
                                  style={{
                                    height: 1,
                                    background: "var(--crm-border)",
                                    margin: "4px 6px",
                                  }}
                                />
                                <button
                                  className="crm-nav-item"
                                  style={{
                                    borderRadius: "var(--crm-radius-sm)",
                                    fontSize: 12,
                                    width: "100%",
                                    textAlign: "left",
                                    color: "var(--crm-fg-faint)",
                                  }}
                                  onClick={() =>
                                    assignMutation.mutate({ leadIds: [lead.id], assigneeId: null })
                                  }
                                >
                                  Unassign
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : lead.assignedTo ? (
                      lead.assignedTo.name || lead.assignedTo.email
                    ) : (
                      <span style={{ color: "var(--crm-fg-faint)" }}>Unassigned</span>
                    )}
                  </span>
                  <span className="crm-k">Source</span>
                  <span className="crm-v">{lead.source || "-"}</span>
                  {lead.email ? (
                    <>
                      <span className="crm-k">Email</span>
                      <span className="crm-v" style={{ color: "var(--crm-accent-fg)" }}>
                        {lead.email}
                      </span>
                    </>
                  ) : null}
                  {lead.phone ? (
                    <>
                      <span className="crm-k">Phone</span>
                      <span
                        className="crm-v"
                        style={{ fontFamily: "var(--crm-font-mono)", fontSize: 12.5 }}
                      >
                        {lead.phone}
                      </span>
                    </>
                  ) : null}
                  {lead.website ? (
                    <>
                      <span className="crm-k">Website</span>
                      <span className="crm-v" style={{ color: "var(--crm-accent-fg)" }}>
                        {websiteHref ? (
                          <a href={websiteHref} target="_blank" rel="noopener noreferrer">
                            {lead.website}
                          </a>
                        ) : (
                          lead.website
                        )}
                      </span>
                    </>
                  ) : null}
                  {reviews ? (
                    <>
                      <span className="crm-k">Reviews</span>
                      <span className="crm-v">{reviews}</span>
                    </>
                  ) : null}
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
                    <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 4 }}>
                      Lead score
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <ScoreBar score={score} temp={temp} />
                      <span style={{ fontSize: 12, color: "var(--crm-fg-muted)" }}>
                        {tempLabel(temp)}
                      </span>
                    </div>
                    {reviews ? (
                      <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)", marginTop: 6 }}>
                        {reviews}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 4 }}>
                      Temperature
                    </div>
                    <select
                      aria-label="Temperature override"
                      value={lead.temperatureOverride ?? ""}
                      disabled={updateTemperatureOverride.isPending}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid var(--crm-border)",
                        borderRadius: "var(--crm-radius-sm)",
                        background: "var(--crm-surface-2)",
                        color: "var(--crm-fg)",
                        fontSize: 12.5,
                      }}
                      onChange={(event) =>
                        updateTemperatureOverride.mutate({
                          id: lead.id,
                          temperatureOverride: (event.target.value || null) as
                            | "HOT"
                            | "WARM"
                            | "COOL"
                            | null,
                        })
                      }
                    >
                      <option value="">Auto</option>
                      <option value="HOT">Hot</option>
                      <option value="WARM">Warm</option>
                      <option value="COOL">Cool</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 4 }}>
                      Last activity
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontFamily: "var(--crm-font-mono)",
                        fontSize: 12,
                        color: "var(--crm-fg-muted)",
                      }}
                    >
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
                  <span className="ico">
                    <NotebookPen size={11} />
                  </span>
                  <span className="body">Lead created from {lead.source || "manual entry"}</span>
                  <span className="ts">{relativeTime(lead.createdAt)}</span>
                </div>
                {notes.map((note) => (
                  <div key={note.id} className="crm-tl-row" style={{ alignItems: "flex-start" }}>
                    <span className="ico">
                      <NotebookPen size={11} />
                    </span>
                    <span className="body">{note.content}</span>
                    <span className="ts">{relativeTime(note.createdAt)}</span>
                    {(note.userId === currentUserId || isAdminOrManager) && (
                      <button
                        title="Delete note"
                        style={{ marginLeft: 4, opacity: 0.5, lineHeight: 1, flexShrink: 0 }}
                        onClick={() => deleteNote.mutate({ noteId: note.id })}
                        disabled={deleteNote.isPending}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                ))}
                {lead.callNotes ? (
                  <div className="crm-tl-row">
                    <span className="ico">
                      <Phone size={11} />
                    </span>
                    <span className="body">{lead.callNotes}</span>
                    <span className="ts">-</span>
                  </div>
                ) : null}
                <div className="crm-tl-row">
                  <span className="ico">
                    <Globe size={11} />
                  </span>
                  <span className="body">
                    Stage: <StageTag status={lead.status} />
                  </span>
                  <span className="ts">now</span>
                </div>
              </div>
            </div>
          </div>

          <div className="crm-modal-foot">
            <div className="nav">
              <button className="crm-btn ghost sm icon" onClick={onPrev} title="Previous">
                <ChevronLeft size={12} />
              </button>
              <button className="crm-btn ghost sm icon" onClick={onNext} title="Next">
                <ChevronRight size={12} />
              </button>
              <span style={{ marginLeft: 6 }}>
                <span className="kb">↑</span>
                <span className="kb">↓</span> to move · <span className="kb">Esc</span> close
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
