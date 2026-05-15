"use client";

import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DetailsCard,
  EngagementCard,
  LeadHeader,
  LeadTabs,
  PeopleCard,
  PipelineTracker,
  type ActivityRow,
  type CustomOutcomeOption,
} from "./lead-workspace";
import { scoreOf, type Lead, type LeadNote } from "./shared";

type LeadModalProps = {
  lead: Lead;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

function pipelineIndexForStatus(status: string) {
  if (status === "CONNECTED" || status === "ANSWERED") return 2;
  if (status === "AI_VOICEMAIL") return 1;
  if (status === "NO_ANSWER" || status === "HUNG_UP") return 1;
  if (status === "CLOSED_WON") return 5;
  return 0;
}

export function LeadModal({ lead, onClose, onPrev, onNext }: LeadModalProps) {
  const utils = trpc.useUtils();
  const [starred, setStarred] = useState(Boolean(lead.starred));
  const [temperatureOverride, setTemperatureOverride] = useState<
    NonNullable<Lead["temperatureOverride"]> | ""
  >(lead.temperatureOverride ?? "");
  const [composerText, setComposerText] = useState("");
  const [outcome, setOutcome] = useState(lead.callOutcome ?? "NOT_CONTACTED");

  const { data: activitiesRaw = [] } = trpc.leads.getActivities.useQuery({ leadId: lead.id });
  const { data: notesRaw = [] } = trpc.leads.getNotes.useQuery({ leadId: lead.id });
  const { data: customOutcomesRaw = [] } = trpc.leads.customOutcomes.list.useQuery(undefined, {
    staleTime: 30_000,
  });

  const activities = activitiesRaw as ActivityRow[];
  const notes = notesRaw as LeadNote[];
  const customOutcomes = customOutcomesRaw as CustomOutcomeOption[];
  const leadForDisplay = useMemo<Lead>(
    () => ({
      ...lead,
      starred,
      temperatureOverride: temperatureOverride || null,
      callOutcome: outcome,
    }),
    [lead, outcome, starred, temperatureOverride],
  );
  const score = scoreOf(leadForDisplay);

  const toggleStar = trpc.leads.toggleStar.useMutation({
    onMutate: () => setStarred((current) => !current),
    onSuccess: (updated) => {
      setStarred(Boolean(updated.starred));
      void utils.leads.getAll.invalidate();
    },
    onError: () => {
      setStarred((current) => !current);
      toast.error("Failed to update favorite");
    },
  });

  const createNote = trpc.leads.createNote.useMutation({
    onSuccess: () => {
      toast.success("Note saved");
      setComposerText("");
      void utils.leads.getNotes.invalidate({ leadId: lead.id });
      void utils.leads.getActivities.invalidate({ leadId: lead.id });
    },
    onError: (error) => toast.error(error.message),
  });

  const updateTemperatureOverride = trpc.leads.updateTemperatureOverride.useMutation({
    onSuccess: () => {
      toast.success("Temperature updated");
      void utils.leads.getAll.invalidate();
      void utils.leads.getActivities.invalidate({ leadId: lead.id });
    },
    onError: (error) => {
      setTemperatureOverride(lead.temperatureOverride ?? "");
      toast.error(error.message);
    },
  });

  const updateOutcome = trpc.leads.updateCallOutcome.useMutation({
    onSuccess: () => {
      toast.success("Outcome saved");
      void utils.leads.getAll.invalidate();
      void utils.leads.getActivities.invalidate({ leadId: lead.id });
    },
    onError: (error) => {
      setOutcome(lead.callOutcome ?? "NOT_CONTACTED");
      toast.error(error.message);
    },
  });

  const handleTemperatureChange = (nextValue: string) => {
    const temperature = nextValue as "HOT" | "WARM" | "COOL" | "";
    setTemperatureOverride(temperature);
    updateTemperatureOverride.mutate({
      id: lead.id,
      temperatureOverride: temperature || null,
    });
  };

  const handleOutcomeChange = (nextOutcome: string, customOutcomeId?: string) => {
    setOutcome(nextOutcome);
    updateOutcome.mutate({
      id: lead.id,
      callOutcome: nextOutcome as never,
      customOutcomeId,
    });
  };

  return (
    <>
      {noteOpen ? <LogNoteDialog leadId={lead.id} onClose={() => setNoteOpen(false)} /> : null}
      {websiteGenOpen && (
        <WebsiteGeneratorDialog
          open={websiteGenOpen}
          onClose={() => setWebsiteGenOpen(false)}
          leadId={lead.id}
          leadName={name}
        />
      )}
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
            <button className="crm-btn" onClick={() => setWebsiteGenOpen(true)} title="Generate website for this lead">
              <Globe size={13} /> Website
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
                        {score} · {tempLabel(temp)}
                      </span>
                      {breakdown.length > 0 && (
                        <button
                          className="crm-btn ghost"
                          style={{ fontSize: 11, height: 22, padding: "0 6px", marginLeft: "auto" }}
                          onClick={() => setShowScoreBreakdown((v) => !v)}
                        >
                          {showScoreBreakdown ? "Hide" : "Why?"}
                        </button>
                      )}
                    </div>
                    {showScoreBreakdown && breakdown.length > 0 && (
                      <div style={{
                        marginTop: 8,
                        background: "var(--crm-surface-hover)",
                        borderRadius: 6,
                        padding: "8px 10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}>
                        {breakdown.map((item) => (
                          <div key={item.factor} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color: "var(--crm-fg-faint)" }}>{item.label}</span>
                            <span style={{
                              fontWeight: 500,
                              color: item.points > 0 ? "var(--crm-fg)" : item.points < 0 ? "oklch(64% 0.18 25)" : "var(--crm-fg-faint)",
                            }}>
                              {item.points > 0 ? "+" : ""}{item.points} / {item.maxPoints}
                            </span>
                          </div>
                        ))}
                        <div style={{ borderTop: "1px solid var(--crm-border)", marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                          <span>Total</span>
                          <span>{score} / 100</span>
                        </div>
                      </div>
                    )}
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

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-4 p-4 md:p-6 lg:p-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={onPrev} aria-label="Previous lead">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={onNext} aria-label="Next lead">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>

          <LeadHeader
            lead={leadForDisplay}
            score={score}
            starred={starred}
            onToggleStar={() => toggleStar.mutate({ id: lead.id })}
            onOutcomeChange={handleOutcomeChange}
            customOutcomes={customOutcomes}
            outcome={outcome}
          />
          <PipelineTracker activeIndex={pipelineIndexForStatus(leadForDisplay.status)} />

          <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <LeadTabs
              activities={activities}
              notes={notes}
              lead={leadForDisplay}
              composerText={composerText}
              onComposerTextChange={setComposerText}
              onPostNote={handlePostNote}
              isPosting={createNote.isPending}
            />
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <DetailsCard lead={leadForDisplay} />
              <EngagementCard
                lead={leadForDisplay}
                score={score}
                temperatureOverride={temperatureOverride}
                onTemperatureChange={handleTemperatureChange}
                isUpdatingTemperature={updateTemperatureOverride.isPending}
              />
              <PeopleCard lead={leadForDisplay} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
