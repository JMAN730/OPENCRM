import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

export type TeamsListItem = inferRouterOutputs<AppRouter>["teams"]["list"][number];
export type OrganizationMember = inferRouterOutputs<AppRouter>["teams"]["organizationMembers"][number];
export type TeamActivityFeed = inferRouterOutputs<AppRouter>["teams"]["activityFeed"];
export type TeamActivity = TeamActivityFeed["items"][number];
export type MyTeam = inferRouterOutputs<AppRouter>["teams"]["myTeam"];
export type InviteRole = "USER" | "MANAGER" | "ADMIN";

export function initials(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function avatarClass(seed: string | null | undefined) {
  const number = (((seed ?? "").charCodeAt(0) || 0) % 6) + 1;
  return `c${number}`;
}

export function relativeTime(iso: string | Date) {
  const timestamp = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export const ACTIVITY_VERB: Record<string, string> = {
  LEAD_CREATED: "created lead",
  LEAD_ASSIGNED: "assigned lead",
  LEAD_DELETED: "deleted lead",
  CALL_OUTCOME: "updated call outcome on",
  CALL_LOGGED: "logged call on",
  LEAD_TEMPERATURE_OVERRIDE: "set temperature on",
  TASK_CREATED: "added task on",
  TASK_COMPLETED: "completed task on",
  NOTE_ADDED: "added note on",
  NOTE_DELETED: "deleted note on",
};
