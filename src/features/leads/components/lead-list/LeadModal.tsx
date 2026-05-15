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
  scoreBreakdown,
  scoreOf,
  SessionUser,
  tempLabel,
  type AssignableUser,
  type Lead,
  type LeadNote,
  type ScoringRuleConfig,
} from "./shared";
import { ScoreBar, StageTag, TempPill } from "./LeadUi";
import { WebsiteGeneratorDialog } from "@/features/websites/components/WebsiteGeneratorDialog";

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
  const websiteHref = normalizeWebsiteHref(lead.website);
  const reviews = reviewSummary(lead);

  const { data: rawRules } = trpc.scoring.getRules.useQuery(undefined, { staleTime: 300_000 });
  const rules = (rawRules ?? []) as unknown as ScoringRuleConfig[];
  const score = scoreOf(lead, rules.length > 0 ? rules : undefined);
  const temp = effectiveTempOf(lead);
  const breakdown = rules.length > 0 ? scoreBreakdown(lead, rules.filter((r) => r.isActive)) : [];

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
  const [websiteGenOpen, setWebsiteGenOpen] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
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

  const handlePostNote = () => {
    const content = composerText.trim();
    if (!content || createNote.isPending) return;
    createNote.mutate({ leadId: lead.id, content });
  };

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
