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
} from "./lead-list/shared";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function LeadsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showAddFromQuery = searchParams.get("new") === "1";

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState(new Set<string>());
  const [ownerFilter, setOwnerFilter] = useState(new Set<string>());
  const [scoreMin, setScoreMin] = useState<number | null>(null);
  const [scoreMax, setScoreMax] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<LeadSort>({ key: "createdAt", dir: "desc" });
  const [selected, setSelected] = useState(new Set<string>());
  const [showAdd, setShowAdd] = useState(showAddFromQuery);
  const [showAssign, setShowAssign] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<FocusQuickFilter>("ALL");
  const [visibleColumns, setVisibleColumns] = useState<Set<LeadVisibleColumn>>(
    new Set(LEAD_VISIBLE_COLUMNS),
  );
  const [pageCursor, setPageCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (showAddFromQuery) {
      router.replace("/leads");
    }
  }, [router, showAddFromQuery]);

  const { data: session } = useSession();
  const sessionUser = session?.user as SessionUser | undefined;
  const currentUserId = sessionUser?.id ?? null;
  const userRole = sessionUser?.role;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const utils = trpc.useUtils();

  const {
    data: leadsPage,
    isLoading,
    isFetching,
  } = trpc.leads.getAll.useQuery({ search: debouncedSearch, limit: 100, cursor: pageCursor });
  const dueTodayQuery = trpc.tasks.getDueToday.useQuery();
  const overdueQuery = trpc.tasks.getOverdue.useQuery();
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });

  const assignableUsers: AssignableUser[] = (isAdminOrManager
    ? (orgMembers ?? [])
    : (myTeam?.users ?? [])) as AssignableUser[];
  const canAssign = isAdminOrManager || (myTeam?.users ?? []).length > 0;

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => {
      toast.success("Lead created");
      setShowAdd(false);
      void utils.leads.getAll.invalidate();
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
        setSelectedLeadId(null);
      }
      void utils.leads.getAll.invalidate();
      void utils.tasks.getDueToday.invalidate();
      void utils.tasks.getOverdue.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const assignMutation = trpc.leads.assign.useMutation({
    onSuccess: () => {
      toast.success("Leads reassigned");
      setSelected(new Set());
      setShowAssign(false);
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkDelete = trpc.leads.bulkDelete.useMutation();

  const allLeads = useMemo<Lead[]>(() => (leadsPage?.items as Lead[]) ?? [], [leadsPage]);
  const dueTodayTasks = useMemo(() => dueTodayQuery.data ?? [], [dueTodayQuery.data]);
  const overdueTasks = useMemo(() => overdueQuery.data ?? [], [overdueQuery.data]);
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
    const counts: Record<string, number> = {};
    for (const stage of STAGE_ORDER) counts[stage] = 0;
    for (const lead of allLeads) counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    return counts;
  }, [allLeads]);

  const scopedLeads = useMemo(() => {
    const rows = allLeads
      .filter((lead) => (stageFilter.size ? stageFilter.has(lead.status) : true))
      .filter((lead) => (ownerFilter.size ? ownerFilter.has(lead.assignedToId ?? "") : true))
      .filter((lead) => (scoreMin !== null ? scoreOf(lead) >= scoreMin : true))
      .filter((lead) => (scoreMax !== null ? scoreOf(lead) <= scoreMax : true));

    rows.sort((left, right) => {
      const getValue = (lead: Lead) => {
        if (sortBy.key === "score") return scoreOf(lead);
        if (sortBy.key === "owner") return lead.assignedTo?.name || lead.assignedTo?.email || "";
        return lead[sortBy.key as keyof Lead] ?? "";
      };

      const leftValue = getValue(left);
      const rightValue = getValue(right);
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue));

      return sortBy.dir === "asc" ? comparison : -comparison;
    });

    return rows;
  }, [allLeads, ownerFilter, scoreMax, scoreMin, sortBy, stageFilter]);

  const filteredLeads = useMemo(
    () =>
      scopedLeads.filter((lead) =>
        filterLeadByQuickFilter(lead, quickFilter, dueLeadIds, currentUserId),
      ),
    [currentUserId, dueLeadIds, quickFilter, scopedLeads],
  );

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
      }),
    [dueTodayTasks, overdueTasks, scopedLeads],
  );

  const toggleStage = (stage: string) => {
    setStageFilter((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const toggleOwner = (id: string) => {
    setOwnerFilter((current) => {
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
      filteredLeads.length > 0 && filteredLeads.every((lead) => selected.has(lead.id));

    setSelected(allSelected ? new Set() : new Set(filteredLeads.map((lead) => lead.id)));
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

  const selectedLead = selectedLeadId
    ? allLeads.find((lead) => lead.id === selectedLeadId) ?? null
    : null;
  const selectedIndex = selectedLead
    ? filteredLeads.findIndex((lead) => lead.id === selectedLead.id)
    : -1;

  const previousLead = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedLeadId(filteredLeads[selectedIndex - 1]?.id ?? null);
    }
  }, [filteredLeads, selectedIndex]);

  const nextLead = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filteredLeads.length - 1) {
      setSelectedLeadId(filteredLeads[selectedIndex + 1]?.id ?? null);
    }
  }, [filteredLeads, selectedIndex]);

  useEffect(() => {
    if (!selectedLead) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedLeadId(null);
      } else if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        nextLead();
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        previousLead();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextLead, previousLead, selectedLead]);

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
          setSelectedLeadId(null);
        }
        setSelected(new Set());
        setShowAssign(false);
        toast.success(`Deleted ${total} lead${total === 1 ? "" : "s"}`);
        await utils.leads.getAll.invalidate();
        await utils.tasks.getDueToday.invalidate();
        await utils.tasks.getOverdue.invalidate();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete selected leads.");
      } finally {
        setIsBulkDeleting(false);
      }
    })();
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
    if (dueTodayQuery.isError || overdueQuery.isError) {
      return `${filteredLeads.length} leads remain available while focus signals reload.`;
    }
    if (focusCards.length === 0) {
      return `${filteredLeads.length} of ${allLeads.length} leads match the current view.`;
    }
    return `${focusCards.length} priority lead${focusCards.length === 1 ? "" : "s"} surfaced from your current lead view.`;
  }, [allLeads.length, dueTodayQuery.isError, filteredLeads.length, focusCards.length, overdueQuery.isError]);

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
          onClose={() => setSelectedLeadId(null)}
          onPrev={previousLead}
          onNext={nextLead}
        />
      ) : null}

      <div className="crm-content">
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
          onQuickFilterChange={setQuickFilter}
          onShowNewLead={() => setShowAdd(true)}
        />

        <LeadsManagementBar
          allLeadsCount={scopedLeads.length}
          filteredCount={filteredLeads.length}
          filterOpen={filterOpen}
          columnsOpen={columnsOpen}
          importAction={<ImportLeadsDialog onImported={() => void utils.leads.getAll.invalidate()} />}
          members={assignableUsers}
          ownerFilter={ownerFilter}
          scoreMin={scoreMin}
          scoreMax={scoreMax}
          search={search}
          sortBy={sortBy}
          stageCounts={stageCounts}
          stageFilter={stageFilter}
          visibleColumns={visibleColumns}
          onClearStageFilters={() => setStageFilter(new Set())}
          onColumnsOpenChange={setColumnsOpen}
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
          onToggleColumn={toggleVisibleColumn}
          onToggleStage={toggleStage}
        />

        <LeadCardList
          canGoPrevious={cursorHistory.length > 0}
          filteredLeads={filteredLeads}
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
          selectedIds={selected}
          visibleColumns={visibleColumns}
        />

        {selected.size > 0 ? (
          <LeadBulkActionBar
            assignableUsers={assignableUsers}
            canAssign={canAssign}
            isBulkDeleting={isBulkDeleting || bulkDelete.isPending}
            onAssign={(assigneeId) =>
              assignMutation.mutate({ leadIds: Array.from(selected), assigneeId })
            }
            onBulkDelete={handleBulkDelete}
            onClear={() => {
              setSelected(new Set());
              setShowAssign(false);
            }}
            onToggleAssignMenu={() => setShowAssign((current) => !current)}
            selectedCount={selected.size}
            showAssignMenu={showAssign}
          />
        ) : null}
      </div>
    </>
  );
}
