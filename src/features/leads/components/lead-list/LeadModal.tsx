"use client";

import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { ScriptsPanel } from "@/features/scripts/components/ScriptsPanel";
import { EmailDraftPanel } from "@/features/emails/components/EmailDraftPanel";
import { SmsDraftPanel } from "@/features/sms/components/SmsDraftPanel";
import { formatLocation, getMapsUrl } from "@/features/leads/location";
import { formatPhone } from "@/lib/phone";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { DIALER_ENABLED, SCRIPTS_ENABLED, TRAINER_ENABLED } from "@/lib/features";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { type CSSProperties, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Mail,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  SquareCheck,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
  ExternalLink,
  Download,
  Dumbbell,
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
  type ScoringRuleConfig,
} from "./shared";
import { ScoreBar, StageTag, TempPill } from "./LeadUi";
import { EditLeadDialog } from "./EditLeadDialog";

type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

// Shared style for the inline add/edit custom-outcome inputs.
const outcomeInputStyle: CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  border: "1px solid var(--crm-border)",
  borderRadius: "var(--crm-radius-sm)",
  background: "var(--crm-surface-2)",
  fontSize: 12,
  color: "var(--crm-fg)",
  outline: "none",
  boxSizing: "border-box",
};

function taskDueDateParts(task: { id: string; dueDate: Date | string }) {
  const { dueDate } = task;
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
    label: parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: parsed.getTime(),
  };
}

function LogNoteDialog({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  useBodyScrollLock();
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
        background: "var(--crm-overlay)",
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

function ViewNotesDialog({
  notes,
  currentUserId,
  isAdminOrManager,
  leadId,
  onClose,
  onAddNote,
}: {
  notes: LeadNote[];
  currentUserId: string | undefined;
  isAdminOrManager: boolean;
  leadId: string;
  onClose: () => void;
  onAddNote: () => void;
}) {
  useBodyScrollLock();
  const utils = trpc.useUtils();
  const deleteNote = trpc.leads.deleteNote.useMutation({
    onSuccess: () => {
      toast.success("Note deleted");
      void utils.leads.getNotes.invalidate({ leadId });
    },
    onError: (error) => toast.error(error.message),
  });

  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--crm-overlay)",
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
          padding: 0,
          width: 480,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--crm-shadow-pop)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--crm-border)",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--crm-fg)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <NotebookPen size={14} />
            Notes ({sorted.length})
          </h3>
          <button
            type="button"
            className="crm-btn ghost icon"
            onClick={onClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            overflowY: "auto",
            padding: "8px 4px",
            flex: 1,
            minHeight: 80,
          }}
        >
          {sorted.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "var(--crm-fg-faint)",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              No notes yet.
            </div>
          ) : (
            sorted.map((note) => {
              const canDelete =
                (currentUserId && note.userId === currentUserId) || isAdminOrManager;
              const author = note.user?.name || note.user?.email || "Unknown";
              return (
                <div
                  key={note.id}
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--crm-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--crm-fg-faint)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontWeight: 500, color: "var(--crm-fg-muted)" }}>
                        {author}
                      </span>
                      <span>·</span>
                      <span>{relativeTime(note.createdAt)}</span>
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        title="Delete note"
                        style={{
                          opacity: 0.5,
                          lineHeight: 1,
                          flexShrink: 0,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--crm-fg-faint)",
                          padding: 2,
                        }}
                        onClick={() => deleteNote.mutate({ noteId: note.id })}
                        disabled={deleteNote.isPending}
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--crm-fg)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {note.content}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "12px 20px",
            borderTop: "1px solid var(--crm-border)",
          }}
        >
          <button
            type="button"
            className="crm-btn ghost"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="crm-btn primary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={onAddNote}
          >
            <NotebookPen size={13} /> Add note
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptsDialog({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--crm-overlay)",
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
          padding: 0,
          width: 720,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--crm-shadow-pop)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--crm-border)",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--crm-fg)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <BookOpen size={14} />
            Scripts
          </h3>
          <button type="button" className="crm-btn ghost icon" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, minHeight: 80, padding: 20 }}>
          <ScriptsPanel />
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--crm-border)",
          }}
        >
          <button
            type="button"
            className="crm-btn ghost"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={onClose}
          >
            Close
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
  useBodyScrollLock();
  const name = fullNameOf(lead);
  const temp = effectiveTempOf(lead);
  const websiteHref = normalizeWebsiteHref(lead.website);
  const reviews = reviewSummary(lead);
  const location = formatLocation(lead.city, lead.state);
  const resolvedMapsUrl = getMapsUrl(lead);

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
  const [editingOutcomeId, setEditingOutcomeId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editHint, setEditHint] = useState("");
  const [confirmDeleteOutcome, setConfirmDeleteOutcome] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionId, setDispositionId] = useState<string | null>(
    lead.secondaryOutcome?.id ?? null,
  );
  const dispositionRef = useRef<HTMLDivElement | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewNotesOpen, setViewNotesOpen] = useState(false);
  const [viewScriptsOpen, setViewScriptsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const assignRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const tagRef = useRef<HTMLDivElement | null>(null);
  const demoSectionRef = useRef<HTMLDivElement | null>(null);

  const { data: session } = useSession();
  const userRole = (session?.user as SessionUser | undefined)?.role;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const { data: notesRaw } = trpc.leads.getNotes.useQuery({ leadId: lead.id });
  const notes: LeadNote[] = (notesRaw ?? []) as LeadNote[];
  const { data: activitiesRaw = [] } = trpc.leads.getActivities.useQuery({ leadId: lead.id });
  const { data: leadTasks = [] } = trpc.tasks.getAllForLead.useQuery({ leadId: lead.id });
  const nextOpenTaskDueDate = useMemo(() => {
    return leadTasks
      .filter((task) => task.status !== "COMPLETED" && task.dueDate)
      .map((task) => taskDueDateParts({ id: task.id, dueDate: task.dueDate! }))
      .filter((task): task is NonNullable<typeof task> => task != null)
      .sort((left, right) => left.time - right.time)[0] ?? null;
  }, [leadTasks]);

  const timelineItems = [
    ...notes.map((n) => ({ kind: "note" as const, date: new Date(n.createdAt).getTime(), note: n })),
    ...activitiesRaw
      .filter((a) => a.type !== "LEAD_CREATED")
      .map((a) => ({ kind: "activity" as const, date: new Date(a.createdAt).getTime(), activity: a })),
  ].sort((a, b) => a.date - b.date);
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });
  const { data: rawScoringRules } = trpc.scoring.getRules.useQuery(undefined, { staleTime: 300_000 });
  const scoringRules = rawScoringRules as ScoringRuleConfig[] | undefined;
  const score = scoreOf(lead, scoringRules);

  const assignableUsers: AssignableUser[] = (isAdminOrManager
    ? (orgMembers ?? [])
    : (myTeam?.users ?? [])) as AssignableUser[];
  const canAssign = isAdminOrManager || (myTeam?.users ?? []).length > 0;

  const utils = trpc.useUtils();
  const updateOutcome = trpc.leads.updateCallOutcome.useMutation({
    onSuccess: () => {
      toast.success("Outcome saved");
      void utils.leads.getAll.invalidate();
      void utils.leads.getActivities.invalidate({ leadId: lead.id });
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });
  const setDispositionMutation = trpc.leads.setDisposition.useMutation({
    onSuccess: () => {
      toast.success("Disposition saved");
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const { data: customOutcomes = [] } = trpc.leads.customOutcomes.list.useQuery(undefined, {
    staleTime: 30_000,
  });
  const { data: orgTags = [] } = trpc.leads.listOrgTags.useQuery(undefined, {
    staleTime: 30_000,
  });
  const leadTags = lead.tags ?? [];
  const availableTags = orgTags.filter((tag) => !leadTags.some((leadTag) => leadTag.id === tag.id));
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
  const updateCustomOutcome = trpc.leads.customOutcomes.update.useMutation({
    onSuccess: () => {
      toast.success("Outcome updated");
      setEditingOutcomeId(null);
      void utils.leads.customOutcomes.list.invalidate();
      void utils.leads.getAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteCustomOutcome = trpc.leads.customOutcomes.delete.useMutation({
    onSuccess: () => {
      toast.success("Outcome deleted");
      setEditingOutcomeId(null);
      setConfirmDeleteOutcome(null);
      void utils.leads.customOutcomes.list.invalidate();
      void utils.leads.getAll.invalidate();
      void utils.leads.getStatusCounts.invalidate();
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
  const updateValue = trpc.leads.updateValue.useMutation({
    onSuccess: () => {
      toast.success("Value updated");
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const addTagToLead = trpc.leads.addTagToLead.useMutation({
    onSuccess: () => {
      toast.success("Tag added");
      setTagMenuOpen(false);
      setCreatingTag(false);
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const removeTagFromLead = trpc.leads.removeTagFromLead.useMutation({
    onSuccess: () => {
      toast.success("Tag removed");
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const createTag = trpc.leads.createTag.useMutation({
    onSuccess: (tag) => {
      toast.success("Tag created");
      setNewTagName("");
      setCreatingTag(false);
      void utils.leads.listOrgTags.invalidate();
      addTagToLead.mutate({ leadId: lead.id, tagId: tag.id });
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
  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => {
      toast.success("Lead deleted");
      void utils.leads.getAll.invalidate();
      onClose();
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
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setTaskDialogOpen(false);
      void utils.tasks.getAll.invalidate();
      void utils.tasks.getAllForLead.invalidate({ leadId: lead.id });
      void utils.leads.getActivities.invalidate({ leadId: lead.id });
    },
    onError: (error) => toast.error(error.message),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateWebsite = (trpc.websites.generateAi as any).useMutation({
    onSuccess: (data: { id: string; slug?: string | null; needsPhotos?: boolean }) => {
      toast.success("Demo website generated");
      void utils.websites.getForLead.invalidate({ leadId: lead.id });
      void utils.leads.getActivities.invalidate({ leadId: lead.id });
      if (data.needsPhotos) {
        toast.info("Demo generated, but no photos were found automatically.");
      }
    },
    onError: (error: { message: string }) => toast.error(error.message),
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
    if (!assignOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(event.target as Node)) {
        setAssignOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [assignOpen]);

  useEffect(() => {
    if (!moreOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!tagMenuOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(event.target as Node)) {
        setTagMenuOpen(false);
        setCreatingTag(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [tagMenuOpen]);

  useEffect(() => {
    if (!dispositionOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (dispositionRef.current && !dispositionRef.current.contains(event.target as Node)) {
        setDispositionOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [dispositionOpen]);

  const chooseDisposition = (nextId: string | null) => {
    setDispositionId(nextId);
    setDispositionOpen(false);
    setDispositionMutation.mutate({ id: lead.id, secondaryOutcomeId: nextId });
  };

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

  const handleCreateTask = (input: { title: string; dueDate?: string; priority: TaskPriority }) => {
    createTask.mutate({
      leadId: lead.id,
      title: input.title,
      dueDate: input.dueDate || undefined,
      priority: input.priority,
    });
  };

  return (
    <>
      {noteOpen ? <LogNoteDialog leadId={lead.id} onClose={() => setNoteOpen(false)} /> : null}
      {viewNotesOpen ? (
        <ViewNotesDialog
          notes={notes}
          currentUserId={currentUserId}
          isAdminOrManager={isAdminOrManager}
          leadId={lead.id}
          onClose={() => setViewNotesOpen(false)}
          onAddNote={() => {
            setViewNotesOpen(false);
            setNoteOpen(true);
          }}
        />
      ) : null}
      {viewScriptsOpen ? <ScriptsDialog onClose={() => setViewScriptsOpen(false)} /> : null}
      {editOpen ? <EditLeadDialog lead={lead} onClose={() => setEditOpen(false)} /> : null}
      <Dialog
        open={confirmDeleteOutcome !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleteCustomOutcome.isPending) setConfirmDeleteOutcome(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete outcome</DialogTitle>
            <DialogDescription>
              Delete the &quot;{confirmDeleteOutcome?.label}&quot; outcome? Leads using it will be
              reset to Not Contacted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deleteCustomOutcome.isPending}
              onClick={() => setConfirmDeleteOutcome(null)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteCustomOutcome.isPending}
              variant="destructive"
              onClick={() => {
                if (confirmDeleteOutcome) {
                  deleteCustomOutcome.mutate({ id: confirmDeleteOutcome.id });
                }
              }}
            >
              {deleteCustomOutcome.isPending ? "Deleting…" : "Delete outcome"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            {DIALER_ENABLED && lead.phone ? (
              <Link
                className="crm-btn primary"
                href={`/dialer?leadId=${lead.id}&phone=${encodeURIComponent(lead.phone)}`}
              >
                <Phone size={13} /> Call
              </Link>
            ) : null}
            {lead.email ? (
              <a className="crm-btn" href={`mailto:${lead.email}`}>
                <Mail size={13} /> Email
              </a>
            ) : null}
            {TRAINER_ENABLED ? (
              <Link className="crm-btn" href={`/trainer?leadId=${lead.id}`}>
                <Dumbbell size={13} /> Practice Call
              </Link>
            ) : null}
            <button className="crm-btn" onClick={() => setNoteOpen(true)}>
              <NotebookPen size={13} /> Log note
            </button>
            <button className="crm-btn" onClick={() => setTaskDialogOpen(true)}>
              <Check size={13} /> Task
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
                  {customOutcomes.map((item) =>
                    editingOutcomeId === item.id ? (
                      <div
                        key={item.id}
                        style={{ padding: "8px 10px", borderTop: "1px solid var(--crm-border)" }}
                      >
                        <input
                          autoFocus
                          placeholder="Label"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editLabel.trim()) {
                              updateCustomOutcome.mutate({
                                id: item.id,
                                label: editLabel.trim(),
                                hint: editHint.trim() || undefined,
                              });
                            }
                            if (e.key === "Escape") setEditingOutcomeId(null);
                          }}
                          style={outcomeInputStyle}
                        />
                        <input
                          placeholder="Hint (optional)"
                          value={editHint}
                          onChange={(e) => setEditHint(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") setEditingOutcomeId(null); }}
                          style={{ ...outcomeInputStyle, marginTop: 5 }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                          <button
                            type="button"
                            className="crm-btn ghost"
                            style={{ fontSize: 11, padding: "3px 8px" }}
                            onClick={() => setEditingOutcomeId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="crm-btn primary"
                            style={{ fontSize: 11, padding: "3px 8px" }}
                            disabled={!editLabel.trim() || updateCustomOutcome.isPending}
                            onClick={() =>
                              updateCustomOutcome.mutate({
                                id: item.id,
                                label: editLabel.trim(),
                                hint: editHint.trim() || undefined,
                              })
                            }
                          >
                            {updateCustomOutcome.isPending ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={item.id} className="crm-outcome-row">
                        <button
                          type="button"
                          role="menuitem"
                          className={`crm-outcome-item ${outcome === "CUSTOM" && customOutcomeId === item.id ? "active" : ""}`}
                          style={{ flex: 1, minWidth: 0 }}
                          onClick={() => chooseOutcome("CUSTOM", item.id)}
                        >
                          <span className="crm-outcome-dot t-cool" />
                          <span className="lab">
                            <span className="t">{item.label}</span>
                            {item.hint ? <span className="h">{item.hint}</span> : null}
                          </span>
                          {outcome === "CUSTOM" && customOutcomeId === item.id ? <Check size={11} /> : null}
                        </button>
                        <button
                          type="button"
                          className="crm-outcome-rowbtn"
                          title="Edit outcome"
                          aria-label={`Edit ${item.label}`}
                          onClick={() => {
                            setEditingOutcomeId(item.id);
                            setEditLabel(item.label);
                            setEditHint(item.hint ?? "");
                          }}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          className="crm-outcome-rowbtn"
                          title="Delete outcome"
                          aria-label={`Delete ${item.label}`}
                          disabled={deleteCustomOutcome.isPending}
                          onClick={() =>
                            setConfirmDeleteOutcome({ id: item.id, label: item.label })
                          }
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ),
                  )}
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

            <div className="crm-outcome-wrap" ref={dispositionRef}>
                <button
                  type="button"
                  className={`crm-btn crm-outcome-btn ${dispositionId ? "set" : ""}`}
                  onClick={() => setDispositionOpen((v) => !v)}
                  aria-expanded={dispositionOpen}
                >
                  <Check size={13} />
                  {dispositionId ? (
                    <>
                      <span style={{ color: "var(--crm-fg-faint)" }}>Disposition:</span>
                      <span style={{ fontWeight: 500 }}>
                        {customOutcomes.find((co) => co.id === dispositionId)?.label ?? "Custom"}
                      </span>
                    </>
                  ) : (
                    <>Set disposition</>
                  )}
                  <span className="crm-outcome-caret">
                    <ArrowDown size={10} />
                  </span>
                </button>

                {dispositionOpen ? (
                  <div className="crm-outcome-pop" role="menu">
                    <div className="crm-outcome-pop-head">Disposition</div>
                    {customOutcomes.map((item) =>
                      editingOutcomeId === item.id ? (
                        <div
                          key={item.id}
                          style={{ padding: "8px 10px", borderTop: "1px solid var(--crm-border)" }}
                        >
                          <input
                            autoFocus
                            placeholder="Label"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editLabel.trim()) {
                                updateCustomOutcome.mutate({
                                  id: item.id,
                                  label: editLabel.trim(),
                                  hint: editHint.trim() || undefined,
                                });
                              }
                              if (e.key === "Escape") setEditingOutcomeId(null);
                            }}
                            style={outcomeInputStyle}
                          />
                          <input
                            placeholder="Hint (optional)"
                            value={editHint}
                            onChange={(e) => setEditHint(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") setEditingOutcomeId(null); }}
                            style={{ ...outcomeInputStyle, marginTop: 5 }}
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                            <button
                              type="button"
                              className="crm-btn ghost"
                              style={{ fontSize: 11, padding: "3px 8px" }}
                              onClick={() => setEditingOutcomeId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="crm-btn primary"
                              style={{ fontSize: 11, padding: "3px 8px" }}
                              disabled={!editLabel.trim() || updateCustomOutcome.isPending}
                              onClick={() =>
                                updateCustomOutcome.mutate({
                                  id: item.id,
                                  label: editLabel.trim(),
                                  hint: editHint.trim() || undefined,
                                })
                              }
                            >
                              {updateCustomOutcome.isPending ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div key={item.id} className="crm-outcome-row">
                          <button
                            type="button"
                            role="menuitem"
                            className={`crm-outcome-item ${dispositionId === item.id ? "active" : ""}`}
                            style={{ flex: 1, minWidth: 0 }}
                            onClick={() => chooseDisposition(item.id)}
                          >
                            <span className="crm-outcome-dot t-cool" />
                            <span className="lab">
                              <span className="t">{item.label}</span>
                              {item.hint ? <span className="h">{item.hint}</span> : null}
                            </span>
                            {dispositionId === item.id ? <Check size={11} /> : null}
                          </button>
                          <button
                            type="button"
                            className="crm-outcome-rowbtn"
                            title="Edit outcome"
                            aria-label={`Edit ${item.label}`}
                            onClick={() => {
                              setEditingOutcomeId(item.id);
                              setEditLabel(item.label);
                              setEditHint(item.hint ?? "");
                            }}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            className="crm-outcome-rowbtn"
                            title="Delete outcome"
                            aria-label={`Delete ${item.label}`}
                            disabled={deleteCustomOutcome.isPending}
                            onClick={() =>
                              setConfirmDeleteOutcome({ id: item.id, label: item.label })
                            }
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ),
                    )}
                    {dispositionId ? (
                      <button
                        type="button"
                        className="crm-outcome-clear"
                        onClick={() => chooseDisposition(null)}
                      >
                        Clear disposition
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="crm-outcome-clear"
                      style={{ color: "var(--crm-accent-fg, var(--crm-fg-faint))" }}
                      onClick={() => {
                        setDispositionOpen(false);
                        setOutcomeOpen(true);
                        setAddingOutcome(true);
                      }}
                    >
                      + Add outcome
                    </button>
                  </div>
                ) : null}
              </div>

            {SCRIPTS_ENABLED ? (
              <button className="crm-btn" onClick={() => setViewScriptsOpen(true)}>
                <BookOpen size={13} /> Scripts
              </button>
            ) : null}

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
              <div ref={moreRef} style={{ position: "relative", display: "inline-block" }}>
                <button
                  type="button"
                  className="crm-btn ghost icon"
                  title="More"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((value) => !value)}
                >
                  <MoreHorizontal size={14} />
                </button>
                {moreOpen ? (
                  <div
                    className="crm-card"
                    role="menu"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      right: 0,
                      minWidth: 180,
                      padding: 4,
                      zIndex: 80,
                      boxShadow: "0 6px 24px rgba(0,0,0,.25)",
                      borderRadius: "var(--crm-radius-md)",
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="crm-nav-item"
                      style={{
                        borderRadius: "var(--crm-radius-sm)",
                        fontSize: 12,
                        width: "100%",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        setMoreOpen(false);
                        setEditOpen(true);
                      }}
                    >
                      <Pencil size={13} />
                      <span>Edit lead</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="crm-nav-item"
                      style={{
                        borderRadius: "var(--crm-radius-sm)",
                        fontSize: 12,
                        width: "100%",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        setMoreOpen(false);
                        setViewNotesOpen(true);
                      }}
                    >
                      <NotebookPen size={13} />
                      <span>View notes ({notes.length})</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="crm-nav-item"
                      style={{
                        borderRadius: "var(--crm-radius-sm)",
                        fontSize: 12,
                        width: "100%",
                        textAlign: "left",
                      }}
                      disabled={generateWebsite.isPending}
                      onClick={() => {
                        setMoreOpen(false);
                        demoSectionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                        generateWebsite.mutate({ leadId: lead.id });
                      }}
                    >
                      {generateWebsite.isPending ? (
                        <span style={{ display: "inline-block", width: 13, height: 13, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
                      ) : (
                        <Globe size={13} />
                      )}
                      <span>{generateWebsite.isPending ? "Generating website..." : "Generate website"}</span>
                    </button>
                    <div
                      style={{
                        height: 1,
                        background: "var(--crm-border)",
                        margin: "4px 6px",
                      }}
                    />
                    <button
                      type="button"
                      role="menuitem"
                      className="crm-nav-item"
                      style={{
                        borderRadius: "var(--crm-radius-sm)",
                        fontSize: 12,
                        width: "100%",
                        textAlign: "left",
                        color: "#dc2626",
                      }}
                      disabled={deleteLead.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${name || "this lead"}? This cannot be undone.`,
                          )
                        ) {
                          deleteLead.mutate({ id: lead.id });
                        }
                      }}
                    >
                      <Trash2 size={13} />
                      <span>{deleteLead.isPending ? "Deleting…" : "Delete lead"}</span>
                    </button>
                  </div>
                ) : null}
              </div>
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
                  {location ? (
                    <>
                      <span className="crm-k">Location</span>
                      <span className="crm-v">{location}</span>
                    </>
                  ) : null}
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
                        {formatPhone(lead.phone)}
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
                  {resolvedMapsUrl ? (
                    <>
                      <span className="crm-k">Maps</span>
                      <span className="crm-v" style={{ color: "var(--crm-accent-fg)" }}>
                        <a
                          href={resolvedMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <MapPin size={11} />
                          View on Maps
                        </a>
                      </span>
                    </>
                  ) : null}
                  {reviews ? (
                    <>
                      <span className="crm-k">Reviews</span>
                      <span className="crm-v">{reviews}</span>
                    </>
                  ) : null}
                  {nextOpenTaskDueDate ? (
                    <>
                      <span className="crm-k">Next task</span>
                      <span className="crm-v">
                        <Link
                          href={nextOpenTaskDueDate.href}
                          style={{ color: "#2563eb", textDecoration: "underline" }}
                        >
                          {nextOpenTaskDueDate.label}
                        </Link>
                      </span>
                    </>
                  ) : null}
                  <span className="crm-k">Created</span>
                  <span className="crm-v" style={{ color: "var(--crm-fg-muted)" }}>
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </span>
                  {lead.secondaryOutcome ? (
                    <>
                      <span className="crm-k">Disposition</span>
                      <span className="crm-v" style={{ color: "var(--crm-fg-muted)" }}>
                        {lead.secondaryOutcome.label}
                        {lead.secondaryOutcome.hint ? (
                          <span style={{ color: "var(--crm-fg-faint)", fontSize: 11 }}>
                            {" · "}
                            {lead.secondaryOutcome.hint}
                          </span>
                        ) : null}
                      </span>
                    </>
                  ) : null}
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
                      Estimated value
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label="Estimated value"
                      placeholder="0"
                      defaultValue={lead.value ?? ""}
                      disabled={updateValue.isPending}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid var(--crm-border)",
                        borderRadius: "var(--crm-radius-sm)",
                        background: "var(--crm-surface-2)",
                        color: "var(--crm-fg)",
                        fontSize: 12.5,
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      onBlur={(event) => {
                        const raw = event.target.value.trim();
                        const current = lead.value ?? null;
                        if (raw === "") {
                          if (current !== null) updateValue.mutate({ id: lead.id, value: null });
                          return;
                        }
                        const parsed = Number(raw);
                        if (!Number.isFinite(parsed) || parsed < 0) {
                          event.target.value = current != null ? String(current) : "";
                          return;
                        }
                        if (parsed !== current) updateValue.mutate({ id: lead.id, value: parsed });
                      }}
                    />
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

            <div
              style={{
                marginTop: 22,
                paddingTop: 18,
                borderTop: "1px solid var(--crm-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <h4 style={{ margin: 0 }}>Tags</h4>
                <div ref={tagRef} style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="crm-btn ghost sm"
                    style={{ height: 26, padding: "0 8px", fontSize: 12, gap: 5 }}
                    onClick={() => setTagMenuOpen((value) => !value)}
                    aria-expanded={tagMenuOpen}
                  >
                    <Plus size={12} />
                    Add tag
                  </button>
                  {tagMenuOpen ? (
                    <div
                      className="crm-card"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        width: 220,
                        padding: 6,
                        zIndex: 80,
                        boxShadow: "0 6px 24px rgba(0,0,0,.25)",
                        borderRadius: "var(--crm-radius-md)",
                      }}
                    >
                      {availableTags.length > 0 ? (
                        availableTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            className="crm-nav-item"
                            style={{
                              borderRadius: "var(--crm-radius-sm)",
                              fontSize: 12,
                              width: "100%",
                              textAlign: "left",
                            }}
                            disabled={addTagToLead.isPending}
                            onClick={() => addTagToLead.mutate({ leadId: lead.id, tagId: tag.id })}
                          >
                            <Tag size={12} />
                            <span>{tag.name}</span>
                          </button>
                        ))
                      ) : (
                        <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--crm-fg-faint)" }}>
                          No available tags
                        </div>
                      )}
                      <div style={{ height: 1, background: "var(--crm-border)", margin: "6px 4px" }} />
                      {creatingTag ? (
                        <div style={{ padding: 4 }}>
                          <input
                            autoFocus
                            placeholder="New tag name"
                            value={newTagName}
                            onChange={(event) => setNewTagName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && newTagName.trim()) {
                                createTag.mutate({ name: newTagName.trim() });
                              }
                              if (event.key === "Escape") setCreatingTag(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              border: "1px solid var(--crm-border)",
                              borderRadius: "var(--crm-radius-sm)",
                              background: "var(--crm-surface-2)",
                              color: "var(--crm-fg)",
                              fontSize: 12,
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                          <button
                            type="button"
                            className="crm-btn primary"
                            style={{ width: "100%", height: 28, marginTop: 6, justifyContent: "center", fontSize: 12 }}
                            disabled={!newTagName.trim() || createTag.isPending || addTagToLead.isPending}
                            onClick={() => createTag.mutate({ name: newTagName.trim() })}
                          >
                            {createTag.isPending ? "Creating..." : "Create & add"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="crm-nav-item"
                          style={{
                            borderRadius: "var(--crm-radius-sm)",
                            fontSize: 12,
                            width: "100%",
                            textAlign: "left",
                          }}
                          onClick={() => setCreatingTag(true)}
                        >
                          <Plus size={12} />
                          <span>New tag</span>
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              {leadTags.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {leadTags.map((tag) => (
                    <span
                      key={tag.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        height: 24,
                        padding: "0 8px",
                        border: "1px solid var(--crm-border)",
                        borderRadius: "var(--crm-radius-sm)",
                        background: "var(--crm-surface-2)",
                        color: "var(--crm-fg-muted)",
                        fontSize: 12,
                      }}
                    >
                      <Tag size={11} />
                      {tag.name}
                      <button
                        type="button"
                        title={`Remove ${tag.name}`}
                        disabled={removeTagFromLead.isPending}
                        onClick={() => removeTagFromLead.mutate({ leadId: lead.id, tagId: tag.id })}
                        style={{ display: "inline-flex", opacity: 0.65, lineHeight: 1 }}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: "var(--crm-fg-faint)", fontSize: 12, fontStyle: "italic" }}>No tags</div>
              )}
            </div>

            <DemoSiteSection leadId={lead.id} sectionRef={demoSectionRef} />

            <div
              style={{
                marginTop: 22,
                paddingTop: 18,
                borderTop: "1px solid var(--crm-border)",
              }}
            >
              <EmailDraftPanel leadId={lead.id} />
            </div>

            {lead.phone ? (
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: "1px solid var(--crm-border)",
                }}
              >
                <SmsDraftPanel leadId={lead.id} />
              </div>
            ) : null}

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
                {timelineItems.map((item) => {
                  if (item.kind === "note") {
                    const note = item.note;
                    return (
                      <div key={`note-${note.id}`} className="crm-tl-row" style={{ alignItems: "flex-start" }}>
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
                    );
                  }
                  const act = item.activity;
                  const icon = act.type.startsWith("TASK") ? (
                    <SquareCheck size={11} />
                  ) : act.type === "CALL_LOGGED" ? (
                    <Phone size={11} />
                  ) : (
                    <Globe size={11} />
                  );
                  return (
                    <div key={`act-${act.id}`} className="crm-tl-row">
                      <span className="ico">{icon}</span>
                      <span className="body">{act.description}</span>
                      <span className="ts">{relativeTime(act.createdAt)}</span>
                    </div>
                  );
                })}
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

      <CreateLeadTaskDialog
        open={taskDialogOpen}
        pending={createTask.isPending}
        onClose={() => setTaskDialogOpen(false)}
        onCreate={handleCreateTask}
      />
    </>
  );
}

function CreateLeadTaskDialog({
  open,
  pending,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; dueDate?: string; priority: TaskPriority }) => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");

  const resetAndClose = () => {
    if (pending) return;
    setTitle("");
    setDueDate("");
    setPriority("MEDIUM");
    onClose();
  };

  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Task title is required.");
      return;
    }
    let parsedDueDate: string | undefined;
    if (dueDate) {
      const [y, m, d] = dueDate.split("-").map(Number);
      parsedDueDate = new Date(y, m - 1, d).toISOString();
    }
    onCreate({ title: trimmedTitle, dueDate: parsedDueDate, priority });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && resetAndClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>Add a follow-up task for this lead.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1" htmlFor="lead-task-title">
            <span className="text-sm font-medium">Title</span>
            <Input
              autoFocus
              disabled={pending}
              id="lead-task-title"
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSubmit();
              }}
              value={title}
            />
          </label>

          <label className="block space-y-1" htmlFor="lead-task-due-date">
            <span className="text-sm font-medium">Due date</span>
            <Input
              disabled={pending}
              id="lead-task-due-date"
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </label>

          <label className="block space-y-1" htmlFor="lead-task-priority">
            <span className="text-sm font-medium">Priority</span>
            <select
              className="h-8 w-full rounded-lg border bg-background px-2.5 py-1 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending}
              id="lead-task-priority"
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
              value={priority}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
        </div>

        <DialogFooter>
          <Button disabled={pending} onClick={resetAndClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit}>
            {pending ? "Creating..." : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DemoSiteSection({ leadId, sectionRef }: { leadId: string; sectionRef?: RefObject<HTMLDivElement | null> }) {
  const utils = trpc.useUtils();
  const { data: site } = trpc.websites.getForLead.useQuery({ leadId });
  const [isDownloading, setIsDownloading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateAi = (trpc.websites.generateAi as any).useMutation({
    onSuccess: (data: { id: string; slug?: string | null; needsPhotos?: boolean }) => {
      toast.success("Demo website generated");
      void utils.websites.getForLead.invalidate({ leadId });
      void utils.leads.getActivities.invalidate({ leadId });
      if (data.needsPhotos) {
        toast.info("Demo generated, but no photos were found automatically.");
      }
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const siteSimple = site as { id: string; template: string; slug?: string | null } | undefined;
  const aiDemo = siteSimple?.template === "ai_demo" ? siteSimple : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const downloadDemo = async () => {
    if (!aiDemo?.id || isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/websites/${encodeURIComponent(aiDemo.id)}/download`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to download demo website.");
      }

      const blob = await response.blob();
      const filename = filenameFromContentDisposition(response.headers.get("content-disposition")) ?? `${aiDemo.slug ?? "demo-site"}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Demo website ZIP downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download demo website.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      ref={sectionRef}
      style={{
        marginTop: 22,
        paddingTop: 18,
        borderTop: "1px solid var(--crm-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <h4 style={{ margin: 0 }}>Demo Site</h4>
        <button
          className="crm-btn ghost sm"
          disabled={generateAi.isPending}
          onClick={() => generateAi.mutate({ leadId })}
          style={{ gap: 5 }}
        >
          {generateAi.isPending ? (
            <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
          ) : (
            <Sparkles size={12} />
          )}
          {aiDemo ? "Regenerate" : "Generate AI demo"}
        </button>
      </div>
      {aiDemo?.slug ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <a
            href={`${appUrl}/demo/${aiDemo.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--crm-accent-fg)" }}
          >
            <ExternalLink size={12} />
            /demo/{aiDemo.slug}
          </a>
          <button
            type="button"
            className="crm-btn ghost sm"
            disabled={isDownloading}
            onClick={downloadDemo}
            style={{ gap: 5 }}
          >
            {isDownloading ? (
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
            ) : (
              <Download size={12} />
            )}
            {isDownloading ? "Downloading..." : "Download ZIP"}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", fontStyle: "italic" }}>
          No AI demo yet — click &ldquo;Generate AI demo&rdquo; above.
        </div>
      )}
    </div>
  );
}

function filenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = value.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}
