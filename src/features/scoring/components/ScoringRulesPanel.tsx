"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { RotateCcw, Plus, Trash2, Eye } from "lucide-react";
import {
  scoreOf,
  scoreBreakdown,
  type ScoringRuleConfig,
  type Lead,
} from "@/features/leads/components/lead-list/shared";
import { SCORING_FACTORS } from "@/features/scoring/server/router";

const FACTOR_DESCRIPTIONS: Record<string, string> = {
  star_rating: "Google Maps star rating (0–5 stars)",
  review_count: "Number of Google reviews (log scale)",
  has_website: "Bonus if the lead has a website URL",
  lead_status: "Points based on lead pipeline status",
  call_activity: "Points based on last call outcome",
  business_category: "Points based on business source/category",
  last_contacted: "Recency bonus for recently contacted leads",
  appointment_booked: "Bonus for leads with CONNECTED status (appointment proxy)",
};

const PREVIEW_LEAD: Lead = {
  id: "preview",
  company: "Acme Plumbing",
  rating: 4.5,
  reviewCount: 87,
  website: "https://acmeplumbing.com",
  status: "CONNECTED",
  callOutcome: "ANSWERED",
  source: "Landscaping",
  createdAt: new Date().toISOString(),
};

type LocalRule = ScoringRuleConfig & { _dirty?: boolean };

export function ScoringRulesPanel() {
  const utils = trpc.useUtils();
  const { data: rawRules = [], isLoading } = trpc.scoring.getRules.useQuery();
  const [localRules, setLocalRules] = useState<LocalRule[] | null>(null);
  const [previewLead, setPreviewLead] = useState<Lead>(PREVIEW_LEAD);
  const [showPreview, setShowPreview] = useState(true);
  const [addingFactor, setAddingFactor] = useState(false);

  const upsert = trpc.scoring.upsertRule.useMutation({
    onSuccess: () => utils.scoring.getRules.invalidate(),
  });
  const deleteRule = trpc.scoring.deleteRule.useMutation({
    onSuccess: () => {
      utils.scoring.getRules.invalidate();
      setLocalRules(null);
    },
  });
  const resetDefaults = trpc.scoring.resetToDefaults.useMutation({
    onSuccess: () => {
      utils.scoring.getRules.invalidate();
      setLocalRules(null);
      toast.success("Scoring rules reset to defaults.");
    },
  });

  // Use local state when editing, fall back to server data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules: LocalRule[] = localRules ?? (rawRules as any[]).map((r) => ({
    ...r,
    config: r.config as Record<string, number> | null,
  }));

  const setRules = (updated: LocalRule[]) => setLocalRules(updated);

  const updateRule = useCallback((id: string, patch: Partial<LocalRule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch, _dirty: true } : r)));
  }, [rules]);

  const saveRule = useCallback((rule: LocalRule) => {
    if (!rule._dirty) return;
    upsert.mutate(
      {
        id: rule.id,
        factor: rule.factor as typeof SCORING_FACTORS[number],
        label: rule.label,
        maxPoints: rule.maxPoints,
        weight: rule.weight,
        config: rule.config ?? undefined,
        isActive: rule.isActive,
        sortOrder: rule.sortOrder,
      },
      {
        onSuccess: () => {
          setLocalRules((prev) =>
            prev ? prev.map((r) => (r.id === rule.id ? { ...r, _dirty: false } : r)) : null,
          );
          toast.success(`"${rule.label}" saved.`);
        },
        onError: () => toast.error("Failed to save rule."),
      },
    );
  }, [upsert]);

  const handleDelete = (rule: LocalRule) => {
    if (!confirm(`Delete rule "${rule.label}"?`)) return;
    deleteRule.mutate({ id: rule.id }, { onError: () => toast.error("Failed to delete rule.") });
  };

  const usedFactors = new Set(rules.map((r) => r.factor));
  const availableFactors = SCORING_FACTORS.filter((f) => !usedFactors.has(f));

  const score = scoreOf(previewLead, rules.filter((r) => r.isActive));
  const breakdown = scoreBreakdown(previewLead, rules.filter((r) => r.isActive));

  if (isLoading) {
    return <div style={{ padding: 32, color: "var(--crm-fg-faint)", fontSize: 13 }}>Loading scoring rules…</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: showPreview ? "1fr 320px" : "1fr", gap: 20, alignItems: "start" }}>
      {/* Rules editor */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Scoring Rules</h2>
          <button
            className="crm-btn ghost"
            style={{ fontSize: 12, height: 28, padding: "0 10px" }}
            onClick={() => setShowPreview((v) => !v)}
          >
            <Eye size={13} /> {showPreview ? "Hide" : "Show"} Preview
          </button>
          <button
            className="crm-btn ghost"
            style={{ fontSize: 12, height: 28, padding: "0 10px" }}
            onClick={() => {
              if (confirm("Reset all rules to factory defaults? This cannot be undone.")) {
                resetDefaults.mutate();
              }
            }}
            disabled={resetDefaults.isPending}
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>

        <div className="crm-card flush" style={{ overflow: "hidden" }}>
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 110px 80px 40px",
              gap: 8,
              padding: "8px 14px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--crm-fg-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid var(--crm-border)",
            }}
          >
            <span>Factor</span>
            <span>Max Points</span>
            <span>Weight</span>
            <span>Active</span>
            <span></span>
          </div>

          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 110px 80px 40px",
                gap: 8,
                padding: "10px 14px",
                borderBottom: "1px solid var(--crm-border)",
                alignItems: "center",
                opacity: rule.isActive ? 1 : 0.5,
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{rule.label}</div>
                <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginTop: 2 }}>
                  {FACTOR_DESCRIPTIONS[rule.factor] ?? rule.factor}
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={rule.maxPoints}
                  style={{ width: "100%" }}
                  onChange={(e) => updateRule(rule.id, { maxPoints: Number(e.target.value) })}
                  onMouseUp={() => saveRule(rule)}
                  onTouchEnd={() => saveRule(rule)}
                />
                <div style={{ fontSize: 11, textAlign: "center", color: "var(--crm-fg-faint)" }}>
                  {rule.maxPoints} pts
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={rule.weight}
                  style={{ width: "100%" }}
                  onChange={(e) => updateRule(rule.id, { weight: Number(e.target.value) })}
                  onMouseUp={() => saveRule(rule)}
                  onTouchEnd={() => saveRule(rule)}
                />
                <div style={{ fontSize: 11, textAlign: "center", color: "var(--crm-fg-faint)" }}>
                  ×{rule.weight.toFixed(1)}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  checked={rule.isActive}
                  onChange={(e) => {
                    const updated = { ...rule, isActive: e.target.checked, _dirty: true };
                    setRules(rules.map((r) => (r.id === rule.id ? updated : r)));
                    upsert.mutate({
                      id: rule.id,
                      factor: rule.factor as typeof SCORING_FACTORS[number],
                      label: rule.label,
                      maxPoints: rule.maxPoints,
                      weight: rule.weight,
                      isActive: e.target.checked,
                    });
                  }}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  className="crm-btn ghost"
                  style={{ width: 28, height: 28, padding: 0, color: "var(--crm-fg-faint)" }}
                  onClick={() => handleDelete(rule)}
                  title="Delete rule"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* Add factor */}
          {availableFactors.length > 0 && (
            <div style={{ padding: "10px 14px" }}>
              {addingFactor ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {availableFactors.map((factor) => (
                    <button
                      key={factor}
                      className="crm-btn ghost"
                      style={{ fontSize: 12, height: 28, padding: "0 10px" }}
                      onClick={() => {
                        upsert.mutate(
                          {
                            factor,
                            label: FACTOR_DESCRIPTIONS[factor]?.split(" ")[0] ?? factor,
                            maxPoints: 15,
                            weight: 1.0,
                            isActive: true,
                          },
                          {
                            onSuccess: () => {
                              utils.scoring.getRules.invalidate();
                              setLocalRules(null);
                              setAddingFactor(false);
                            },
                          },
                        );
                      }}
                    >
                      + {factor.replace(/_/g, " ")}
                    </button>
                  ))}
                  <button
                    className="crm-btn ghost"
                    style={{ fontSize: 12, height: 28, padding: "0 10px" }}
                    onClick={() => setAddingFactor(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="crm-btn ghost"
                  style={{ fontSize: 12, height: 28, padding: "0 10px" }}
                  onClick={() => setAddingFactor(true)}
                >
                  <Plus size={13} /> Add Factor
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "var(--crm-fg-faint)" }}>
          Total score = sum of active factor contributions, clamped to 0–100.
          Hot ≥ 70 · Warm ≥ 40 · Cool &lt; 40
        </div>
      </div>

      {/* Live preview */}
      {showPreview && (
        <div style={{ position: "sticky", top: 80 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Live Preview</h2>
          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", marginBottom: 12 }}>
              Adjust factors above to see how score changes
            </div>

            {/* Preview lead editor */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Rating (0–5)</label>
                  <input
                    type="number"
                    min={0} max={5} step={0.1}
                    value={previewLead.rating ?? ""}
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2 }}
                    onChange={(e) => setPreviewLead((l) => ({ ...l, rating: Number(e.target.value) || null }))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Reviews</label>
                  <input
                    type="number" min={0}
                    value={previewLead.reviewCount ?? ""}
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2 }}
                    onChange={(e) => setPreviewLead((l) => ({ ...l, reviewCount: Number(e.target.value) || null }))}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Status</label>
                <select
                  value={previewLead.status}
                  className="crm-input"
                  style={{ width: "100%", marginTop: 2 }}
                  onChange={(e) => setPreviewLead((l) => ({ ...l, status: e.target.value }))}
                >
                  {["CONNECTED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP", "NOT_CONTACTED"].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Call Outcome</label>
                <select
                  value={previewLead.callOutcome ?? "NOT_CONTACTED"}
                  className="crm-input"
                  style={{ width: "100%", marginTop: 2 }}
                  onChange={(e) => setPreviewLead((l) => ({ ...l, callOutcome: e.target.value }))}
                >
                  {["ANSWERED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP", "NOT_CONTACTED"].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  id="preview-website"
                  checked={!!previewLead.website}
                  onChange={(e) => setPreviewLead((l) => ({ ...l, website: e.target.checked ? "https://example.com" : null }))}
                />
                <label htmlFor="preview-website" style={{ fontSize: 12, cursor: "pointer" }}>Has website</label>
              </div>
            </div>

            {/* Score display */}
            <div
              style={{
                background: "var(--crm-surface-hover)",
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Total Score</span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: score >= 70 ? "var(--crm-accent)" : score >= 40 ? "oklch(74% 0.14 70)" : "var(--crm-fg-faint)",
                  }}
                >
                  {score}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, borderRadius: 3, background: "var(--crm-border)", overflow: "hidden", marginBottom: 12 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${score}%`,
                    borderRadius: 3,
                    background: score >= 70 ? "var(--crm-accent)" : score >= 40 ? "oklch(74% 0.14 70)" : "var(--crm-fg-faint)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>

              {/* Breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {breakdown.map((item) => (
                  <div key={item.factor} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--crm-fg-faint)" }}>{item.label}</span>
                    <span style={{ fontWeight: 500, color: item.points > 0 ? "var(--crm-fg)" : item.points < 0 ? "oklch(64% 0.18 25)" : "var(--crm-fg-faint)" }}>
                      {item.points > 0 ? "+" : ""}{item.points}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 8, fontSize: 11, color: "var(--crm-fg-faint)", textAlign: "right" }}>
                {score >= 70 ? "🔥 Hot" : score >= 40 ? "~ Warm" : "· Cool"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
