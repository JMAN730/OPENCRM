"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Columns, Filter, Search, X } from "lucide-react";
import {
  LEAD_VISIBLE_COLUMNS,
  STAGE_ORDER,
  STATUS_LABELS,
  type AssignableUser,
  type LeadSort,
  type LeadSortKey,
  type LeadVisibleColumn,
} from "./shared";

const SORT_OPTIONS: Array<{ key: LeadSortKey; label: string }> = [
  { key: "createdAt", label: "Last touch" },
  { key: "firstName", label: "Lead" },
  { key: "company", label: "Company" },
  { key: "status", label: "Stage" },
  { key: "score", label: "Score" },
  { key: "starred", label: "Favorites" },
];

type CustomOutcomeTab = { id: string; label: string };

type LeadsManagementBarProps = {
  allLeadsCount: number;
  filteredCount: number;
  filterOpen: boolean;
  columnsOpen: boolean;
  customOutcomes?: CustomOutcomeTab[];
  importAction: ReactNode;
  members: AssignableUser[];
  ownerFilter: Set<string>;
  scoreMin: number | null;
  scoreMax: number | null;
  search: string;
  sortBy: LeadSort;
  stageCounts: Record<string, number>;
  stageFilter: Set<string>;
  visibleColumns: Set<LeadVisibleColumn>;
  onClearStageFilters: () => void;
  onColumnsOpenChange: (open: boolean) => void;
  onFilterOpenChange: (open: boolean) => void;
  onOwnerToggle: (id: string) => void;
  onScoreChange: (min: number | null, max: number | null) => void;
  onSearchChange: (value: string) => void;
  onSortDirectionToggle: () => void;
  onSortKeyChange: (key: LeadSortKey) => void;
  onToggleColumn: (column: LeadVisibleColumn) => void;
  onToggleStage: (stage: string) => void;
};

export function LeadsManagementBar({
  allLeadsCount,
  filteredCount,
  filterOpen,
  columnsOpen,
  customOutcomes,
  importAction,
  members,
  ownerFilter,
  scoreMin,
  scoreMax,
  search,
  sortBy,
  stageCounts,
  stageFilter,
  visibleColumns,
  onClearStageFilters,
  onColumnsOpenChange,
  onFilterOpenChange,
  onOwnerToggle,
  onScoreChange,
  onSearchChange,
  onSortDirectionToggle,
  onSortKeyChange,
  onToggleColumn,
  onToggleStage,
}: LeadsManagementBarProps) {
  const filterRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen && !columnsOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (filterOpen && filterRef.current && !filterRef.current.contains(event.target as Node)) {
        onFilterOpenChange(false);
      }
      if (columnsOpen && columnsRef.current && !columnsRef.current.contains(event.target as Node)) {
        onColumnsOpenChange(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [columnsOpen, filterOpen, onColumnsOpenChange, onFilterOpenChange]);

  const activeFilterCount =
    (ownerFilter.size > 0 ? 1 : 0) +
    (scoreMin !== null ? 1 : 0) +
    (scoreMax !== null ? 1 : 0);

  const popoverStyle: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    minWidth: 220,
    padding: "12px",
    zIndex: 200,
    boxShadow: "0 4px 24px rgba(0,0,0,.18)",
    borderRadius: "var(--crm-radius)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  return (
    <section className="focus-management">
      <div className="focus-management-head">
        <div>
          <h3>All leads</h3>
          <p>
            {filteredCount} of {allLeadsCount} leads in the current view
          </p>
        </div>
        <div className="focus-management-actions">{importAction}</div>
      </div>

      <div className="focus-toolbar-row">
        <div className="crm-search focus-search">
          <Search size={14} />
          <input
            placeholder="Search leads..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className="focus-sort">
          <label className="focus-sort-label" htmlFor="lead-sort-key">
            Sort
          </label>
          <select
            id="lead-sort-key"
            aria-label="Sort leads by"
            className="focus-select"
            value={sortBy.key}
            onChange={(event) => onSortKeyChange(event.target.value as LeadSortKey)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="crm-btn ghost sm icon"
            onClick={onSortDirectionToggle}
            title={`Sort ${sortBy.dir === "desc" ? "ascending" : "descending"}`}
          >
            {sortBy.dir === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
          </button>
        </div>

        <div className="focus-toolbar-buttons">
          <div style={{ position: "relative" }} ref={filterRef}>
            <button
              className="crm-btn ghost"
              aria-pressed={filterOpen}
              onClick={() => {
                onFilterOpenChange(!filterOpen);
                onColumnsOpenChange(false);
              }}
            >
              <Filter size={13} />
              Filters
              {activeFilterCount > 0 ? (
                <span className="focus-count-badge">{activeFilterCount}</span>
              ) : null}
            </button>

            {filterOpen ? (
              <div className="crm-card" style={popoverStyle}>
                {members.length > 0 ? (
                  <div>
                    <div className="focus-popover-label">Owner</div>
                    <div className="focus-popover-list">
                      {members.map((member) => (
                        <label
                          key={member.id}
                          className="focus-popover-option"
                          onClick={() => onOwnerToggle(member.id)}
                        >
                          <span className="crm-checkbox" data-checked={ownerFilter.has(member.id)}>
                            {ownerFilter.has(member.id) ? <Check size={9} strokeWidth={2.6} /> : null}
                          </span>
                          {member.name || member.email || member.id}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="focus-popover-label">Score</div>
                  <div className="focus-score-range">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Min"
                      value={scoreMin?.toString() ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        onScoreChange(nextValue === "" ? null : Number(nextValue), scoreMax);
                      }}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Max"
                      value={scoreMax?.toString() ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        onScoreChange(scoreMin, nextValue === "" ? null : Number(nextValue));
                      }}
                    />
                  </div>
                </div>

                {activeFilterCount > 0 ? (
                  <button
                    className="crm-btn ghost sm"
                    onClick={() => {
                      onScoreChange(null, null);
                      for (const member of members) {
                        if (ownerFilter.has(member.id)) onOwnerToggle(member.id);
                      }
                    }}
                  >
                    <X size={12} /> Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ position: "relative" }} ref={columnsRef}>
            <button
              className="crm-btn ghost"
              aria-pressed={columnsOpen}
              onClick={() => {
                onColumnsOpenChange(!columnsOpen);
                onFilterOpenChange(false);
              }}
            >
              <Columns size={13} /> Columns
            </button>

            {columnsOpen ? (
              <div className="crm-card" style={popoverStyle}>
                <div className="focus-popover-label">Visible sections</div>
                {LEAD_VISIBLE_COLUMNS.map((column) => (
                  <label
                    key={column}
                    className="focus-popover-option"
                    onClick={() => onToggleColumn(column)}
                  >
                    <span className="crm-checkbox" data-checked={visibleColumns.has(column)}>
                      {visibleColumns.has(column) ? <Check size={9} strokeWidth={2.6} /> : null}
                    </span>
                    {column}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="focus-chip-row">
        <button className="crm-chip" aria-pressed={stageFilter.size === 0} onClick={onClearStageFilters}>
          All
          <span className="crm-chip-count">{allLeadsCount}</span>
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
      </div>
    </section>
  );
}
