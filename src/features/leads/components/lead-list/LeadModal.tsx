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
  const [temperatureOverride, setTemperatureOverride] = useState(lead.temperatureOverride ?? "");
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
  const leadForDisplay = useMemo(
    () => ({ ...lead, starred, temperatureOverride: temperatureOverride || null, callOutcome: outcome }),
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

  const handlePostNote = () => {
    const content = composerText.trim();
    if (!content || createNote.isPending) return;
    createNote.mutate({ leadId: lead.id, content });
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
