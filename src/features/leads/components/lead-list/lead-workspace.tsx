"use client";

import { Star, Phone, Mail, Globe, MoreHorizontal, NotebookPen, Clock3, FileText, CheckCircle2, Activity as ActivityIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { useState } from "react";
import { fullNameOf, initials, avatarClass, type Lead, type LeadNote, reviewSummary, scoreBreakdown, type ScoringRuleConfig, effectiveTempOf, tempLabel, relativeTime } from "./shared";

export const PIPELINE_STAGES = ["Lead", "Qualified", "Demo", "Proposal", "Negotiation", "Closed Won"] as const;

export function LeadHeader({ lead, score, onToggleStar, starred, onOpenNotes }: { lead: Lead; score: number; onToggleStar: () => void; starred: boolean; onOpenNotes: () => void; }) {
  const name = fullNameOf(lead);
  const temp = effectiveTempOf(lead);
  const websiteHref = lead.website?.startsWith("http") ? lead.website : lead.website ? `https://${lead.website}` : null;

  return <section className="rounded-2xl border bg-card p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-4">
        <div className={`h-16 w-16 rounded-full grid place-items-center text-white font-semibold ${avatarClass(name)}`}>{initials(name)}</div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
            <Badge variant="secondary" className="capitalize">{tempLabel(temp)}</Badge>
            <Badge variant="outline">Score {score}</Badge>
          </div>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            {lead.company && <span>{lead.company}</span>}
            {lead.source && <span>{lead.source}</span>}
            {lead.email && <span>{lead.email}</span>}
            {lead.phone && <span>{lead.phone}</span>}
            {lead.website && <span>{lead.website}</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm"><Phone className="mr-1 h-4 w-4"/>Call</Button>
        <Button variant="outline" size="sm" onClick={onOpenNotes}><NotebookPen className="mr-1 h-4 w-4"/>Log Note</Button>
        {websiteHref && <a href={websiteHref} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><Globe className="mr-1 h-4 w-4"/>Website</Button></a>}
        {lead.email && <a href={`mailto:${lead.email}`}><Button size="sm"><Mail className="mr-1 h-4 w-4"/>Email</Button></a>}
        <Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal className="h-4 w-4"/></Button>
        <Button variant="outline" size="icon" aria-label="Favorite" onClick={onToggleStar}><Star className={`h-4 w-4 ${starred ? "fill-yellow-400 text-yellow-500" : ""}`}/></Button>
      </div>
    </div>
  </section>;
}

export function PipelineTracker({ activeIndex }: { activeIndex: number }) { return <section className="overflow-x-auto rounded-2xl border bg-card p-4 shadow-sm"><ol className="flex min-w-[720px] items-center gap-2">{PIPELINE_STAGES.map((stage, idx) => <li key={stage} className="flex items-center gap-2 flex-1"><div className={`h-7 w-7 rounded-full border grid place-items-center text-xs transition ${idx <= activeIndex ? "bg-indigo-600 border-indigo-600 text-white" : "bg-background text-muted-foreground"}`}>{idx + 1}</div><span className={`text-sm ${idx === activeIndex ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{stage}</span>{idx < PIPELINE_STAGES.length - 1 && <div className={`h-[2px] flex-1 ${idx < activeIndex ? "bg-indigo-600" : "bg-border"}`}/>}</li>)}</ol></section>; }

type ActivityRow = { id: string; type?: string | null; description: string; createdAt: string | Date; user?: { name?: string | null } | null };
export function LeadTabs({ activities, notes, lead, rules }: { activities: ActivityRow[]; notes: LeadNote[]; lead: Lead; rules: ScoringRuleConfig[]; }) {
  const [activeTab, setActiveTab] = useState("activity");
  const breakdown = scoreBreakdown(lead, rules.filter((r) => r.isActive));
  return <div className="space-y-4">
    <div className="grid w-full grid-cols-3 gap-2 lg:flex">
      {["activity", "notes", "emails", "calls", "tasks", "files"].map((tab) => <Button key={tab} variant={activeTab === tab ? "default" : "outline"} size="sm" onClick={() => setActiveTab(tab)} className="capitalize">{tab}</Button>)}
    </div>
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-4 flex items-center gap-3"><input className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" placeholder="Log a note, schedule a task, or paste a transcript…"/><Button size="sm">Post</Button></div>
      {activeTab === "activity" && <div>{activities.map((a) => <ActivityItem key={a.id} item={a}/>)}<div className="p-4 border-t"><Button variant="outline" className="w-full">Load more activity</Button></div></div>}
      {activeTab === "notes" && <div>{notes.map((n) => <div key={n.id} className="border-b p-4 text-sm"><div className="text-muted-foreground text-xs">{relativeTime(n.createdAt)}</div>{n.content}</div>)}</div>}
      {["emails","calls","tasks","files"].includes(activeTab) && <div className="p-6 text-sm text-muted-foreground">No {activeTab} yet.</div>}
    </div>
    <div className="hidden">{breakdown.length}</div>
  </div>;
}

function ActivityItem({ item }: { item: ActivityRow }) { const icon = item.type?.includes("CALL") ? <Phone className="h-4 w-4"/> : item.type?.includes("NOTE") ? <FileText className="h-4 w-4"/> : item.type?.includes("TASK") ? <CheckCircle2 className="h-4 w-4"/> : item.type?.includes("STAGE") ? <Clock3 className="h-4 w-4"/> : <ActivityIcon className="h-4 w-4"/>; return <div className="border-b p-4 hover:bg-muted/40 transition"><div className="flex items-start gap-3"><div className="mt-0.5 text-muted-foreground">{icon}</div><div className="flex-1 text-sm"><span className="font-medium">{item.user?.name ?? "System"}</span> · {item.description}</div><div className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(item.createdAt)}</div></div></div>; }

export function DetailsCard({ lead }: { lead: Lead }) { return <Card title="Details">{kv("Stage", lead.status)}{kv("Owner", lead.assignedTo?.name ?? lead.assignedTo?.email ?? "Unassigned")}{kv("Source", lead.source ?? "—")}{kv("Phone", lead.phone ?? "—")}{kv("Website", lead.website ?? "—")}{kv("Reviews", reviewSummary(lead))}{kv("Created", new Date(lead.createdAt).toLocaleDateString())}</Card>; }
export function EngagementCard({ lead, score }: { lead: Lead; score: number }) { return <Card title="Engagement">{kv("Lead score", String(score))}{kv("Temperature", tempLabel(effectiveTempOf(lead)))}{kv("Last activity", "Recent")}
  <button className="text-xs text-indigo-600 hover:underline mt-2">Why?</button></Card>; }
export function PeopleCard({ lead }: { lead: Lead }) { return <Card title="People"><div className="flex items-center gap-3"><div className={`h-8 w-8 rounded-full grid place-items-center text-white text-xs ${avatarClass(fullNameOf(lead))}`}>{initials(fullNameOf(lead))}</div><div><div className="text-sm font-medium">{fullNameOf(lead)}</div><div className="text-xs text-muted-foreground">Primary contact</div></div></div><Button variant="ghost" size="sm" className="mt-3">View all <ChevronDown className="h-4 w-4"/></Button></Card>; }

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border bg-card p-4 shadow-sm"><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="space-y-2">{children}</div></section>; }
function kv(k: string, v: string) { return <div className="flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>; }
