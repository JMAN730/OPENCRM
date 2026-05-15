"use client";

import { trpc } from "@/app/_trpc/client";
import { useState } from "react";
import { toast } from "sonner";
import { type Lead, type LeadNote, type ScoringRuleConfig } from "./shared";
import { scoreOf } from "./shared";
import { Button } from "@/components/ui/button";
import { LeadHeader, PipelineTracker, LeadTabs, DetailsCard, EngagementCard, PeopleCard } from "./lead-workspace";

type LeadModalProps = {
  lead: Lead;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export function LeadModal({ lead, onClose }: LeadModalProps) {
  const utils = trpc.useUtils();
  const [starred, setStarred] = useState(lead.starred ?? false);
  const { data: activities = [] } = trpc.leads.getActivities.useQuery({ leadId: lead.id });
  const { data: notesRaw = [] } = trpc.leads.getNotes.useQuery({ leadId: lead.id });
  const notes = notesRaw as LeadNote[];
  const { data: rawRules = [] } = trpc.scoring.getRules.useQuery(undefined, { staleTime: 300_000 });
  const rules = rawRules as unknown as ScoringRuleConfig[];
  const score = scoreOf(lead, rules.length > 0 ? rules : undefined);

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

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto h-full max-w-[1600px] overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="space-y-4">
          <LeadHeader lead={lead} score={score} starred={starred} onToggleStar={() => toggleStar.mutate({ id: lead.id })} onOpenNotes={() => window.dispatchEvent(new CustomEvent("open-note"))} />
          <PipelineTracker activeIndex={Math.min(5, Math.max(0, lead.status === "CONNECTED" ? 2 : lead.status === "ANSWERED" ? 3 : 1))} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <LeadTabs activities={activities} notes={notes} lead={lead} rules={rules} />
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <DetailsCard lead={lead} />
              <EngagementCard lead={lead} score={score} />
              <PeopleCard lead={lead} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
