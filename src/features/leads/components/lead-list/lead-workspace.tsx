"use client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatLocation } from "@/features/leads/location";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import {
  Activity as ActivityIcon,
  CheckCircle2,
  Clock3,
  FileText,
  Globe,
  Mail,
  MoreHorizontal,
  NotebookPen,
  Phone,
  Send,
  SquareCheckBig,
  Star,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  avatarClass,
  effectiveTempOf,
  fullNameOf,
  initials,
  normalizeWebsiteHref,
  OUTCOMES,
  relativeTime,
  reviewSummary,
  scoreOf,
  tempLabel,
  type Lead,
  type LeadNote,
} from "./shared";

export type ActivityRow = {
  id: string;
  type?: string | null;
  description: string;
  createdAt: string | Date;
  user?: { name?: string | null; email?: string | null } | null;
};

export type CustomOutcomeOption = {
  id: string;
  label: string;
  hint?: string | null;
};

const PIPELINE_STAGES = ["Lead", "Qualified", "Demo", "Proposal", "Negotiation", "Closed Won"];

type LeadHeaderProps = {
  lead: Lead;
  score: number;
  starred: boolean;
  outcome: string;
  customOutcomes: CustomOutcomeOption[];
  onToggleStar: () => void;
  onOutcomeChange: (outcome: string, customOutcomeId?: string) => void;
  onCreateTask: () => void;
};

export function LeadHeader({
  lead,
  score,
  starred,
  outcome,
  customOutcomes,
  onToggleStar,
  onOutcomeChange,
  onCreateTask,
}: LeadHeaderProps) {
  const name = fullNameOf(lead);
  const websiteHref = normalizeWebsiteHref(lead.website);
  const temperature = effectiveTempOf(lead);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={cn(
              "grid h-16 w-16 shrink-0 place-items-center rounded-full text-lg font-semibold text-white shadow-sm",
              avatarClass(name),
            )}
          >
            {initials(name)}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-3xl font-semibold tracking-tight text-foreground">
                {name}
              </h1>
              <Badge variant="secondary" className="capitalize">
                {tempLabel(temperature)}
              </Badge>
              <Badge variant="outline">Score {score}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {lead.company ? <span>{lead.company}</span> : null}
              {lead.source ? <span>{lead.source}</span> : null}
              {lead.email ? <a href={`mailto:${lead.email}`} className="hover:text-foreground">{lead.email}</a> : null}
              {lead.phone ? <a href={`tel:${lead.phone}`} className="hover:text-foreground">{formatPhone(lead.phone)}</a> : null}
              {lead.website && websiteHref ? (
                <a href={websiteHref} target="_blank" rel="noreferrer" className="hover:text-foreground">
                  {lead.website}
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lead.phone ? (
            <a href={`tel:${lead.phone}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Phone className="h-4 w-4" />
              Call
            </Button>
          )}
          <a href="#lead-activity-composer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <NotebookPen className="h-4 w-4" />
            Log Note
          </a>
          <Button variant="outline" size="sm" onClick={onCreateTask}>
            <SquareCheckBig className="h-4 w-4" />
            Task
          </Button>
          {websiteHref ? (
            <a href={websiteHref} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Globe className="h-4 w-4" />
              Website
            </a>
          ) : null}
          {lead.email ? (
            <a href={`mailto:${lead.email}`} className={buttonVariants({ size: "sm" })}>
              <Mail className="h-4 w-4" />
              Email
            </a>
          ) : null}
          <LeadMoreActions
            outcome={outcome}
            customOutcomes={customOutcomes}
            onOutcomeChange={onOutcomeChange}
          />
          <Button variant="outline" size="icon" aria-label="Favorite lead" onClick={onToggleStar}>
            <Star className={cn("h-4 w-4", starred && "fill-yellow-400 text-yellow-500")} />
          </Button>
        </div>
      </div>
    </section>
  );
}

function LeadMoreActions({
  outcome,
  customOutcomes,
  onOutcomeChange,
}: {
  outcome: string;
  customOutcomes: CustomOutcomeOption[];
  onOutcomeChange: (outcome: string, customOutcomeId?: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Log outcome</div>
        {OUTCOMES.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => onOutcomeChange(item.id)}
            aria-checked={outcome === item.id}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
        {customOutcomes.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Custom outcomes</div>
            {customOutcomes.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => onOutcomeChange("CUSTOM", item.id)}
                aria-checked={outcome === "CUSTOM"}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PipelineTracker({ activeIndex }: { activeIndex: number }) {
  return (
    <section className="overflow-x-auto rounded-2xl border bg-card p-4 shadow-sm">
      <ol className="flex min-w-[720px] items-center gap-2">
        {PIPELINE_STAGES.map((stage, index) => {
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;
          return (
            <li key={stage} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs transition-colors",
                  (isComplete || isActive)
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "bg-background text-muted-foreground",
                )}
              >
                {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span className={cn("text-sm", isActive ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {stage}
              </span>
              {index < PIPELINE_STAGES.length - 1 ? (
                <div className={cn("h-px flex-1 transition-colors", isComplete ? "bg-indigo-600" : "bg-border")} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type LeadTabsProps = {
  activities: ActivityRow[];
  notes: LeadNote[];
  lead: Lead;
  composerText: string;
  onComposerTextChange: (value: string) => void;
  onPostNote: () => void;
  isPosting: boolean;
};

export function LeadTabs({
  activities,
  notes,
  lead,
  composerText,
  onComposerTextChange,
  onPostNote,
  isPosting,
}: LeadTabsProps) {
  const [activeTab, setActiveTab] = useState("activity");
  const tabs = ["activity", "notes", "emails", "calls", "tasks", "files"];

  return (
    <div className="space-y-4">
      <div className="grid w-full grid-cols-3 gap-2 md:flex">
        {tabs.map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab)}
            className="capitalize"
          >
            {tab}
          </Button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <ActivityComposer
          value={composerText}
          onChange={onComposerTextChange}
          onPost={onPostNote}
          isPosting={isPosting}
        />
        {activeTab === "activity" ? <ActivityFeed activities={activities} notes={notes} lead={lead} /> : null}
        {activeTab === "notes" ? <NotesFeed notes={notes} /> : null}
        {activeTab === "calls" ? <CallsFeed lead={lead} activities={activities} /> : null}
        {["emails", "tasks", "files"].includes(activeTab) ? <EmptyState label={activeTab} /> : null}
      </section>
    </div>
  );
}

function ActivityComposer({
  value,
  onChange,
  onPost,
  isPosting,
}: {
  value: string;
  onChange: (value: string) => void;
  onPost: () => void;
  isPosting: boolean;
}) {
  return (
    <div id="lead-activity-composer" className="border-b p-4">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Log a note, schedule a task, or paste a transcript..."
        rows={3}
        className="min-h-24 w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/30"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Button variant="ghost" size="icon-sm" aria-label="Add note">
            <NotebookPen className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Log call">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Attach file">
            <FileText className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" onClick={onPost} disabled={!value.trim() || isPosting}>
          <Send className="h-4 w-4" />
          {isPosting ? "Posting..." : "Post"}
        </Button>
      </div>
    </div>
  );
}

function ActivityFeed({ activities, notes, lead }: { activities: ActivityRow[]; notes: LeadNote[]; lead: Lead }) {
  const fallbackActivities: ActivityRow[] = [
    {
      id: "lead-created",
      type: "LEAD_CREATED",
      description: `Lead created from ${lead.source || "manual entry"}`,
      createdAt: lead.createdAt,
      user: null,
    },
    ...notes.map((note) => ({
      id: `note-${note.id}`,
      type: "NOTE_ADDED",
      description: note.content,
      createdAt: note.createdAt,
      user: null,
    })),
  ];
  const rows = activities.length > 0 ? activities : fallbackActivities;

  return (
    <div>
      {rows.map((activity) => (
        <ActivityItem key={activity.id} item={activity} />
      ))}
      <div className="border-t p-4">
        <Button variant="outline" className="w-full">
          Load more activity
        </Button>
      </div>
    </div>
  );
}

function NotesFeed({ notes }: { notes: LeadNote[] }) {
  if (notes.length === 0) return <EmptyState label="notes" />;
  return (
    <div>
      {notes.map((note) => (
        <div key={note.id} className="border-b p-4 text-sm last:border-b-0">
          <div className="mb-1 text-xs text-muted-foreground">{relativeTime(note.createdAt)}</div>
          <p className="whitespace-pre-wrap leading-6">{note.content}</p>
        </div>
      ))}
    </div>
  );
}

function CallsFeed({ lead, activities }: { lead: Lead; activities: ActivityRow[] }) {
  const callRows = activities.filter((activity) => activity.type?.includes("CALL"));
  if (!lead.callNotes && callRows.length === 0) return <EmptyState label="calls" />;
  return (
    <div>
      {callRows.map((activity) => (
        <ActivityItem key={activity.id} item={activity} />
      ))}
      {lead.callNotes ? (
        <div className="border-b p-4 text-sm last:border-b-0">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            Latest call notes
          </div>
          <p className="whitespace-pre-wrap leading-6">{lead.callNotes}</p>
        </div>
      ) : null}
    </div>
  );
}

function ActivityItem({ item }: { item: ActivityRow }) {
  return (
    <div className="border-b p-4 transition-colors last:border-b-0 hover:bg-muted/40">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{iconForActivity(item.type)}</div>
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{item.user?.name ?? item.user?.email ?? "System"}</span>
          <span className="text-muted-foreground"> logged </span>
          <span className="break-words">{item.description}</span>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">{relativeTime(item.createdAt)}</div>
      </div>
    </div>
  );
}

function iconForActivity(type?: string | null) {
  if (type?.includes("CALL")) return <Phone className="h-4 w-4" />;
  if (type?.includes("NOTE")) return <FileText className="h-4 w-4" />;
  if (type?.includes("TASK")) return <CheckCircle2 className="h-4 w-4" />;
  if (type?.includes("TEMPERATURE") || type?.includes("OUTCOME")) return <Clock3 className="h-4 w-4" />;
  return <ActivityIcon className="h-4 w-4" />;
}

function EmptyState({ label }: { label: string }) {
  return <div className="p-6 text-sm text-muted-foreground">No {label} yet.</div>;
}

export function DetailsCard({ lead }: { lead: Lead }) {
  const location = formatLocation(lead.city, lead.state);

  return (
    <Card title="Details">
      {kv("Stage", lead.status)}
      {kv("Owner", lead.assignedTo?.name ?? lead.assignedTo?.email ?? "Unassigned")}
      {kv("Source", lead.source ?? "-")}
      {kv("Location", location ?? "-")}
      {kv("Phone", lead.phone ? formatPhone(lead.phone) : "-")}
      {kv("Website", lead.website ?? "-")}
      {kv("Reviews", reviewSummary(lead) ?? "-")}
      {kv("Created", new Date(lead.createdAt).toLocaleDateString())}
    </Card>
  );
}

export function EngagementCard({
  lead,
  score,
  temperatureOverride,
  onTemperatureChange,
  isUpdatingTemperature,
}: {
  lead: Lead;
  score: number;
  temperatureOverride: string;
  onTemperatureChange: (value: string) => void;
  isUpdatingTemperature: boolean;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const reviews = reviewSummary(lead);

  return (
    <Card title="Engagement">
      {kv("Lead score", String(score))}
      {kv("Reviews", reviews ?? "-")}
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Temperature</span>
        <select
          aria-label="Temperature override"
          className="h-8 rounded-lg border bg-background px-2 text-sm"
          value={temperatureOverride}
          disabled={isUpdatingTemperature}
          onChange={(event) => onTemperatureChange(event.target.value)}
        >
          <option value="">Auto ({tempLabel(effectiveTempOf(lead))})</option>
          <option value="HOT">Hot</option>
          <option value="WARM">Warm</option>
          <option value="COOL">Cool</option>
        </select>
      </label>
      {kv("Last activity", "Recent")}
      <button
        type="button"
        className="text-xs font-medium text-indigo-600 hover:underline"
        onClick={() => setShowWhy((current) => !current)}
      >
        Why?
      </button>
      {showWhy ? (
        <div className="rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          Score uses review quality, review volume, and engagement status. Current base score is{" "}
          {scoreOf(lead)}.
        </div>
      ) : null}
    </Card>
  );
}

export function PeopleCard({ lead }: { lead: Lead }) {
  const name = fullNameOf(lead);

  return (
    <Card title="People">
      <div className="flex items-center gap-3">
        <div className={cn("grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white", avatarClass(name))}>
          {initials(name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">Primary contact</div>
        </div>
      </div>
      {lead.assignedTo ? (
        <div className="flex items-center gap-3 pt-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{lead.assignedTo.name ?? lead.assignedTo.email}</div>
            <div className="text-xs text-muted-foreground">Owner</div>
          </div>
        </div>
      ) : null}
      <Button variant="ghost" size="sm" className="mt-2 w-full justify-start">
        View all
      </Button>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function kv(label: string, value: string) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  );
}
