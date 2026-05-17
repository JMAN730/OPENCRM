"use client";

import { useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/app/_trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { toast } from "sonner";
import { Phone, Mail, Star, Plus, MoreVertical, Filter, ArrowUpDown } from "lucide-react";
import { formatDistanceToNowStrict, differenceInDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type BoardData = inferRouterOutputs<AppRouter>["pipeline"]["getBoard"];
type Stage = BoardData["stages"][number];
type Lead = Stage["leads"][number];

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { color: string; prob: number }> = {
  "Potential":   { color: "oklch(72% 0.11 230)",  prob: 10  },
  "Qualified":   { color: "var(--crm-accent)",     prob: 30  },
  "Proposal":    { color: "oklch(70% 0.14 290)",   prob: 55  },
  "Negotiation": { color: "var(--crm-warn)",       prob: 75  },
  "Won":         { color: "var(--crm-pos)",        prob: 100 },
  "Lost":        { color: "var(--crm-neg)",        prob: 0   },
};

const ACTIVE_STAGES = ["Potential", "Qualified", "Proposal", "Negotiation", "Won"];
const LOST_STAGE    = "Lost";

function stageDisplayName(stageName: string) {
  return stageName === "New" ? "Potential" : stageName;
}

function stageKey(stage: Stage) {
  return stageDisplayName(stage.name);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtValue(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtValueFull(v: number | null | undefined) {
  if (v == null) return "—";
  return `$${Math.round(v).toLocaleString()}`;
}

function leadDisplayName(lead: Lead) {
  return lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed";
}

function leadLocation(lead: Lead) {
  return [lead.city, lead.state].filter(Boolean).join(", ");
}

function computeScore(lead: Lead): number {
  const base = (lead.temperatureOverride === "HOT" ? 70
    : lead.temperatureOverride === "WARM" ? 50
    : lead.temperatureOverride === "COOL" ? 25
    : 35);
  return Math.min(100, base + (lead.rating ?? 0) * 5);
}

function leadAge(lead: Lead): { label: string; stale: boolean } {
  const days = differenceInDays(new Date(), new Date(lead.updatedAt));
  if (days === 0) return { label: formatDistanceToNowStrict(new Date(lead.updatedAt)), stale: false };
  if (days < 14)  return { label: `${days}d`, stale: false };
  return { label: `${days}d`, stale: true };
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = ["c1","c2","c3","c4","c5","c6"] as const;
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── KPI computation ───────────────────────────────────────────────────────────

function computeKpis(stages: Stage[]) {
  const stageByName = Object.fromEntries(stages.map((s) => [stageKey(s), s]));
  const now = new Date();
  const openStages = ACTIVE_STAGES.filter((n) => n !== "Won");
  let openPipeline = 0, weightedForecast = 0;
  for (const name of openStages) {
    const s = stageByName[name];
    if (!s) continue;
    const prob = STAGE_CONFIG[name]?.prob ?? 0;
    for (const lead of s.leads) {
      openPipeline     += lead.value ?? 0;
      weightedForecast += (lead.value ?? 0) * (prob / 100);
    }
  }
  const wonStage = stageByName["Won"];
  let closedWonMtd = 0, totalCycleDays = 0, cycleCount = 0;
  if (wonStage) {
    for (const lead of wonStage.leads) {
      const updated = new Date(lead.updatedAt);
      if (updated.getFullYear() === now.getFullYear() && updated.getMonth() === now.getMonth()) {
        closedWonMtd += lead.value ?? 0;
      }
      const days = differenceInDays(updated, new Date(lead.createdAt));
      if (days > 0) { totalCycleDays += days; cycleCount++; }
    }
  }
  const avgCycle = cycleCount > 0 ? Math.round(totalCycleDays / cycleCount) : null;
  return { openPipeline, weightedForecast, closedWonMtd, avgCycle };
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, id, size = "sm" }: { name?: string | null; id?: string; size?: "sm" | "md" }) {
  const colorClass = id ? avatarColor(id) : "c1";
  const sz = size === "sm" ? 20 : 26;
  const fs = size === "sm" ? 9.5 : 11;
  return (
    <div className={`crm-avatar ${colorClass}`} style={{ width: sz, height: sz, fontSize: fs, flexShrink: 0 }} title={name ?? undefined}>
      {initials(name)}
    </div>
  );
}

// ── Temperature tag ───────────────────────────────────────────────────────────

function TempTag({ temp }: { temp: Lead["temperatureOverride"] }) {
  if (!temp) return null;
  const cls   = temp === "HOT" ? "hot" : temp === "WARM" ? "warm" : "cool";
  const label = temp === "HOT" ? "Hot"  : temp === "WARM" ? "Warm" : "Cool";
  return <span className={`crm-tag ${cls}`}>{label}</span>;
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, temp }: { score: number; temp: Lead["temperatureOverride"] }) {
  const cls = temp === "HOT" ? "t-hot" : temp === "COOL" ? "t-cool" : "";
  return (
    <span className="crm-score" style={{ fontSize: 11 }}>
      <span className={`crm-score-bar ${cls}`} style={{ width: 28, height: 4 }}>
        <span style={{ width: `${score}%` }} />
      </span>
      {score}
    </span>
  );
}

// ── Lead card ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, onDragStart, onDragEnd }: {
  lead: Lead;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onDragEnd:   (e: React.DragEvent) => void;
}) {
  const score  = computeScore(lead);
  const age    = leadAge(lead);
  const name   = leadDisplayName(lead);
  const srcStr = [leadLocation(lead), lead.source].filter(Boolean).join(" · ");

  return (
    <article className="crm-pipeline-lead" draggable onDragStart={(e) => onDragStart(e, lead)} onDragEnd={onDragEnd}>
      <div className="crm-pipeline-lead-top">
        <Avatar name={name} id={lead.id} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crm-pipeline-lead-name">{name}</div>
          {srcStr && <div className="crm-pipeline-lead-company">{srcStr}</div>}
        </div>
        {lead.starred && <span className="crm-pipeline-lead-star on"><Star size={13} fill="currentColor" /></span>}
      </div>
      <div className="crm-pipeline-lead-row">
        <span className="crm-pipeline-lead-value">{fmtValueFull(lead.value)}</span>
        <TempTag temp={lead.temperatureOverride} />
      </div>
      <div className="crm-pipeline-lead-foot">
        <ScoreBar score={score} temp={lead.temperatureOverride} />
        <span className={`crm-pipeline-age${age.stale ? " stale" : ""}`}>{age.label}</span>
        <span style={{ flex: 1 }} />
        <div className="crm-pipeline-actions">
          <button title="Call" onClick={(e) => e.stopPropagation()}><Phone size={12} /></button>
          <button title="Email" onClick={(e) => e.stopPropagation()}><Mail size={12} /></button>
          {lead.assignedTo && <Avatar name={lead.assignedTo.name} id={lead.assignedTo.id} size="sm" />}
        </div>
      </div>
    </article>
  );
}

// ── Stage column ──────────────────────────────────────────────────────────────

function StageColumn({ stage, leads, dragOverStageId, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, onAddDeal }: {
  stage: Stage; leads: Lead[]; dragOverStageId: string | null;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onDragEnd:   (e: React.DragEvent) => void;
  onDragOver:  (e: React.DragEvent, stageId: string) => void;
  onDragLeave: (e: React.DragEvent, stageId: string) => void;
  onDrop:      (e: React.DragEvent, stageId: string) => void;
  onAddDeal:   (stage: Stage) => void;
}) {
  const name    = stageDisplayName(stage.name);
  const cfg     = STAGE_CONFIG[name] ?? { color: "var(--crm-fg-faint)", prob: 0 };
  const total   = leads.reduce((s, l) => s + (l.value ?? 0), 0);
  const barPct  = name === "Won" ? 100 : Math.min(100, Math.round((total / 600_000) * 100));
  const isOver  = dragOverStageId === stage.id;

  return (
    <section className={`crm-pipeline-col${isOver ? " drag-over" : ""}`}>
      <header className="crm-pipeline-col-head">
        <div className="crm-pipeline-col-head-top">
          <span className="crm-pipeline-col-dot" style={{ background: cfg.color }} />
          <span className="crm-pipeline-col-name">{name}</span>
          <span className="crm-pipeline-col-count">{leads.length}</span>
          <button className="crm-btn ghost icon crm-pipeline-col-menu" aria-label="Column actions" style={{ marginLeft: "auto" }}>
            <MoreVertical size={13} />
          </button>
        </div>
        <div className="crm-pipeline-col-meta">
          <span className="crm-pipeline-col-value">{fmtValue(total)}</span>
          <span className="crm-pipeline-col-prob">{name === "Won" ? "· closed" : `· ${cfg.prob}% weighted`}</span>
        </div>
        <div className="crm-pipeline-col-bar">
          <span style={{ width: `${barPct}%`, background: cfg.color }} />
        </div>
      </header>
      <div
        className="crm-pipeline-col-body"
        onDragOver={(e) => onDragOver(e, stage.id)}
        onDragLeave={(e) => onDragLeave(e, stage.id)}
        onDrop={(e) => onDrop(e, stage.id)}
      >
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
        <button
          type="button"
          className="crm-pipeline-col-add"
          onClick={() => onAddDeal(stage)}
        >
          <Plus size={12} />
          {stage.name === "Won" ? "Log won deal" : "Add deal"}
        </button>
      </div>
    </section>
  );
}

// ── Lost lane ─────────────────────────────────────────────────────────────────

function LostLane({ leads, dragOverStageId, stageId, onDragOver, onDragLeave, onDrop }: {
  leads: Lead[]; dragOverStageId: string | null; stageId: string;
  onDragOver:  (e: React.DragEvent, id: string) => void;
  onDragLeave: (e: React.DragEvent, id: string) => void;
  onDrop:      (e: React.DragEvent, id: string) => void;
}) {
  const total  = leads.reduce((s, l) => s + (l.value ?? 0), 0);
  const isOver = dragOverStageId === stageId;
  return (
    <section className={`crm-pipeline-lost-lane${isOver ? " drag-over" : ""}`}>
      <div className="crm-pipeline-lane-row">
        <div className="crm-pipeline-lane-head">
          <span className="crm-pipeline-col-dot" style={{ background: "var(--crm-neg)" }} />
          <div>
            <div className="crm-pipeline-lane-title">Lost</div>
            <div className="crm-pipeline-lane-sub">{leads.length} deal{leads.length !== 1 ? "s" : ""} · {fmtValue(total)}</div>
          </div>
        </div>
        <div className="crm-pipeline-lane-actions">
          <button className="crm-btn ghost">View all</button>
        </div>
      </div>
      <div
        className="crm-pipeline-lost-strip"
        onDragOver={(e) => onDragOver(e, stageId)}
        onDragLeave={(e) => onDragLeave(e, stageId)}
        onDrop={(e) => onDrop(e, stageId)}
      >
        {leads.length === 0
          ? <div style={{ fontSize: 13, color: "var(--crm-fg-faint)", padding: "8px 4px" }}>No lost deals</div>
          : leads.map((lead) => {
              const name = leadDisplayName(lead);
              const age  = leadAge(lead);
              return (
                <div key={lead.id} className="crm-pipeline-lost-card">
                  <Avatar name={name} id={lead.id} size="sm" />
                  <div className="crm-pipeline-lost-who">
                    <span className="n">{name}</span>
                    <span className="c">{age.label}</span>
                  </div>
                  <span className="crm-pipeline-lost-val">{fmtValueFull(lead.value)}</span>
                </div>
              );
            })
        }
      </div>
    </section>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────────

function KpiStrip({ stages }: { stages: Stage[] }) {
  const { openPipeline, weightedForecast, closedWonMtd, avgCycle } = computeKpis(stages);
  const totalLeads = stages.filter((s) => ACTIVE_STAGES.includes(stageKey(s))).reduce((sum, s) => sum + s.leads.length, 0);
  const kpis = [
    { lbl: "Open pipeline",     val: fmtValue(openPipeline),     foot: `${totalLeads} active deals` },
    { lbl: "Weighted forecast", val: fmtValue(weightedForecast), foot: "probability-weighted"       },
    { lbl: "Closed won · MTD",  val: fmtValue(closedWonMtd),    foot: "this month"                 },
    { lbl: "Avg. cycle",        val: avgCycle != null ? `${avgCycle}d` : "—", foot: "days to close" },
  ];
  return (
    <div className="crm-pipeline-kpi-strip">
      {kpis.map(({ lbl, val, foot }) => (
        <div key={lbl} className="crm-pipeline-kpi">
          <span className="lbl">{lbl}</span>
          <span className="val">{val}</span>
          <span className="foot"><span className="delta flat">—</span><span>{foot}</span></span>
        </div>
      ))}
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

type FilterChip = "all" | "mine" | "closing" | "idle" | "hot";
type ViewTab    = "board" | "table" | "forecast";

export function PipelineBoard() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const [activeFilter, setActiveFilter] = useState<FilterChip>("all");
  const [viewTab, setViewTab]           = useState<ViewTab>("board");
  const draggingRef                     = useRef<Lead | null>(null);
  const [dragOverId, setDragOverId]     = useState<string | null>(null);

  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [dealStage, setDealStage]           = useState<Stage | null>(null);
  const [dealCompany, setDealCompany]       = useState("");
  const [dealValue, setDealValue]           = useState("");

  const { data, isLoading } = trpc.pipeline.getBoard.useQuery();

  const createDeal = trpc.pipeline.createDeal.useMutation({
    onSuccess: () => {
      toast.success("Deal created");
      setDealDialogOpen(false);
      setDealCompany("");
      setDealValue("");
      setDealStage(null);
      void utils.pipeline.getBoard.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create deal");
    },
  });

  const openDealDialog = useCallback((stage: Stage | null) => {
    setDealStage(stage);
    setDealCompany("");
    setDealValue("");
    setDealDialogOpen(true);
  }, []);

  const submitDeal = useCallback(() => {
    const company = dealCompany.trim();
    if (!company) {
      toast.error("Company is required");
      return;
    }
    const parsedValue = dealValue.trim() === "" ? null : Number(dealValue.replace(/[^0-9.]/g, ""));
    if (parsedValue != null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      toast.error("Value must be a positive number");
      return;
    }
    createDeal.mutate({
      company,
      value: parsedValue,
      stageId: dealStage?.id ?? null,
    });
  }, [dealCompany, dealValue, dealStage, createDeal]);

  const moveLead = trpc.pipeline.moveLead.useMutation({
    onMutate: async ({ leadId, stageId }) => {
      await utils.pipeline.getBoard.cancel();
      const prev = utils.pipeline.getBoard.getData();
      utils.pipeline.getBoard.setData(undefined, (old) => {
        if (!old) return old;
        const lead = old.stages.flatMap((s) => s.leads).find((l) => l.id === leadId);
        const stages = old.stages.map((s) => ({ ...s, leads: s.leads.filter((l) => l.id !== leadId) }));
        if (stageId && lead) {
          return { ...old, stages: stages.map((s) => s.id === stageId ? { ...s, leads: [...s.leads, lead] } : s) };
        }
        return { ...old, stages };
      });
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.pipeline.getBoard.setData(undefined, ctx?.prev);
      toast.error("Failed to move deal");
    },
    onSettled: () => void utils.pipeline.getBoard.invalidate(),
  });

  const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
    draggingRef.current = lead;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", lead.id); } catch { /* noop */ }
    (e.currentTarget as HTMLElement).classList.add("dragging");
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove("dragging");
    draggingRef.current = null;
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stageId: string) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(stageId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent, stageId: string) => {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
    setDragOverId((prev) => (prev === stageId ? null : prev));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const lead = draggingRef.current;
    if (!lead) return;
    moveLead.mutate({ leadId: lead.id, stageId });
  }, [moveLead]);

  if (isLoading) {
    return (
      <div className="crm-content">
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 14 }}>
          Loading pipeline…
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { stages } = data;
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";

  function filterLeads(leads: Lead[]): Lead[] {
    if (activeFilter === "mine")    return leads.filter((l) => l.assignedTo?.id === userId);
    if (activeFilter === "hot")     return leads.filter((l) => l.temperatureOverride === "HOT");
    if (activeFilter === "idle")    return leads.filter((l) => differenceInDays(new Date(), new Date(l.updatedAt)) > 14);
    if (activeFilter === "closing") {
      const now = new Date();
      return leads.filter((l) => {
        const d = new Date(l.updatedAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
    }
    return leads;
  }

  const stageByName  = Object.fromEntries(stages.map((s) => [stageKey(s), s]));
  const activeStages = ACTIVE_STAGES.map((n) => stageByName[n]).filter(Boolean) as Stage[];
  const lostStage    = stageByName[LOST_STAGE];

  const CHIP_LABELS: { id: FilterChip; label: string }[] = [
    { id: "all",     label: "All deals"         },
    { id: "mine",    label: "Mine"               },
    { id: "closing", label: "Closing this month" },
    { id: "idle",    label: "Idle > 14d"         },
    { id: "hot",     label: "Hot"                },
  ];

  return (
    <div className="crm-content">
      <div className="crm-page-head">
        <div>
          <h1 className="crm-page-title">Pipeline</h1>
          <div className="crm-page-sub">
            Sales pipeline · {activeStages.reduce((s, st) => s + st.leads.length, 0)} active deals
          </div>
        </div>
        <div className="crm-page-head-actions">
          <div className="crm-pipeline-tabs" role="group" aria-label="Pipeline view">
            {(["board", "table", "forecast"] as const).map((t) => (
              <button key={t} aria-pressed={viewTab === t} onClick={() => setViewTab(t)} style={{ textTransform: "capitalize" }}>{t}</button>
            ))}
          </div>
          <button
            type="button"
            className="crm-btn primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => openDealDialog(null)}
          >
            <Plus size={13} /> New deal
          </button>
        </div>
      </div>

      <KpiStrip stages={stages} />

      <div className="crm-pipeline-toolbar">
        {CHIP_LABELS.map(({ id, label }) => (
          <button key={id} className="crm-pipeline-chip" aria-pressed={activeFilter === id} onClick={() => setActiveFilter(id)}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="crm-btn ghost" style={{ display: "flex", alignItems: "center", gap: 6 }}><Filter size={13} /> Filter</button>
        <button className="crm-btn ghost" style={{ display: "flex", alignItems: "center", gap: 6 }}><ArrowUpDown size={13} /> Sort: Value</button>
      </div>

      {viewTab === "board" ? (
        <>
          <div className="crm-pipeline-board-scroll">
            <div className="crm-pipeline-board">
              {activeStages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  leads={filterLeads(stage.leads)}
                  dragOverStageId={dragOverId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onAddDeal={openDealDialog}
                />
              ))}
            </div>
          </div>
          {lostStage && (
            <LostLane
              leads={filterLeads(lostStage.leads)}
              dragOverStageId={dragOverId}
              stageId={lostStage.id}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          )}
        </>
      ) : (
        <div className="crm-card" style={{ padding: "48px 24px", textAlign: "center", color: "var(--crm-fg-faint)" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--crm-fg)" }}>
            {viewTab.charAt(0).toUpperCase() + viewTab.slice(1)} view
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>Coming soon</p>
        </div>
      )}

      <Dialog open={dealDialogOpen} onOpenChange={setDealDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dealStage?.name === "Won" ? "Log won deal" : "New deal"}
            </DialogTitle>
            <DialogDescription>
              {dealStage
                ? `Add a deal to the ${stageDisplayName(dealStage.name)} stage.`
                : "Add a new deal to your pipeline."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitDeal();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-company">Company</Label>
              <Input
                id="deal-company"
                autoFocus
                value={dealCompany}
                onChange={(e) => setDealCompany(e.target.value)}
                placeholder="Acme Inc."
                disabled={createDeal.isPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-value">Value (USD)</Label>
              <Input
                id="deal-value"
                inputMode="decimal"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0"
                disabled={createDeal.isPending}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDealDialogOpen(false)}
                disabled={createDeal.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createDeal.isPending}>
                {createDeal.isPending ? "Creating…" : "Create deal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
