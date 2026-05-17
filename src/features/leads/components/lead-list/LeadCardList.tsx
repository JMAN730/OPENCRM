"use client";

import { ArrowUpRight, Check, Mail, Phone, Trash2 } from "lucide-react";
import { NextActionChip, ScoreBar, StageTag, Touches } from "./LeadUi";
import {
  avatarClass,
  effectiveTempOf,
  fullNameOf,
  initials,
  lastTouchOf,
  nextActionForLead,
  relativeTime,
  reviewSummary,
  scoreOf,
  touchesOf,
  type Lead,
  type LeadVisibleColumn,
} from "./shared";

type LeadCardListProps = {
  canGoPrevious: boolean;
  filteredLeads: Lead[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  onDeleteLead: (leadId: string) => void;
  onFetchNextPage: () => void;
  onFetchPreviousPage: () => void;
  onOpenLead: (lead: Lead) => void;
  onToggleRowSelection: (leadId: string) => void;
  onToggleSelectAllRows: () => void;
  selectedIds: Set<string>;
  visibleColumns: Set<LeadVisibleColumn>;
};

export function LeadCardList({
  canGoPrevious,
  filteredLeads,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  onDeleteLead,
  onFetchNextPage,
  onFetchPreviousPage,
  onOpenLead,
  onToggleRowSelection,
  onToggleSelectAllRows,
  selectedIds,
  visibleColumns,
}: LeadCardListProps) {
  const allSelected =
    filteredLeads.length > 0 && filteredLeads.every((lead) => selectedIds.has(lead.id));
  const show = (column: LeadVisibleColumn) => visibleColumns.has(column);

  return (
    <section className="focus-all-leads">
      <div className="focus-all-leads-head">
        <button className="focus-select-visible" onClick={onToggleSelectAllRows}>
          <span className="crm-checkbox" data-checked={allSelected}>
            {allSelected ? <Check size={9} strokeWidth={2.6} /> : null}
          </span>
          Select visible
        </button>
        <span>
          {filteredLeads.length} lead{filteredLeads.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <div className="focus-list-state">Loading leads...</div>
      ) : filteredLeads.length === 0 ? (
        <div className="focus-list-state">No leads found.</div>
      ) : (
        <div className="focus-grid">
          {filteredLeads.map((lead) => {
            const selected = selectedIds.has(lead.id);
            const name = fullNameOf(lead);
            const temp = effectiveTempOf(lead);
            const nextAction = nextActionForLead(lead);
            const scoreSummary = reviewSummary(lead);
            const leadScore = scoreOf(lead);

            return (
              <article
                key={lead.id}
                className={`focus-card ${selected ? "selected" : ""}`}
                onClick={() => onOpenLead(lead)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenLead(lead);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="focus-card-top">
                  <button
                    className="focus-card-select"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleRowSelection(lead.id);
                    }}
                  >
                    <span className="crm-checkbox" data-checked={selected}>
                      {selected ? <Check size={9} strokeWidth={2.6} /> : null}
                    </span>
                  </button>
                  <div className="focus-card-identity">
                    {show("Lead") ? (
                      <>
                        <div className={`crm-avatar sm ${avatarClass(name)}`}>{initials(name)}</div>
                        <div className="focus-card-name-block">
                          <span className="focus-card-name">{name}</span>
                          {lead.email ? <span className="focus-card-subline">{lead.email}</span> : null}
                        </div>
                      </>
                    ) : (
                      <div className="focus-card-name-block compact">
                        <span className="focus-card-name">{lead.company || name}</span>
                        {!show("Company") ? <span className="focus-card-subline">{name}</span> : null}
                      </div>
                    )}
                  </div>
                  {show("Stage") ? <StageTag status={lead.status} /> : null}
                  <button
                    className="crm-btn ghost sm icon"
                    title="Delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteLead(lead.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {show("Company") ? (
                  <div className="focus-card-company">
                    <span>{lead.company || "-"}</span>
                    {lead.source ? <span>{lead.source}</span> : null}
                  </div>
                ) : null}

                <div className="focus-card-metadata">
                  {show("Owner") ? (
                    <div className="focus-card-stat">
                      <span className="label">Owner</span>
                      <span className="value">
                        {lead.assignedTo?.name || lead.assignedTo?.email || "Unassigned"}
                      </span>
                    </div>
                  ) : null}
                  {show("Score") ? (
                    <div className="focus-card-stat">
                      <span className="label">Score</span>
                      <span className="value score">
                        <ScoreBar score={leadScore} temp={temp} />
                        {scoreSummary ? <small>{scoreSummary}</small> : null}
                      </span>
                    </div>
                  ) : null}
                  {show("Touches") ? (
                    <div className="focus-card-stat">
                      <span className="label">Touches</span>
                      <span className="value">
                        <Touches count={touchesOf(lead)} />
                      </span>
                    </div>
                  ) : null}
                  {show("Next action") ? (
                    <div className="focus-card-stat">
                      <span className="label">Next</span>
                      <span className="value">
                        <NextActionChip label={nextAction.label} state={nextAction.state} />
                      </span>
                    </div>
                  ) : null}
                  {show("Last touch") ? (
                    <div className="focus-card-stat">
                      <span className="label">Last touch</span>
                      <span className="value">{relativeTime(lastTouchOf(lead))}</span>
                    </div>
                  ) : null}
                </div>

                <div className="focus-card-actions" onClick={(event) => event.stopPropagation()}>
                  {lead.phone ? (
                    <a className="crm-btn primary sm" href={`tel:${lead.phone}`}>
                      <Phone size={13} /> Call
                    </a>
                  ) : null}
                  {lead.email ? (
                    <a className="crm-btn sm" href={`mailto:${lead.email}`}>
                      <Mail size={13} /> Email
                    </a>
                  ) : null}
                  <button className="crm-btn ghost sm" onClick={() => onOpenLead(lead)}>
                    <ArrowUpRight size={13} /> Open
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="focus-pagination">
        <button
          className="crm-btn ghost sm"
          onClick={onFetchPreviousPage}
          disabled={!canGoPrevious || isFetchingNextPage}
        >
          Previous
        </button>
        <span>{isFetchingNextPage ? "Loading leads..." : "Showing up to 100 leads per page"}</span>
        <button
          className="crm-btn ghost sm"
          onClick={onFetchNextPage}
          disabled={!hasNextPage || isFetchingNextPage}
        >
          Next
        </button>
      </div>
    </section>
  );
}
