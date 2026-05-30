"use client";

import { trpc } from "@/app/_trpc/client";
import { useDebounce } from "@/hooks/use-debounce";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ImportLeadsDialog } from "./ImportLeadsDialog";
import { AddLeadForm } from "./lead-list/AddLeadForm";
import { LeadBulkActionBar } from "./lead-list/LeadBulkActionBar";
import { LeadCardList } from "./lead-list/LeadCardList";
import { LeadModal } from "./lead-list/LeadModal";
import { LeadsFocusHero } from "./lead-list/LeadsFocusHero";
import { LeadsManagementBar } from "./lead-list/LeadsManagementBar";
import { LeadsTable } from "./lead-list/LeadsTable";
import {
  buildFocusSpotlightLeads,
  filterLeadByQuickFilter,
  getDueLeadIds,
  getQuickFilterCounts,
  type FocusQuickFilter,
} from "./lead-list/focus-view-model";
import {
  chunk,
  LEAD_VISIBLE_COLUMNS,
  scoreOf,
  SessionUser,
  STAGE_ORDER,
  type AssignableUser,
  type Lead,
  type LeadSort,
  type LeadVisibleColumn,
  type ScoringRuleConfig,
} from "./lead-list/shared";

type LeadsViewMode = "focus" | "classic";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function leadsHref(
  searchParamsString: string,
  updates: Partial<Record<"new" | "view" | "leadId", string | null>>,
) {
  const nextSearchParams = new URLSearchParams(searchParamsString);

  for (const [key, value] of Object.entries(updates)) {
    if (value == null) {
      nextSearchParams.delete(key);
    } else {
      nextSearchParams.set(key, value);
    }
  }

  const query = nextSearchParams.toString();
  return query ? `/leads?${query}` : "/leads";
}

function isEditableShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
  );
}

export function LeadsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const showAddFromQuery = searchParams.get("new") === "1";
  const viewMode: LeadsViewMode = searchParams.get("view") === "classic" ? "classic" : "focus";
  const leadIdFromQuery = searchParams.get("leadId");

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leadIdFromQuery);
  const [lastSyncedQueryLeadId, setLastSyncedQueryLeadId] = useState<string | null>(leadIdFromQuery);
  if (leadIdFromQuery !== lastSyncedQueryLeadId) {
    setLastSyncedQueryLeadId(leadIdFromQuery);
    setSelectedLeadId(leadIdFromQuery);
  }
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState(new Set<string>());
  const [ownerFilter, setOwnerFilter] = useState(new Set<string>());
  const [tagFilter, setTagFilter] = useState(new Set<string>());
  const [scoreMin, setScoreMin] = useState<number | null>(null);
  const [scoreMax, setScoreMax] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<LeadSort>({ key: "createdAt", dir: "desc" });
  const [selected, setSelected] = useState(new Set<string>());
  const [showAdd, setShowAdd] = useState(showAddFromQuery);
  const [showAssign, setShowAssign] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<FocusQuickFilter>("ALL");
  const [visibleColumns, setVisibleColumns] = useState<Set<LeadVisibleColumn>>(
    new Set(LEAD_VISIBLE_COLUMNS),
  );
  const [pageCursor, setPageCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const debouncedSearch = useDebounce(search, 300);

  const replaceLeadsRoute = useCallback(
    (updates: Partial<Record<"new" | "view" | "leadId", string | null>>) => {
      router.replace(leadsHref(searchParamsString, updates));
    },
    [router, searchParamsString],
  );

  useEffect(() => {
    if (showAddFromQuery) {
      replaceLeadsRoute({ new: null });
    }
  }, [replaceLeadsRoute, showAddFromQuery]);

  const closeSelectedLead = useCallback(() => {
    setSelectedLeadId(null);
    if (leadIdFromQuery) {
      replaceLeadsRoute({ leadId: null });
    }
  }, [leadIdFromQuery, replaceLeadsRoute]);

  const { data: session } = useSession();
  const sessionUser = session?.user as SessionUser | undefined;
  const currentUserId = sessionUser?.id ?? null;
  const userRole = sessionUser?.role;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const utils = trpc.useUtils();

  // Built-in stage chips and custom-outcome chips are both filtered server-side so each
  // paginated page is fully filtered (otherwise leads only surface after clicking Next Page).
  const serverStageFilter = Array.from(stageFilter).filter((s) =>
    STAGE_ORDER.includes(s as (typeof STAGE_ORDER)[number]),
  ) as ("NOT_CONTACTED" | "CONNECTED" | "AI_VOICEMAIL" | "NO_ANSWER" | "HUNG_UP")[];
  const customOutcomeFilter = Array.from(stageFilter)
    .filter((s) => s.startsWith("CUSTOM:"))
    .map((s) => s.slice("CUSTOM:".length));

  const {
    data: leadsPage,
    isLoading,
    isFetching,
  } = trpc.leads.getAll.useQuery({
    search: debouncedSearch,
    limit: 100,
    cursor: pageCursor,
    ...(serverStageFilter.length > 0 ? { stages: serverStageFilter } : {}),
    ...(customOutcomeFilter.length > 0 ? { customOutcomeIds: customOutcomeFilter } : {}),
    ...(quickFilter === "MINE" ? { scope: "mine" as const } : {}),
    ...(ownerFilter.size > 0 ? { assignedToIds: Array.from(ownerFilter) } : {}),
  });

  const { data: serverStageCounts } = trpc.leads.getStatusCounts.useQuery({
    search: debouncedSearch,
    ...(quickFilter === "MINE" ? { scope: "mine" as const } : {}),
    ...(ownerFilter.size > 0 ? { assignedToIds: Array.from(ownerFilter) } : {}),
  }, { staleTime: 30_000 });
  const dueTodayQuery = trpc.tasks.getDueToday.useQuery();
  const overdueQuery = trpc.tasks.getOverdue.useQuery();
  const upcomingFollowUpsQuery = trpc.tasks.getUpcomingFollowUps.useQuery();
  const { data: customOutcomes } = trpc.leads.customOutcomes.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });
  const { data: rawScoringRules } = trpc.scoring.getRules.useQuery(undefined, { staleTime: 300_000 });
  const scoringRules = rawScoringRules as ScoringRuleConfig[] | undefined;
  const { data: orgTags } = trpc.leads.listOrgTags.useQuery(undefined, { staleTime: 120_000 });

  const assignableUsers: AssignableUser[] = (isAdminOrManager
    ? (orgMembers ?? [])
    : (myTeam?.users ?? [])) as AssignableUser[];
  const canAssign = isAdminOrManager || (myTeam?.users ?? []).length > 0;

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => {
      toast.success("Lead created");
      setShowAdd(false);
      void utils.leads.getAll.invalidate();
      void utils.leads.getStatusCounts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Lead deleted");
      setSelected((current) => {
        const next = new Set(current);
        next.delete(variables.id);
        return next;
      });
      if (selectedLeadId === variables.id) {
        closeSelectedLead();
      }
      void utils.leads.getAll.invalidate();
      void utils.leads.getStatusCounts.invalidate();
      void utils.tasks.getDueToday.invalidate();
      void utils.tasks.getOverdue.invalidate();
      void utils.tasks.getUpcomingFollowUps.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const assignMutation = trpc.leads.assign.useMutation({
    onSuccess: () => {
      toast.success("Leads reassigned");
      setSelected(new Set());
      setShowAssign(false);
      void utils.leads.getAll.invalidate();
      void utils.leads.getStatusCounts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkDelete = trpc.leads.bulkDelete.useMutation();
  const exportMutation = trpc.leads.export.useMutation();
  const bulkAddTag = trpc.leads.bulkAddTag.useMutation({
    onSuccess: (data) => {
      toast.success(`Tagged ${data.count} lead${data.count === 1 ? "" : "s"}`);
      setSelected(new Set());
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const bulkSetTemperature = trpc.leads.bulkSetTemperature.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated temperature for ${data.count} lead${data.count === 1 ? "" : "s"}`);
      setSelected(new Set());
      void utils.leads.getAll.invalidate();
      void utils.leads.getStatusCounts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const allLeads = useMemo<Lead[]>(() => (leadsPage?.items as Lead[]) ?? [], [leadsPage]);
  const dueTodayTasks = useMemo(() => dueTodayQuery.data ?? [], [dueTodayQuery.data]);
  const overdueTasks = useMemo(() => overdueQuery.data ?? [], [overdueQuery.data]);
  const upcomingFollowUpTasks = useMemo(
    () => upcomingFollowUpsQuery.data ?? [],
    [upcomingFollowUpsQuery.data],
  );
  const dueLeadIds = useMemo(
    () => getDueLeadIds(overdueTasks, dueTodayTasks),
    [dueTodayTasks, overdueTasks],
  );

  const hasNextPage = Boolean(leadsPage?.nextCursor);
  const isFetchingNextPage = isFetching && !isLoading;

  const goToNextPage = () => {
    if (!leadsPage?.nextCursor) return;
    setCursorHistory((current) => [...current, pageCursor ?? ""]);
    setPageCursor(leadsPage.nextCursor);
  };

  const goToPreviousPage = () => {
    setCursorHistory((current) => {
      if (current.length === 0) return current;
      const next = [...current];
      const previousCursor = next.pop() ?? "";
      setPageCursor(previousCursor || undefined);
      return next;
    });
  };

  const stageCounts = useMemo(() => {
    if (serverStageCounts) return serverStageCounts;
    // Fallback to page-local counts while server counts load
    const counts: Record<string, number> = {};
    for (const stage of STAGE_ORDER) counts[stage] = 0;
    for (const co of customOutcomes ?? []) counts[`CUSTOM:${co.id}`] = 0;
    for (const lead of allLeads) {
      if (lead.callOutcome === "CUSTOM" && lead.customOutcomeId) {
        counts[`CUSTOM:${lead.customOutcomeId}`] = (counts[`CUSTOM:${lead.customOutcomeId}`] ?? 0) + 1;
      } else if (!lead.callOutcome || lead.callOutcome === "NOT_CONTACTED") {
        counts["NOT_CONTACTED"] = (counts["NOT_CONTACTED"] ?? 0) + 1;
      } else {
        counts[lead.status] = (counts[lead.status] ?? 0) + 1;
      }
    }
    return counts;
  }, [serverStageCounts, allLeads, customOutcomes]);

  const scopedLeads = useMemo(() => {
    // Stage / custom-outcome chips are filtered server-side (see getAll query above).
    const rows = allLeads
      .filter((lead) => (ownerFilter.size ? ownerFilter.has(lead.assignedToId ?? "") : true))
      .filter((lead) =>
        tagFilter.size
          ? (lead.tags ?? []).some((t) => tagFilter.has(t.id))
          : true,
      )
      .filter((lead) => (scoreMin !== null ? scoreOf(lead, scoringRules) >= scoreMin : true))
      .filter((lead) => (scoreMax !== null ? scoreOf(lead, scoringRules) <= scoreMax : true))
      .filter((lead) => (sortBy.key === "starred" ? lead.starred === true : true));

    rows.sort((left, right) => {
      const getValue = (lead: Lead) => {
        if (sortBy.key === "score") return scoreOf(lead, scoringRules);
        if (sortBy.key === "owner") return lead.assignedTo?.name || lead.assignedTo?.email || "";
        if (sortBy.key === "starred") return lead.createdAt;
        return lead[sortBy.key as keyof Lead] ?? "";
      };

      const leftValue = getValue(left);
      const rightValue = getValue(right);
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue));

      if (sortBy.key === "starred") return -comparison;
      return sortBy.dir === "asc" ? comparison : -comparison;
    });

    return rows;
  }, [allLeads, ownerFilter, scoreMax, scoreMin, scoringRules, sortBy, tagFilter]);

  const focusFilteredLeads = useMemo(
    () =>
      scopedLeads.filter((lead) =>
        filterLeadByQuickFilter(lead, quickFilter, dueLeadIds, currentUserId),
      ),
    [currentUserId, dueLeadIds, quickFilter, scopedLeads],
  );
  const activeLeads = viewMode === "focus" ? focusFilteredLeads : scopedLeads;

  const quickFilterCounts = useMemo(
    () => getQuickFilterCounts(scopedLeads, dueLeadIds, currentUserId),
    [currentUserId, dueLeadIds, scopedLeads],
  );

  const focusCards = useMemo(
    () =>
      buildFocusSpotlightLeads({
        leads: scopedLeads,
        overdueTasks,
        dueTodayTasks,
        upcomingFollowUpTasks,
        scoringRules,
      }),
    [dueTodayTasks, overdueTasks, scopedLeads, upcomingFollowUpTasks, scoringRules],
  );

  const toggleStage = (stage: string) => {
    setStageFilter((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
    setPageCursor(undefined);
    setCursorHistory([]);
  };

  const toggleOwner = (id: string) => {
    setOwnerFilter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPageCursor(undefined);
    setCursorHistory([]);
  };

  const toggleTag = (id: string) => {
    setTagFilter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelection = (leadId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleAllSelections = () => {
    const allSelected =
      activeLeads.length > 0 && activeLeads.every((lead) => selected.has(lead.id));

    setSelected(allSelected ? new Set() : new Set(activeLeads.map((lead) => lead.id)));
    if (allSelected) {
      setShowAssign(false);
    }
  };

  const toggleVisibleColumn = (column: LeadVisibleColumn) => {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) {
        if (next.size === 1) return current;
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  const inListSelectedLead = selectedLeadId
    ? allLeads.find((lead) => lead.id === selectedLeadId) ?? null
    : null;
  const { data: fallbackSelectedLead } = trpc.leads.getById.useQuery(
    { id: selectedLeadId ?? "" },
    { enabled: Boolean(selectedLeadId && !inListSelectedLead) },
  );
  const selectedLead: Lead | null =
    inListSelectedLead ?? ((fallbackSelectedLead as Lead | undefined) ?? null);
  const selectedIndex = selectedLead
    ? activeLeads.findIndex((lead) => lead.id === selectedLead.id)
    : -1;

  const previousLead = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedLeadId(activeLeads[selectedIndex - 1]?.id ?? null);
    }
  }, [activeLeads, selectedIndex]);

  const nextLead = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < activeLeads.length - 1) {
      setSelectedLeadId(activeLeads[selectedIndex + 1]?.id ?? null);
    }
  }, [activeLeads, selectedIndex]);

  useEffect(() => {
    if (!selectedLead) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSelectedLead();
      } else if (event.key === "ArrowDown" || event.key === "j") {
        if (isEditableShortcutTarget(event.target)) return;
        event.preventDefault();
        nextLead();
      } else if (event.key === "ArrowUp" || event.key === "k") {
        if (isEditableShortcutTarget(event.target)) return;
        event.preventDefault();
        previousLead();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSelectedLead, nextLead, previousLead, selectedLead]);

  const handleBulkDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected lead${ids.length === 1 ? "" : "s"}?`)) return;

    setIsBulkDeleting(true);
    void (async () => {
      try {
        const batches = chunk(ids, 500);
        let total = 0;
        for (const leadIds of batches) {
          const response = await bulkDelete.mutateAsync({ leadIds });
          total += response.count ?? 0;
        }

        if (selectedLeadId && ids.includes(selectedLeadId)) {
          closeSelectedLead();
        }
        setSelected(new Set());
        setShowAssign(false);
        toast.success(`Deleted ${total} lead${total === 1 ? "" : "s"}`);
        await utils.leads.getAll.invalidate();
        await utils.leads.getStatusCounts.invalidate();
        await utils.tasks.getDueToday.invalidate();
        await utils.tasks.getOverdue.invalidate();
        await utils.tasks.getUpcomingFollowUps.invalidate();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete selected leads.");
      } finally {
        setIsBulkDeleting(false);
      }
    })();
  };

  const handleExport = () => {
    setIsExporting(true);
    exportMutation.mutate(
      { search: debouncedSearch || undefined },
      {
        onSuccess: (data) => {
          const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `leads-${new Date().toISOString().split("T")[0]}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`Exported ${data.count} leads`);
        },
        onError: (error) => toast.error(error.message),
        onSettled: () => setIsExporting(false),
      },
    );
  };

  const greeting = useMemo(() => {
    const base = greetingForHour(new Date().getHours());
    const firstName = session?.user?.name?.split(" ")[0];
    return firstName ? `${base}, ${firstName}` : base;
  }, [session?.user?.name]);

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(new Date()),
    [],
  );

  const subtitle = useMemo(() => {
    if (isLoading) {
      return "Loading your leads…";
    }
    if (dueTodayQuery.isError || overdueQuery.isError) {
      return `${focusFilteredLeads.length} leads remain available while focus signals reload.`;
    }
    if (focusCards.length === 0) {
      return `${focusFilteredLeads.length} of ${allLeads.length} leads match the current view.`;
    }
    return `${focusCards.length} priority lead${focusCards.length === 1 ? "" : "s"} surfaced from your current lead view.`;
  }, [allLeads.length, dueTodayQuery.isError, focusCards.length, focusFilteredLeads.length, isLoading, overdueQuery.isError]);

  const classicSubtitle = isLoading
    ? "Loading your leads…"
    : `${scopedLeads.length} of ${allLeads.length} leads · sorted by ${sortBy.key}`;

  return (
    <>
      {showAdd ? (
        <AddLeadForm
          onCancel={() => setShowAdd(false)}
          onSubmit={(data) => createLead.mutate({ ...data, source: "Manual" })}
        />
      ) : null}

      {selectedLead ? (
        <LeadModal
          key={selectedLead.id}
          lead={selectedLead}
          onClose={closeSelectedLead}
          onPrev={previousLead}
          onNext={nextLead}
        />
      ) : null}

      <div className="crm-content">
        <div
          className="crm-page-head-actions"
          style={{ justifyContent: "flex-end", marginBottom: 12 }}
        >
          <div
            role="group"
            aria-label="Lead layout"
            style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}
          >
            <button
              className="crm-chip"
              aria-pressed={viewMode === "focus"}
              onClick={() => replaceLeadsRoute({ view: null })}
            >
              Focus view
            </button>
            <button
              className="crm-chip"
              aria-pressed={viewMode === "classic"}
              onClick={() => replaceLeadsRoute({ view: "classic" })}
            >
              Classic view
            </button>
          </div>
        </div>

        {viewMode === "focus" ? (
          <>
            <LeadsFocusHero
              focusCards={focusCards}
              isLoading={dueTodayQuery.isLoading || overdueQuery.isLoading}
              isError={dueTodayQuery.isError || overdueQuery.isError}
              quickFilter={quickFilter}
              quickFilterCounts={quickFilterCounts}
              greeting={greeting}
              dateLabel={dateLabel}
              subtitle={subtitle}
              onOpenFilters={() => {
                setFilterOpen(true);
                setColumnsOpen(false);
              }}
              onOpenLead={(lead) => setSelectedLeadId(lead.id)}
              onQuickFilterChange={(value) => {
                setQuickFilter(value);
                setPageCursor(undefined);
                setCursorHistory([]);
              }}
              onShowNewLead={() => setShowAdd(true)}
            />

            <LeadsManagementBar
              allLeadsCount={scopedLeads.length}
              filteredCount={focusFilteredLeads.length}
              filterOpen={filterOpen}
              columnsOpen={columnsOpen}
              customOutcomes={customOutcomes}
              importAction={<ImportLeadsDialog onImported={() => { void utils.leads.getAll.invalidate(); void utils.leads.getStatusCounts.invalidate(); }} />}
              isExporting={isExporting}
              members={assignableUsers}
              orgTags={orgTags}
              ownerFilter={ownerFilter}
              scoreMin={scoreMin}
              scoreMax={scoreMax}
              search={search}
              sortBy={sortBy}
              stageCounts={stageCounts}
              stageFilter={stageFilter}
              tagFilter={tagFilter}
              visibleColumns={visibleColumns}
              onClearStageFilters={() => {
                setStageFilter(new Set());
                setPageCursor(undefined);
                setCursorHistory([]);
              }}
              onColumnsOpenChange={setColumnsOpen}
              onExport={handleExport}
              onFilterOpenChange={setFilterOpen}
              onOwnerToggle={toggleOwner}
              onScoreChange={(min, max) => {
                setScoreMin(min);
                setScoreMax(max);
              }}
              onSearchChange={(value) => {
                setSearch(value);
                setPageCursor(undefined);
                setCursorHistory([]);
              }}
              onSortDirectionToggle={() =>
                setSortBy((current) => ({
                  ...current,
                  dir: current.dir === "desc" ? "asc" : "desc",
                }))
              }
              onSortKeyChange={(key) =>
                setSortBy((current) => ({
                  ...current,
                  key,
                }))
              }
              onTagToggle={toggleTag}
              onToggleColumn={toggleVisibleColumn}
              onToggleStage={toggleStage}
            />

            <LeadCardList
              canGoPrevious={cursorHistory.length > 0}
              filteredLeads={focusFilteredLeads}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isLoading={isLoading}
              onDeleteLead={(leadId) => {
                if (confirm("Delete this lead?")) {
                  deleteLead.mutate({ id: leadId });
                }
              }}
              onFetchNextPage={goToNextPage}
              onFetchPreviousPage={goToPreviousPage}
              onOpenLead={(lead) => setSelectedLeadId(lead.id)}
              onToggleRowSelection={toggleSelection}
              onToggleSelectAllRows={toggleAllSelections}
              scoringRules={scoringRules}
              selectedIds={selected}
              visibleColumns={visibleColumns}
            />
          </>
        ) : (
          <>
            <div className="crm-page-head">
              <div>
                <h1 className="crm-page-title">Leads</h1>
                <div className="crm-page-sub">{classicSubtitle}</div>
              </div>
              <div className="crm-page-head-actions">
                <ImportLeadsDialog onImported={() => { void utils.leads.getAll.invalidate(); void utils.leads.getStatusCounts.invalidate(); }} />
                <button className="crm-btn primary" onClick={() => setShowAdd(true)}>
                  New lead
                </button>
              </div>
            </div>

            <LeadsTable
              allLeadsCount={allLeads.length}
              customOutcomes={customOutcomes}
              filteredLeads={scopedLeads}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isLoading={isLoading}
              canGoPrevious={cursorHistory.length > 0}
              members={assignableUsers}
              orgTags={orgTags}
              ownerFilter={ownerFilter}
              scoreMin={scoreMin}
              scoreMax={scoreMax}
              tagFilter={tagFilter}
              onClearStageFilters={() => {
                setStageFilter(new Set());
                setPageCursor(undefined);
                setCursorHistory([]);
              }}
              onDeleteLead={(leadId) => {
                if (confirm("Delete this lead?")) {
                  deleteLead.mutate({ id: leadId });
                }
              }}
              onFetchNextPage={goToNextPage}
              onFetchPreviousPage={goToPreviousPage}
              onOpenLead={(lead) => setSelectedLeadId(lead.id)}
              onOwnerToggle={toggleOwner}
              onScoreChange={(min, max) => {
                setScoreMin(min);
                setScoreMax(max);
              }}
              onSearchChange={(value) => {
                setSearch(value);
                setPageCursor(undefined);
                setCursorHistory([]);
              }}
              onSortChange={(key) =>
                setSortBy((current) => ({
                  key,
                  dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
                }))
              }
              onTagToggle={toggleTag}
              onToggleRowSelection={toggleSelection}
              onToggleSelectAllRows={toggleAllSelections}
              onToggleStage={toggleStage}
              scoringRules={scoringRules}
              search={search}
              selectedIds={selected}
              sortBy={sortBy}
              stageCounts={stageCounts}
              stageFilter={stageFilter}
            />
          </>
        )}

        {selected.size > 0 ? (
          <LeadBulkActionBar
            assignableUsers={assignableUsers}
            canAssign={canAssign}
            isBulkDeleting={isBulkDeleting || bulkDelete.isPending}
            onAssign={(assigneeId) =>
              assignMutation.mutate({ leadIds: Array.from(selected), assigneeId })
            }
            onBulkDelete={handleBulkDelete}
            onBulkTag={(tagId) =>
              bulkAddTag.mutate({ leadIds: Array.from(selected), tagId })
            }
            onClear={() => {
              setSelected(new Set());
              setShowAssign(false);
            }}
            onSetTemperature={(temperature) =>
              bulkSetTemperature.mutate({ leadIds: Array.from(selected), temperature })
            }
            onToggleAssignMenu={() => setShowAssign((current) => !current)}
            orgTags={orgTags ?? []}
            selectedCount={selected.size}
            showAssignMenu={showAssign}
          />
        ) : null}
      </div>
    </>
  );
}
