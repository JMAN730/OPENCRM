"use client";

import { trpc } from "@/app/_trpc/client";
import { useDebounce } from "@/hooks/use-debounce";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { ImportLeadsDialog } from "./ImportLeadsDialog";
import { AddLeadForm } from "./lead-list/AddLeadForm";
import { LeadBulkActionBar } from "./lead-list/LeadBulkActionBar";
import { LeadModal } from "./lead-list/LeadModal";
import { LeadsTable } from "./lead-list/LeadsTable";
import {
  chunk,
  scoreOf,
  SessionUser,
  STAGE_ORDER,
  type AssignableUser,
  type Lead,
  type LeadSort,
} from "./lead-list/shared";

export function LeadsList() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [stageFilter, setStageFilter] = useState(new Set<string>());
  const [sortBy, setSortBy] = useState<LeadSort>({ key: "createdAt", dir: "desc" });
  const [selected, setSelected] = useState(new Set<string>());
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const { data: session } = useSession();
  const userRole = (session?.user as SessionUser | undefined)?.role;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const utils = trpc.useUtils();
  const {
    data: leadsPages,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.leads.getAll.useInfiniteQuery(
    { search: debouncedSearch, limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
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
    onSuccess: () => {
      toast.success("Lead deleted");
      void utils.leads.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const bulkDelete = trpc.leads.bulkDelete.useMutation();

  const allLeads = useMemo<Lead[]>(
    () => (leadsPages?.pages.flatMap((page) => page.items as Lead[]) ?? []),
    [leadsPages],
  );

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of STAGE_ORDER) counts[stage] = 0;
    for (const lead of allLeads) counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    return counts;
  }, [allLeads]);

  const filtered = useMemo(() => {
    let rows = allLeads.slice();
    if (stageFilter.size) rows = rows.filter((lead) => stageFilter.has(lead.status));
    rows.sort((left, right) => {
      const leftValue =
        sortBy.key === "score" ? scoreOf(left) : (left[sortBy.key as keyof Lead] ?? "");
      const rightValue =
        sortBy.key === "score" ? scoreOf(right) : (right[sortBy.key as keyof Lead] ?? "");
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue));
      return sortBy.dir === "asc" ? comparison : -comparison;
    });
    return rows;
  }, [allLeads, sortBy, stageFilter]);

  const toggleStage = (stage: string) => {
    const next = new Set(stageFilter);
    if (next.has(stage)) {
      next.delete(stage);
    } else {
      next.add(stage);
    }
    setStageFilter(next);
  };

  const toggleSelection = (leadId: string) => {
    const next = new Set(selected);
    if (next.has(leadId)) {
      next.delete(leadId);
    } else {
      next.add(leadId);
    }
    setSelected(next);
  };

  const allSelected = filtered.length > 0 && filtered.every((lead) => selected.has(lead.id));
  const toggleAllSelections = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((lead) => lead.id)));
  };

  const selectedLead = selectedLeadId
    ? allLeads.find((lead) => lead.id === selectedLeadId) ?? null
    : null;

  const selectedIndex = selectedLead
    ? filtered.findIndex((lead) => lead.id === selectedLead.id)
    : -1;
  const previousLead = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedLeadId(filtered[selectedIndex - 1]?.id ?? null);
    }
  }, [filtered, selectedIndex]);

  const nextLead = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filtered.length - 1) {
      setSelectedLeadId(filtered[selectedIndex + 1]?.id ?? null);
    }
  }, [filtered, selectedIndex]);

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
        toast.success(`Deleted ${total} lead${total === 1 ? "" : "s"}`);
        setSelected(new Set());
        void utils.leads.getAll.invalidate();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete selected leads.");
      } finally {
        setIsBulkDeleting(false);
      }
    })();
  };

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
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Leads</h1>
            <div className="crm-page-sub">
              {filtered.length} of {allLeads.length} leads · sorted by {sortBy.key}
            </div>
          </div>
          <div className="crm-page-head-actions">
            <ImportLeadsDialog onImported={() => void utils.leads.getAll.invalidate()} />
            <button className="crm-btn primary" onClick={() => setShowAdd(true)}>
              <Plus size={13} /> New lead
            </button>
          </div>
        </div>

        <LeadsTable
          allLeadsCount={allLeads.length}
          filteredLeads={filtered}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isLoading}
          loadMoreRef={loadMoreRef}
          onClearStageFilters={() => setStageFilter(new Set())}
          onDeleteLead={(leadId) => {
            if (confirm("Delete this lead?")) {
              deleteLead.mutate({ id: leadId });
            }
          }}
          onFetchNextPage={() => void fetchNextPage()}
          onOpenLead={(lead) => setSelectedLeadId(lead.id)}
          onSearchChange={setSearch}
          onSortChange={(key) =>
            setSortBy((current) => ({
              key,
              dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
            }))
          }
          onToggleRowSelection={toggleSelection}
          onToggleSelectAllRows={toggleAllSelections}
          onToggleStage={toggleStage}
          search={search}
          selectedIds={selected}
          sortBy={sortBy}
          stageCounts={stageCounts}
          stageFilter={stageFilter}
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
            onClear={() => setSelected(new Set())}
            onToggleAssignMenu={() => setShowAssign((value) => !value)}
            selectedCount={selected.size}
            showAssignMenu={showAssign}
          />
        ) : null}
      </div>
    </>
  );
}
