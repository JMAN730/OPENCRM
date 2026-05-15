"use client";

import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

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
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

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

  const handlePostNote = () => {
    const content = composerText.trim();
    if (!content) return;
    createNote.mutate({ leadId: lead.id, content });
  };

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

  const handleCreateTask = (input: { title: string; dueDate?: string; priority: TaskPriority }) => {
    createTask.mutate({
      leadId: lead.id,
      title: input.title,
      dueDate: input.dueDate || undefined,
      priority: input.priority,
    });
  };

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
            onCreateTask={() => setTaskDialogOpen(true)}
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

      <CreateLeadTaskDialog
        open={taskDialogOpen}
        pending={createTask.isPending}
        onClose={() => setTaskDialogOpen(false)}
        onCreate={handleCreateTask}
      />
    </div>
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

    onCreate({ title: trimmedTitle, dueDate: dueDate || undefined, priority });
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
