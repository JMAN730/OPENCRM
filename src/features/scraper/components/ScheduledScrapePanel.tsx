"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduledScrapePanel() {
  const utils = trpc.useUtils();
  const { data: schedules = [], isLoading } = trpc.scraperSchedules.list.useQuery();

  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hourOfDay, setHourOfDay] = useState(8);
  const [autoOutreach, setAutoOutreach] = useState(false);

  const createSchedule = trpc.scraperSchedules.create.useMutation({
    onSuccess: () => {
      toast.success("Schedule created.");
      setOpen(false);
      setLocations("");
      void utils.scraperSchedules.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteSchedule = trpc.scraperSchedules.delete.useMutation({
    onSuccess: () => {
      toast.success("Schedule deleted.");
      void utils.scraperSchedules.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleEnabled = trpc.scraperSchedules.update.useMutation({
    onSuccess: () => void utils.scraperSchedules.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    const locs = locations
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (locs.length === 0) {
      toast.error("Enter at least one location.");
      return;
    }
    createSchedule.mutate({ locations: locs, dayOfWeek, hourOfDay, autoOutreach });
  };

  return (
    <div className="space-y-3">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Scheduled scrapes</h3>
          <p style={{ fontSize: 12, color: "var(--crm-fg-faint)", marginTop: 2 }}>
            Run scraper jobs automatically on a weekly schedule (UTC time).
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus size={13} /> New schedule
        </Button>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 13, color: "var(--crm-fg-faint)" }}>Loading…</div>
      ) : schedules.length === 0 ? (
        <div className="crm-card" style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--crm-fg-faint)" }}>
          No scheduled scrapes. Click &ldquo;New schedule&rdquo; to automate weekly imports.
        </div>
      ) : (
        <div className="crm-card" style={{ overflow: "hidden" }}>
          {schedules.map((s, i) => {
            const locs = (s.locations as string[]).join(", ");
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom: i < schedules.length - 1 ? "1px solid var(--crm-border-faint)" : "none",
                }}
              >
                <Clock size={14} style={{ color: "var(--crm-fg-faint)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{locs}</div>
                  <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginTop: 2 }}>
                    Every {DAY_LABELS[s.dayOfWeek]} at {String(s.hourOfDay).padStart(2, "0")}:00 UTC
                    {s.nextRunAt ? (
                      <span> · next: {new Date(s.nextRunAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                    ) : null}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => toggleEnabled.mutate({ id: s.id, enabled: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  className="crm-btn ghost icon sm"
                  title="Delete schedule"
                  onClick={() => {
                    if (confirm("Delete this schedule?")) deleteSchedule.mutate({ id: s.id });
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New weekly schedule</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label>Locations</Label>
              <textarea
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="Tampa, FL&#10;Orlando, FL"
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Day of week</Label>
                <select
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                >
                  {DAY_LABELS.map((label, idx) => (
                    <option key={label} value={idx}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Hour (UTC)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={hourOfDay}
                  onChange={(e) => setHourOfDay(Number(e.target.value))}
                />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoOutreach}
                onChange={(e) => setAutoOutreach(e.target.checked)}
              />
              Auto-generate a demo site + outreach email draft for each imported lead
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createSchedule.isPending}>
              {createSchedule.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
