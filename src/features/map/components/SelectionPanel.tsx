"use client";

import { Loader2, MapPin, Sparkles, SquareDashed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SelectedItem } from "./LeadMapInner";

type JobStatus = {
  status: string;
  totalQueries: number;
  completedQueries: number;
  failedQueries: number;
  error: string | null;
} | null;

export function SelectionPanel({
  categories,
  category,
  onCategoryChange,
  onDiscover,
  discovering,
  discoveredCount,
  selecting,
  onToggleSelecting,
  selected,
  onRemove,
  onClear,
  onEnrich,
  enrichEnabled,
  enrichStarting,
  jobStatus,
  missingCount,
  onLocateLeads,
  locating,
}: {
  categories: string[];
  category: string;
  onCategoryChange: (value: string) => void;
  onDiscover: () => void;
  discovering: boolean;
  discoveredCount: number;
  selecting: boolean;
  onToggleSelecting: () => void;
  selected: SelectedItem[];
  onRemove: (key: string) => void;
  onClear: () => void;
  onEnrich: () => void;
  enrichEnabled: boolean;
  enrichStarting: boolean;
  jobStatus: JobStatus;
  missingCount: number;
  onLocateLeads: () => void;
  locating: boolean;
}) {
  const jobRunning = jobStatus?.status === "PENDING" || jobStatus?.status === "RUNNING";

  return (
    <div className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
      {missingCount > 0 && (
        <div className="crm-card">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <div className="flex-1 text-sm">
              <p className="font-medium">{missingCount} lead(s) have no location</p>
              <p className="text-muted-foreground">
                Locate them from their Maps link or city to see them on the map.
              </p>
            </div>
          </div>
          <Button
            className="mt-3 w-full"
            variant="outline"
            size="sm"
            disabled={locating}
            onClick={onLocateLeads}
          >
            {locating && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {locating ? "Locating…" : "Locate leads"}
          </Button>
        </div>
      )}

      <div className="crm-card">
        <div className="crm-card-head">
          <h3>Discover businesses</h3>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Pick a category…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={discovering || !category} onClick={onDiscover}>
            {discovering && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {discovering ? "Searching…" : "Discover in this area"}
          </Button>
          {discoveredCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {discoveredCount} discovered business(es) shown as amber pins.
            </p>
          )}
        </div>
      </div>

      <div className="crm-card flex-1">
        <div className="crm-card-head">
          <h3>Selection ({selected.length})</h3>
          <div className="flex items-center gap-1">
            <Button
              variant={selecting ? "secondary" : "ghost"}
              size="icon-sm"
              title="Draw a rectangle to select pins"
              onClick={onToggleSelecting}
            >
              <SquareDashed />
            </Button>
            {selected.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {selected.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Click pins on the map (or use the rectangle tool) to build a selection,
            then enrich it to pull in websites, emails, phone numbers and ratings.
          </p>
        ) : (
          <ul className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {selected.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    item.kind === "lead" ? "bg-blue-600" : "bg-amber-500",
                  )}
                />
                <span className="flex-1 truncate">
                  {item.kind === "lead"
                    ? item.lead.company ||
                      [item.lead.firstName, item.lead.lastName].filter(Boolean).join(" ") ||
                      "Unnamed lead"
                    : item.osm.name}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onRemove(item.key)}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button
          className="mt-3 w-full"
          disabled={!enrichEnabled || selected.length === 0 || enrichStarting || jobRunning}
          onClick={onEnrich}
          title={enrichEnabled ? undefined : "Enrichment requires the scraper feature to be enabled."}
        >
          {(enrichStarting || jobRunning) && (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          )}
          {!enrichStarting && !jobRunning && <Sparkles data-icon="inline-start" />}
          {jobRunning
            ? `Enriching ${jobStatus?.completedQueries ?? 0}/${jobStatus?.totalQueries ?? 0}…`
            : `Enrich selected (${selected.length})`}
        </Button>
        {jobRunning && (
          <p className="mt-2 text-xs text-muted-foreground">
            Scraping websites and contact pages for the selected businesses. This can
            take a minute — results land on the leads automatically.
          </p>
        )}
      </div>
    </div>
  );
}
