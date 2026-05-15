"use client";

import { AlertCircle, ArrowUpRight, Mail, Phone, Plus, SlidersHorizontal } from "lucide-react";
import { ScoreBar, StageTag, TempPill, Touches } from "./LeadUi";
import type { FocusLeadCard, FocusQuickFilter } from "./focus-view-model";
import type { Lead } from "./shared";
import { avatarClass, effectiveTempOf, fullNameOf, initials } from "./shared";

type LeadsFocusHeroProps = {
  focusCards: FocusLeadCard[];
  isLoading: boolean;
  isError: boolean;
  quickFilter: FocusQuickFilter;
  quickFilterCounts: {
    all: number;
    hot: number;
    dueToday: number;
    mine: number;
  };
  greeting: string;
  dateLabel: string;
  subtitle: string;
  onOpenFilters: () => void;
  onOpenLead: (lead: Lead) => void;
  onQuickFilterChange: (filter: FocusQuickFilter) => void;
  onShowNewLead: () => void;
};

function QuickFilterChip({
  count,
  active,
  label,
  onClick,
}: {
  count: number;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="crm-chip" aria-pressed={active} onClick={onClick}>
      {label}
      <span className="crm-chip-count">{count}</span>
    </button>
  );
}

export function LeadsFocusHero({
  focusCards,
  isLoading,
  isError,
  quickFilter,
  quickFilterCounts,
  greeting,
  dateLabel,
  subtitle,
  onOpenFilters,
  onOpenLead,
  onQuickFilterChange,
  onShowNewLead,
}: LeadsFocusHeroProps) {
  return (
    <section className="focus-shell">
      <div className="crm-page-head focus-page-head">
        <div>
          <div className="focus-title-wrap">
            <h1 className="crm-page-title">Leads - Focus</h1>
          </div>
          <div className="crm-page-sub">{subtitle}</div>
        </div>
        <div className="crm-page-head-actions">
          <button className="crm-btn ghost" onClick={onOpenFilters}>
            <SlidersHorizontal size={13} /> Filter
          </button>
          <button className="crm-btn primary" onClick={onShowNewLead}>
            <Plus size={13} /> New lead
          </button>
        </div>
      </div>

      <div className="focus-wrap">
        <section className="focus-spotlight">
          <div className="focus-spot-head">
            <div>
              <div className="focus-eyebrow">Your focus - {dateLabel}</div>
              <h2 className="focus-h2">{greeting}</h2>
            </div>
          </div>

          {isLoading ? (
            <div className="focus-fallback">Loading focus signals...</div>
          ) : isError ? (
            <div className="focus-fallback error">
              <AlertCircle size={14} />
              Focus signals are unavailable right now. Lead management is still available below.
            </div>
          ) : focusCards.length === 0 ? (
            <div className="focus-fallback">
              No overdue, due-today, or hot leads match the current lead view.
            </div>
          ) : (
            <div className="focus-spot-grid">
              {focusCards.map((card) => {
                const name = fullNameOf(card.lead);
                const temp = effectiveTempOf(card.lead);

                return (
                  <article
                    key={card.lead.id}
                    className={`focus-spot-card t-${card.urgency}`}
                    onClick={() => onOpenLead(card.lead)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenLead(card.lead);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="rank">{String(card.rank).padStart(2, "0")}</div>
                    <div className="head">
                      <div className={`crm-avatar lg ${avatarClass(name)}`}>{initials(name)}</div>
                      <div className="meta">
                        <span className="n">{name}</span>
                        <span className="c">
                          {[card.lead.company, card.lead.source].filter(Boolean).join(" - ") || "Lead"}
                        </span>
                      </div>
                      <TempPill temp={temp} />
                    </div>
                    <p className="why">{card.reason}</p>
                    <div className="signals">
                      <div className="signal-block">
                        <span className="signal-label">Stage</span>
                        <StageTag status={card.lead.status} />
                      </div>
                      <div className="signal-block">
                        <span className="signal-label">Score</span>
                        <ScoreBar score={card.score} temp={temp} />
                      </div>
                      <div className="signal-block">
                        <span className="signal-label">Touches</span>
                        <Touches count={card.touches} />
                      </div>
                    </div>
                    <div className="actions" onClick={(event) => event.stopPropagation()}>
                      {card.lead.phone ? (
                        <a className="crm-btn primary sm" href={`tel:${card.lead.phone}`}>
                          <Phone size={13} /> Call
                        </a>
                      ) : null}
                      {card.lead.email ? (
                        <a className="crm-btn sm" href={`mailto:${card.lead.email}`}>
                          <Mail size={13} /> Email
                        </a>
                      ) : null}
                      <button className="crm-btn ghost sm" onClick={() => onOpenLead(card.lead)}>
                        <ArrowUpRight size={13} /> Open
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="focus-divider" />

        <div className="focus-filters">
          <QuickFilterChip
            active={quickFilter === "ALL"}
            count={quickFilterCounts.all}
            label="All"
            onClick={() => onQuickFilterChange("ALL")}
          />
          <QuickFilterChip
            active={quickFilter === "HOT"}
            count={quickFilterCounts.hot}
            label="Hot"
            onClick={() => onQuickFilterChange("HOT")}
          />
          <QuickFilterChip
            active={quickFilter === "DUE_TODAY"}
            count={quickFilterCounts.dueToday}
            label="Due today"
            onClick={() => onQuickFilterChange("DUE_TODAY")}
          />
          <QuickFilterChip
            active={quickFilter === "MINE"}
            count={quickFilterCounts.mine}
            label="Mine"
            onClick={() => onQuickFilterChange("MINE")}
          />
        </div>
      </div>
    </section>
  );
}
