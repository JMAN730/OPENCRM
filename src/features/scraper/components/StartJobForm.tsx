"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Play, Loader2, Plus, Trash2 } from "lucide-react";

type OrgCategory = { id: string; name: string };

type Config = {
  enabled: boolean;
  categories: readonly string[];
  orgCategories?: OrgCategory[];
  maxLocations: number;
  maxLimit: number;
  maxConcurrency: number;
};

interface Props {
  config: Config;
  onStarted: () => void;
}

export function StartJobForm({ config, onStarted }: Props) {
  const [locationsBlob, setLocationsBlob] = useState("");
  const [limit, setLimit] = useState(20);
  const [concurrency, setConcurrency] = useState(1);
  const [autoImport, setAutoImport] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState("");

  const utils = trpc.useUtils();

  const start = trpc.scraper.start.useMutation({
    onSuccess: () => {
      toast.success("Scraper job started.");
      setLocationsBlob("");
      onStarted();
    },
    onError: (err) => toast.error(err.message),
  });

  const createCategory = trpc.scraper.createCategory.useMutation({
    onSuccess: () => {
      toast.success("Category added.");
      setNewCatName("");
      void utils.scraper.config.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCategory = trpc.scraper.deleteCategory.useMutation({
    onSuccess: (_, variables) => {
      setSelectedCategories((prev) => prev.filter((c) => c !== (config.orgCategories?.find((o) => o.id === variables.id)?.name)));
      void utils.scraper.config.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const locations = locationsBlob
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (locations.length === 0) {
      toast.error("Enter at least one location.");
      return;
    }
    if (locations.length > config.maxLocations) {
      toast.error(`Max ${config.maxLocations} locations per job.`);
      return;
    }
    start.mutate({
      locations,
      limit,
      concurrency,
      autoImport,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
    });
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a new scrape</CardTitle>
        <CardDescription>
          Locations run sequentially. Each location scrapes all selected categories.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="locations">Locations</Label>
            <textarea
              id="locations"
              value={locationsBlob}
              onChange={(e) => setLocationsBlob(e.target.value)}
              placeholder={`Toledo, Ohio\nColumbus, Ohio\nCincinnati, Ohio`}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              One per line, or comma-separated. Letters, digits, spaces, and basic punctuation only. Max {config.maxLocations}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="limit">Results per category</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={config.maxLimit}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 20)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="concurrency">Category concurrency</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={config.maxConcurrency}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categories (optional — leave empty for all)</Label>
            <div className="flex flex-wrap gap-2">
              {config.categories.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-transparent hover:bg-muted"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {(config.orgCategories ?? []).length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Custom categories</p>
                <div className="flex flex-wrap gap-2">
                  {(config.orgCategories ?? []).map((cat) => {
                    const active = selectedCategories.includes(cat.name);
                    return (
                      <div key={cat.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.name)}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-transparent hover:bg-muted"
                          }`}
                        >
                          {cat.name}
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteCategory.mutate({ id: cat.id })}
                          title="Remove category"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2 items-center">
              <Input
                placeholder="Add custom category…"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newCatName.trim()) createCategory.mutate({ name: newCatName.trim() });
                  }
                }}
                className="h-7 text-xs"
              />
              <button
                type="button"
                className="crm-btn ghost sm icon"
                disabled={!newCatName.trim() || createCategory.isPending}
                onClick={() => {
                  if (newCatName.trim()) createCategory.mutate({ name: newCatName.trim() });
                }}
                title="Add category"
              >
                <Plus size={14} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Leave empty to use every built-in category for each location.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={autoImport}
              onCheckedChange={(v) => setAutoImport(v === true)}
            />
            <span>Auto-import results into Leads when scraping completes</span>
          </label>

          <Button type="submit" disabled={start.isPending} className="gap-2">
            {start.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {start.isPending ? "Starting..." : "Start scrape"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
