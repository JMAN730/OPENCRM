"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Columns,
  Filter,
  MoreHorizontal,
  MoreVertical,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  avatarClass,
  effectiveTempOf,
  fullNameOf,
  initials,
  relativeTime,
  reviewSummary,
  scoreOf,
  STAGE_ORDER,
  STATUS_LABELS,
  type AssignableUser,
  type Lead,
  type LeadSort,
  type LeadSortKey,
} from "./shared";
import { NextActionChip, ScoreBar, StageTag, Touches } from "./LeadUi";

const ALL_COLUMNS = ["Lead", "Company", "Owner", "Stage", "Score", "Touches", "Next action", "Last touch"] as const;
type ColumnName = typeof ALL_COLUMNS[number];

type CustomOutcomeTab = { id: string; label: string };

type LeadsTableProps = {
  allLeadsCount: number;
  customOutcomes?: CustomOutcomeTab[];
  filteredLeads: Lead[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  canGoPrevious: boolean;
  members: AssignableUser[];
  ownerFilter: Set<string>;
  scoreMin: number | null;
  scoreMax: number | null;
  onClearStageFilters: () => void;
  onDeleteLead: (leadId: string) => void;
  onFetchNextPage: () => void;
  onFetchPreviousPage: () => void;
  onOpenLead: (lead: Lead) => void;
  onOwnerToggle: (id: string) => void;
  onScoreChange: (min: number | null, max: number | null) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (key: LeadSortKey) => void;
  onToggleRowSelection: (leadId: string) => void;
  onToggleSelectAllRows: () => void;
  onToggleStage: (stage: string) => void;
  search: string;
  selectedIds: Set<string>;
  sortBy: LeadSort;
  stageCounts: Record<string, number>;
  stageFilter: Set<string>;
};

export function LeadsTable({
  allLeadsCount,
  customOutcomes,
  filteredLeads,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  canGoPrevious,
  members,
  ownerFilter,
  scoreMin,
  scoreMax,
  onClearStageFilters,
  onDeleteLead,
  onFetchNextPage,
  onFetchPreviousPage,
  onOpenLead,
  onOwnerToggle,
  onScoreChange,
  onSearchChange,
  onSortChange,
  onToggleRowSelection,
  onToggleSelectAllRows,
  onToggleStage,
  search,
  selectedIds,
  sortBy,
  stageCounts,
  stageFilter,
}: LeadsTableProps) {
  const allSelected =
    filteredLeads.length > 0 && filteredLeads.every((lead) => selectedIds.has(lead.id));

  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnName>>(new Set(ALL_COLUMNS));
  const [scoreMinInput, setScoreMinInput] = useState(scoreMin?.toString() ?? "");
  const [scoreMaxInput, setScoreMaxInput] = useState(scoreMax?.toString() ?? "");

  const filterRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen && !columnsOpen) return;
    function handleClick(e: MouseEvent) {
      if (filterOpen && filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (columnsOpen && columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen, columnsOpen]);

  const activeFilterCount =
    (ownerFilter.size > 0 ? 1 : 0) +
    (scoreMin !== null ? 1 : 0) +
    (scoreMax !== null ? 1 : 0);

  const toggleColumn = (col: ColumnName) => {
    const next = new Set(visibleColumns);
    if (next.has(col)) {
      if (next.size > 1) next.delete(col);
    } else {
      next.add(col);
    }
    setVisibleColumns(next);
  };

  const show = (col: ColumnName) => visibleColumns.has(col);

  const colSpan = 2 + ALL_COLUMNS.filter((c) => visibleColumns.has(c)).length;

  const renderSortHeader = (label: string, key: LeadSortKey) => {
    const active = sortBy.key === key;
    const Icon = active ? (sortBy.dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;

    return (
      <th onClick={() => onSortChange(key)} style={{ cursor: "pointer", userSelect: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {label}
          <span style={{ opacity: active ? 0.9 : 0.45, display: "inline-flex" }}>
            <Icon size={11} />
          </span>
        </span>
      </th>
    );
  };

  const popoverStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    minWidth: 220,
    padding: "12px",
    zIndex: 200,
    boxShadow: "0 4px 24px rgba(0,0,0,.18)",
    borderRadius: "var(--crm-radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    animation: "crm-fade-in 0.12s ease-out",
  };

  return (
    <div className="crm-card flush">
      <div className="crm-leads-toolbar">
        <div className="crm-search">
          <Search size={14} />
          <input
            placeholder="Search leads, companies, notes..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="crm-divider-v" />
        <button
          className="crm-chip"
          aria-pressed={stageFilter.size === 0}
          onClick={onClearStageFilters}
        >
          All <span className="crm-chip-count">{allLeadsCount}</span>
        </button>
        {STAGE_ORDER.map((stage) => (
          <button
            key={stage}
            className="crm-chip"
            aria-pressed={stageFilter.has(stage)}
            onClick={() => onToggleStage(stage)}
          >
            {STATUS_LABELS[stage]?.label ?? stage}
            <span className="crm-chip-count">{stageCounts[stage] ?? 0}</span>
          </button>
        ))}
        {customOutcomes?.map((co) => (
          <button
            key={co.id}
            className="crm-chip"
            aria-pressed={stageFilter.has(`CUSTOM:${co.id}`)}
            onClick={() => onToggleStage(`CUSTOM:${co.id}`)}
          >
            {co.label}
            <span className="crm-chip-count">{stageCounts[`CUSTOM:${co.id}`] ?? 0}</span>
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {/* Filters button */}
          <div style={{ position: "relative" }} ref={filterRef}>
            <button
              className="crm-btn ghost"
              onClick={() => { setFilterOpen((v) => !v); setColumnsOpen(false); }}
              aria-pressed={filterOpen}
            >
              <Filter size={13} />
              Filters
              {activeFilterCount > 0 && (
                <span
                  style={{
                    background: "var(--crm-accent)",
                    color: "var(--crm-fg-onaccent)",
                    borderRadius: "999px",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 5px",
                    lineHeight: 1.4,
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && (
              <div className="crm-card" style={popoverStyle}>
                {members.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Owner</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                      {members.map((m) => (
                        <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                          <span
                            className="crm-checkbox"
                            data-checked={ownerFilter.has(m.id)}
                            onClick={() => onOwnerToggle(m.id)}
                            style={{ flexShrink: 0 }}
                          >
                            {ownerFilter.has(m.id) ? <Check size={9} strokeWidth={2.6} /> : null}
                          </span>
                          {m.name || m.email || m.id}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Score</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      placeholder="Min"
                      min={0}
                      max={100}
                      value={scoreMinInput}
                      onChange={(e) => {
                        setScoreMinInput(e.target.value);
                        onScoreChange(e.target.value === "" ? null : Number(e.target.value), scoreMax);
                      }}
                      style={{ width: 64, padding: "4px 8px", borderRadius: "var(--crm-radius-sm)", border: "1px solid var(--crm-border)", fontSize: 13, background: "var(--crm-surface)" }}
                    />
                    <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>–</span>
                    <input
                      type="number"
                      placeholder="Max"
                      min={0}
                      max={100}
                      value={scoreMaxInput}
                      onChange={(e) => {
                        setScoreMaxInput(e.target.value);
                        onScoreChange(scoreMin, e.target.value === "" ? null : Number(e.target.value));
                      }}
                      style={{ width: 64, padding: "4px 8px", borderRadius: "var(--crm-radius-sm)", border: "1px solid var(--crm-border)", fontSize: 13, background: "var(--crm-surface)" }}
                    />
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <button
                    className="crm-btn ghost sm"
                    onClick={() => {
                      onScoreChange(null, null);
                      setScoreMinInput("");
                      setScoreMaxInput("");
                      members.forEach((m) => { if (ownerFilter.has(m.id)) onOwnerToggle(m.id); });
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <X size={12} /> Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Columns button */}
          <div style={{ position: "relative" }} ref={columnsRef}>
            <button
              className="crm-btn ghost"
              onClick={() => { setColumnsOpen((v) => !v); setFilterOpen(false); }}
              aria-pressed={columnsOpen}
            >
              <Columns size={13} /> Columns
            </button>

            {columnsOpen && (
              <div className="crm-card" style={popoverStyle}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Visible columns</div>
                {ALL_COLUMNS.map((col) => (
                  <label key={col} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                    <span
                      className="crm-checkbox"
                      data-checked={visibleColumns.has(col)}
                      onClick={() => toggleColumn(col)}
                      style={{ flexShrink: 0 }}
                    >
                      {visibleColumns.has(col) ? <Check size={9} strokeWidth={2.6} /> : null}
                    </span>
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button className="crm-btn ghost icon">
            <MoreVertical size={13} />
          </button>
        </div>
      </div>

      <table className="crm-table-v1">
        <thead>
          <tr>
            <th className="cb" onClick={(event) => event.stopPropagation()}>
              <span className="crm-checkbox" data-checked={allSelected} onClick={onToggleSelectAllRows}>
                {allSelected ? <Check size={9} strokeWidth={2.6} /> : null}
              </span>
            </th>
            {show("Lead") && renderSortHeader("Lead", "firstName")}
            {show("Company") && renderSortHeader("Company", "company")}
            {show("Owner") && renderSortHeader("Owner", "owner")}
            {show("Stage") && renderSortHeader("Stage", "status")}
            {show("Score") && renderSortHeader("Score", "score")}
            {show("Touches") && <th>Touches</th>}
            {show("Next action") && <th>Next action</th>}
            {show("Last touch") && renderSortHeader("Last touch", "createdAt")}
            <th />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={colSpan} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
                Loading leads...
              </td>
            </tr>
          ) : filteredLeads.length === 0 ? (
            <tr>
              <td colSpan={colSpan} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
                No leads found.
              </td>
            </tr>
          ) : (
            filteredLeads.map((lead) => {
              const name = fullNameOf(lead);
              const checked = selectedIds.has(lead.id);
              const score = scoreOf(lead);
              const temp = effectiveTempOf(lead);
              const touches = lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED" ? 1 : 0;
              const reviews = reviewSummary(lead);

              return (
                <tr key={lead.id} className={checked ? "selected" : ""} onClick={() => onOpenLead(lead)}>
                  <td
                    className="cb"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleRowSelection(lead.id);
                    }}
                  >
                    <span className="crm-checkbox" data-checked={checked}>
                      {checked ? <Check size={9} strokeWidth={2.6} /> : null}
                    </span>
                  </td>
                  {show("Lead") && (
                    <td>
                      <div className="crm-contact">
                        <div className={`crm-avatar sm ${avatarClass(name)}`}>{initials(name)}</div>
                        <div className="crm-meta">
                          <span className="crm-n">{name}</span>
                          {lead.email ? <span className="crm-c">{lead.email}</span> : null}
                        </div>
                      </div>
                    </td>
                  )}
                  {show("Company") && (
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "var(--crm-fg)" }}>{lead.company || "-"}</span>
                        {lead.source ? (
                          <span style={{ color: "var(--crm-fg-faint)", fontSize: 11.5 }}>{lead.source}</span>
                        ) : null}
                      </div>
                    </td>
                  )}
                  {show("Owner") && (
                    <td>
                      {lead.assignedTo ? (
                        <div className="crm-contact" title={lead.assignedTo.name || lead.assignedTo.email || ""}>
                          <div className={`crm-avatar xs ${avatarClass(lead.assignedTo.name || "?")}`}>
                            {initials(lead.assignedTo.name || lead.assignedTo.email || "?")}
                          </div>
                          <span style={{ fontSize: 12 }}>
                            {lead.assignedTo.name || lead.assignedTo.email || "-"}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>Unassigned</span>
                      )}
                    </td>
                  )}
                  {show("Stage") && (
                    <td>
                      <StageTag status={lead.status} />
                    </td>
                  )}
                  {show("Score") && (
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <ScoreBar score={score} temp={temp} />
                        {reviews ? (
                          <span style={{ color: "var(--crm-fg-faint)", fontSize: 11.5 }}>{reviews}</span>
                        ) : null}
                      </div>
                    </td>
                  )}
                  {show("Touches") && (
                    <td>
                      <Touches count={touches} />
                    </td>
                  )}
                  {show("Next action") && (
                    <td>
                      <NextActionChip
                        label={
                          lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED"
                            ? "Follow up"
                            : "First outreach"
                        }
                        state={lead.status === "CONNECTED" ? "today" : "upcoming"}
                      />
                    </td>
                  )}
                  {show("Last touch") && (
                    <td className="mono">{relativeTime(lead.createdAt)}</td>
                  )}
                  <td onClick={(event) => event.stopPropagation()}>
                    <button
                      className="crm-btn ghost sm icon"
                      title="Delete"
                      onClick={() => onDeleteLead(lead.id)}
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div
        style={{
          padding: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button className="crm-btn ghost sm" onClick={onFetchPreviousPage} disabled={!canGoPrevious || isFetchingNextPage}>
          Previous
        </button>
        <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>
          {isFetchingNextPage ? "Loading leads..." : "Showing up to 100 leads per page"}
        </span>
        <button className="crm-btn ghost sm" onClick={onFetchNextPage} disabled={!hasNextPage || isFetchingNextPage}>
          Next
        </button>
      </div>
    </div>
  );
}
