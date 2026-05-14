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
} from "lucide-react";
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
  type Lead,
  type LeadSort,
  type LeadSortKey,
} from "./shared";
import { NextActionChip, ScoreBar, StageTag, Touches } from "./LeadUi";

type LeadsTableProps = {
  allLeadsCount: number;
  filteredLeads: Lead[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  canGoPrevious: boolean;
  onClearStageFilters: () => void;
  onDeleteLead: (leadId: string) => void;
  onFetchNextPage: () => void;
  onFetchPreviousPage: () => void;
  onOpenLead: (lead: Lead) => void;
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
  filteredLeads,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  canGoPrevious,
  onClearStageFilters,
  onDeleteLead,
  onFetchNextPage,
  onFetchPreviousPage,
  onOpenLead,
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
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="crm-btn ghost">
            <Filter size={13} /> Filters
          </button>
          <button className="crm-btn ghost">
            <Columns size={13} /> Columns
          </button>
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
            {renderSortHeader("Lead", "firstName")}
            {renderSortHeader("Company", "company")}
            <th>Owner</th>
            {renderSortHeader("Stage", "status")}
            {renderSortHeader("Score", "score")}
            <th>Touches</th>
            <th>Next action</th>
            {renderSortHeader("Last touch", "createdAt")}
            <th />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
                Loading leads...
              </td>
            </tr>
          ) : filteredLeads.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--crm-fg-faint)" }}>
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
                  <td>
                    <div className="crm-contact">
                      <div className={`crm-avatar sm ${avatarClass(name)}`}>{initials(name)}</div>
                      <div className="crm-meta">
                        <span className="crm-n">{name}</span>
                        {lead.email ? <span className="crm-c">{lead.email}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ color: "var(--crm-fg)" }}>{lead.company || "-"}</span>
                      {lead.source ? (
                        <span style={{ color: "var(--crm-fg-faint)", fontSize: 11.5 }}>{lead.source}</span>
                      ) : null}
                    </div>
                  </td>
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
                  <td>
                    <StageTag status={lead.status} />
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <ScoreBar score={score} temp={temp} />
                      {reviews ? (
                        <span style={{ color: "var(--crm-fg-faint)", fontSize: 11.5 }}>{reviews}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <Touches count={touches} />
                  </td>
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
                  <td className="mono">{relativeTime(lead.createdAt)}</td>
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
