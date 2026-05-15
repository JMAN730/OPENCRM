import type { inferRouterOutputs } from "@trpc/server";
import { format, isToday, isTomorrow } from "date-fns";
import type { AppRouter } from "@/server/api/root";
import {
  effectiveTempOf,
  nextActionForLead,
  scoreOf,
  touchesOf,
  type Lead,
} from "./shared";

type FocusTask = inferRouterOutputs<AppRouter>["tasks"]["getDueToday"][number];

export type FocusQuickFilter = "ALL" | "HOT" | "DUE_TODAY" | "MINE";
export type FocusUrgency = "overdue" | "today" | "hot";

export type FocusLeadCard = {
  lead: Lead;
  rank: number;
  urgency: FocusUrgency;
  reason: string;
  dueLabel: string | null;
  score: number;
  touches: number;
  nextAction: ReturnType<typeof nextActionForLead>;
};

function taskLeadId(task: FocusTask) {
  return task.leadId ?? null;
}

function taskDueTime(task: FocusTask) {
  if (!task.dueDate) return Number.POSITIVE_INFINITY;
  return new Date(task.dueDate).getTime();
}

function createdAtTime(lead: Lead) {
  return new Date(lead.createdAt).getTime();
}

function formatTaskDueLabel(task: FocusTask) {
  if (!task.dueDate) return "Due today";

  const dueDate = new Date(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) return "Due today";

  const timeLabel = format(dueDate, "h:mm a");
  if (isToday(dueDate)) {
    return `Due today at ${timeLabel}`;
  }
  if (isTomorrow(dueDate)) {
    return `Due tomorrow at ${timeLabel}`;
  }
  return `Due ${format(dueDate, "EEE 'at' h:mm a")}`;
}

function sortByScoreThenFreshness(left: Lead, right: Lead) {
  const scoreDelta = scoreOf(right) - scoreOf(left);
  if (scoreDelta !== 0) return scoreDelta;
  return createdAtTime(right) - createdAtTime(left);
}

function sortTasksAgainstLeadMap(left: FocusTask, right: FocusTask, leadMap: Map<string, Lead>) {
  const dueDelta = taskDueTime(left) - taskDueTime(right);
  if (dueDelta !== 0) return dueDelta;

  const leftLead = leadMap.get(taskLeadId(left) ?? "");
  const rightLead = leadMap.get(taskLeadId(right) ?? "");

  if (leftLead && rightLead) {
    const scoreDelta = scoreOf(rightLead) - scoreOf(leftLead);
    if (scoreDelta !== 0) return scoreDelta;

    return createdAtTime(rightLead) - createdAtTime(leftLead);
  }

  if (leftLead) return -1;
  if (rightLead) return 1;
  return 0;
}

function buildFocusCard(lead: Lead, urgency: FocusUrgency, rank: number, task?: FocusTask): FocusLeadCard {
  return {
    lead,
    rank,
    urgency,
    reason:
      urgency === "overdue"
        ? "Overdue follow-up"
        : urgency === "today"
          ? formatTaskDueLabel(task!)
          : "Hot lead with no scheduled follow-up",
    dueLabel: task ? formatTaskDueLabel(task) : null,
    score: scoreOf(lead),
    touches: touchesOf(lead),
    nextAction: nextActionForLead(lead),
  };
}

export function getDueLeadIds(overdueTasks: FocusTask[], dueTodayTasks: FocusTask[]) {
  const ids = new Set<string>();

  for (const task of [...overdueTasks, ...dueTodayTasks]) {
    const leadId = taskLeadId(task);
    if (leadId) ids.add(leadId);
  }

  return ids;
}

export function getQuickFilterCounts(leads: Lead[], dueLeadIds: Set<string>, currentUserId?: string | null) {
  return {
    all: leads.length,
    hot: leads.filter((lead) => effectiveTempOf(lead) === "hot").length,
    dueToday: leads.filter((lead) => dueLeadIds.has(lead.id)).length,
    mine: currentUserId ? leads.filter((lead) => lead.assignedToId === currentUserId).length : 0,
  };
}

export function filterLeadByQuickFilter(
  lead: Lead,
  quickFilter: FocusQuickFilter,
  dueLeadIds: Set<string>,
  currentUserId?: string | null,
) {
  if (quickFilter === "HOT") return effectiveTempOf(lead) === "hot";
  if (quickFilter === "DUE_TODAY") return dueLeadIds.has(lead.id);
  if (quickFilter === "MINE") return Boolean(currentUserId) && lead.assignedToId === currentUserId;
  return true;
}

export function buildFocusSpotlightLeads({
  leads,
  overdueTasks,
  dueTodayTasks,
  limit = 3,
}: {
  leads: Lead[];
  overdueTasks: FocusTask[];
  dueTodayTasks: FocusTask[];
  limit?: number;
}) {
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const usedLeadIds = new Set<string>();
  const spotlight: FocusLeadCard[] = [];

  const sortedOverdue = [...overdueTasks].sort((left, right) => sortTasksAgainstLeadMap(left, right, leadMap));
  const sortedDueToday = [...dueTodayTasks].sort((left, right) => sortTasksAgainstLeadMap(left, right, leadMap));

  for (const task of sortedOverdue) {
    const leadId = taskLeadId(task);
    if (!leadId || usedLeadIds.has(leadId)) continue;

    const lead = leadMap.get(leadId);
    if (!lead) continue;

    spotlight.push(buildFocusCard(lead, "overdue", spotlight.length + 1, task));
    usedLeadIds.add(leadId);
    if (spotlight.length >= limit) return spotlight;
  }

  for (const task of sortedDueToday) {
    const leadId = taskLeadId(task);
    if (!leadId || usedLeadIds.has(leadId)) continue;

    const lead = leadMap.get(leadId);
    if (!lead) continue;

    spotlight.push(buildFocusCard(lead, "today", spotlight.length + 1, task));
    usedLeadIds.add(leadId);
    if (spotlight.length >= limit) return spotlight;
  }

  const hotLeads = leads
    .filter((lead) => !usedLeadIds.has(lead.id) && effectiveTempOf(lead) === "hot")
    .sort(sortByScoreThenFreshness);

  for (const lead of hotLeads) {
    spotlight.push(buildFocusCard(lead, "hot", spotlight.length + 1));
    usedLeadIds.add(lead.id);
    if (spotlight.length >= limit) return spotlight;
  }

  return spotlight;
}
