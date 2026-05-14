"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  avatarClass,
  initials,
  type OrganizationMember,
} from "./shared";

type AddMemberModalProps = {
  callerId: string | undefined;
  membersLoading: boolean;
  onClose: () => void;
  open: boolean;
  orgMembers: OrganizationMember[];
  teamId: string;
  teamName: string;
};

export function AddMemberModal({
  callerId,
  membersLoading,
  onClose,
  open,
  orgMembers,
  teamId,
  teamName,
}: AddMemberModalProps) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const setMembership = trpc.teams.setMembership.useMutation({
    onSuccess: () => {
      void utils.teams.list.invalidate();
      void utils.teams.organizationMembers.invalidate();
      void utils.teams.myTeam.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const availableMembers = useMemo(() => {
    const query = search.toLowerCase();
    return orgMembers.filter((member) => {
      if (member.id === callerId) return false;
      if (member.teamId === teamId) return false;
      if (!query) return true;

      return (
        (member.name ?? "").toLowerCase().includes(query) ||
        (member.email ?? "").toLowerCase().includes(query)
      );
    });
  }, [callerId, orgMembers, search, teamId]);

  const addableUsersCount = orgMembers.filter(
    (member) => member.id !== callerId && member.teamId !== teamId,
  ).length;

  const toggle = (userId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleAdd = async () => {
    const ids = Array.from(selected);
    await Promise.all(ids.map((userId) => setMembership.mutateAsync({ userId, teamId })));
    toast.success(ids.length === 1 ? "Member added" : `${ids.length} members added`);
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch("");
      setSelected(new Set());
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        style={{ maxWidth: "min(calc(100vw - 2rem), 480px)" }}
      >
        <DialogHeader>
          <DialogTitle>Add members to {teamName}</DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email..."
          value={search}
        />

        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--crm-border)",
            borderRadius: "var(--crm-radius-sm)",
          }}
        >
          {membersLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--crm-border)",
                }}
              >
                <Skeleton className="size-8 rounded-full" />
                <div style={{ flex: 1 }}>
                  <Skeleton className="mb-1 h-3 w-28" />
                  <Skeleton className="h-2.5 w-40" />
                </div>
              </div>
            ))
          ) : availableMembers.length === 0 ? (
            <div
              style={{
                padding: "28px 16px",
                textAlign: "center",
                color: "var(--crm-fg-faint)",
                fontSize: 13,
              }}
            >
              {search
                ? "No users match your search."
                : addableUsersCount === 0
                  ? 'No users available to add. Use "Create user account" to add accounts first.'
                  : "No users match your search."}
            </div>
          ) : (
            availableMembers.map((member) => (
              <label
                key={member.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--crm-border)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <Checkbox
                  checked={selected.has(member.id)}
                  onCheckedChange={() => toggle(member.id)}
                />
                <div className={`crm-avatar sm ${avatarClass(member.name)}`}>
                  {initials(member.name || member.email)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {member.name || member.email}
                  </div>
                  {member.name ? (
                    <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>
                      {member.email}
                    </div>
                  ) : null}
                  {member.team ? (
                    <div style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>
                      Currently in: {member.team.name}
                    </div>
                  ) : null}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    color: "var(--crm-fg-faint)",
                  }}
                >
                  {member.role}
                </span>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={setMembership.isPending}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={selected.size === 0 || setMembership.isPending}
            onClick={handleAdd}
          >
            {setMembership.isPending
              ? "Adding..."
              : selected.size === 0
                ? "Add selected"
                : `Add ${selected.size} selected`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
