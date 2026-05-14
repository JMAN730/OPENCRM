"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/app/_trpc/client";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Crown, UserPlus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppRouter } from "@/server/api/root";

type TeamsListItem = inferRouterOutputs<AppRouter>["teams"]["list"][number];
type OrganizationMember = inferRouterOutputs<AppRouter>["teams"]["organizationMembers"][number];
type TeamActivity = inferRouterOutputs<AppRouter>["teams"]["activityFeed"][number];
type InviteRole = "USER" | "MANAGER" | "ADMIN";

function initials(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function avatarClass(seed: string | null | undefined) {
  const n = (((seed ?? "")?.charCodeAt(0) || 0) % 6) + 1;
  return `c${n}`;
}

function relativeTime(iso: string | Date) {
  const d = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}

const ACTIVITY_VERB: Record<string, string> = {
  LEAD_CREATED: "created lead",
  LEAD_ASSIGNED: "assigned lead",
  LEAD_DELETED: "deleted lead",
  CALL_OUTCOME: "updated call outcome on",
  CALL_LOGGED: "logged call on",
  TASK_CREATED: "added task on",
  TASK_COMPLETED: "completed task on",
  NOTE_ADDED: "added note on",
};

interface AddMemberModalProps {
  teamId: string;
  teamName: string;
  orgMembers: OrganizationMember[];
  membersLoading: boolean;
  callerId: string | undefined;
  open: boolean;
  onClose: () => void;
}

function AddMemberModal({
  teamId,
  teamName,
  orgMembers,
  membersLoading,
  callerId,
  open,
  onClose,
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

  const available = useMemo(() => {
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

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAdd() {
    const ids = Array.from(selected);
    await Promise.all(ids.map((userId) => setMembership.mutateAsync({ userId, teamId })));
    toast.success(ids.length === 1 ? "Member added" : `${ids.length} members added`);
    setSelected(new Set());
    setSearch("");
    onClose();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSearch("");
      setSelected(new Set());
      onClose();
    }
  }

  const addableUsersCount = orgMembers.filter((member) => member.id !== callerId && member.teamId !== teamId).length;

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
          placeholder="Search by name or email…"
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
          ) : available.length === 0 ? (
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
                  ? "No users available to add. Use \"Create user account\" to add accounts first."
                  : "No users match your search."}
            </div>
          ) : (
            available.map((member) => (
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
              ? "Adding…"
              : selected.size === 0
                ? "Add selected"
                : `Add ${selected.size} selected`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";
  const callerId = session?.user?.id;

  const { data: myTeam, isLoading: teamLoading } = trpc.teams.myTeam.useQuery();
  const { data: feed = [] } = trpc.teams.activityFeed.useQuery(
    { limit: 50 },
    { enabled: !!myTeam },
  );
  const { data: allTeams = [] } = trpc.teams.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { data: orgMembers = [], isLoading: membersLoading } =
    trpc.teams.organizationMembers.useQuery(undefined, { enabled: isAdmin });

  const isLeader = !!myTeam && myTeam.leaderId === callerId;

  return (
    <div className="crm-content">
      <div className="crm-page-head">
        <div>
          <h1 className="crm-page-title">Team</h1>
          <div className="crm-page-sub">
            {myTeam
              ? `${myTeam.name} · ${myTeam.users.length} member${myTeam.users.length === 1 ? "" : "s"}`
              : isAdmin
                ? "Manage teams for your organization"
                : "You are not on a team yet"}
          </div>
        </div>
      </div>

      {!myTeam && !isAdmin ? (
        <div className="crm-card" style={{ padding: 32, textAlign: "center", color: "var(--crm-fg-faint)" }}>
          You are not on a team yet. Ask your admin to add you to one.
        </div>
      ) : null}

      {myTeam ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Members</h3>
              <span className="crm-sub">· {myTeam.users.length}</span>
            </div>
            <div>
              {myTeam.users.map((user) => {
                const canViewDetail = isAdmin || isLeader || user.id === callerId;
                const isLeaderOfTeam = myTeam.leaderId === user.id;
                const row = (
                  <div
                    key={user.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderTop: "1px solid var(--crm-border)",
                      cursor: canViewDetail ? "pointer" : "default",
                    }}
                  >
                    <div className={`crm-avatar sm ${avatarClass(user.name)}`}>
                      {initials(user.name || user.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="crm-n">{user.name || user.email}</span>
                        {isLeaderOfTeam ? (
                          <span title="Team leader" style={{ color: "var(--crm-warn, #d4a017)", display: "inline-flex" }}>
                            <Crown size={12} />
                          </span>
                        ) : null}
                      </div>
                      {user.email ? (
                        <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>{user.email}</div>
                      ) : null}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--crm-fg-faint)", textTransform: "uppercase" }}>{user.role}</span>
                  </div>
                );

                return canViewDetail ? (
                  <Link
                    key={user.id}
                    href={`/team/${user.id}`}
                    style={{ textDecoration: "none", color: "inherit", display: "block" }}
                  >
                    {row}
                  </Link>
                ) : (
                  row
                );
              })}
            </div>
          </div>

          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Team activity</h3>
              <span className="crm-sub">· last {feed.length}</span>
            </div>
            <div>
              {feed.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--crm-fg-faint)" }}>
                  No recent activity from your team.
                </div>
              ) : (
                feed.map((activity: TeamActivity) => {
                  const verb = ACTIVITY_VERB[activity.type] ?? activity.type.toLowerCase();
                  const leadLabel =
                    [activity.lead?.firstName, activity.lead?.lastName].filter(Boolean).join(" ") ||
                    activity.lead?.company ||
                    "(lead)";

                  return (
                    <div
                      key={activity.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "10px 14px",
                        borderTop: "1px solid var(--crm-border)",
                        alignItems: "flex-start",
                      }}
                    >
                      <div className={`crm-avatar xs ${avatarClass(activity.user?.name)}`}>
                        {initials(activity.user?.name || activity.user?.email)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13 }}>
                          <strong>{activity.user?.name || activity.user?.email || "Someone"}</strong>{" "}
                          <span style={{ color: "var(--crm-fg-faint)" }}>{verb}</span>{" "}
                          <Link href="/leads" style={{ color: "var(--crm-fg)" }}>
                            {leadLabel}
                          </Link>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)", marginTop: 1 }}>
                          {activity.description} · {relativeTime(activity.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <AdminTeamsPanel
          callerId={callerId}
          members={orgMembers}
          membersLoading={membersLoading}
          teams={allTeams}
        />
      ) : null}

      {teamLoading && !myTeam && !isAdmin ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--crm-fg-faint)" }}>Loading…</div>
      ) : null}
    </div>
  );
}

function AdminTeamsPanel({
  teams,
  members,
  membersLoading,
  callerId,
}: {
  teams: TeamsListItem[];
  members: OrganizationMember[];
  membersLoading: boolean;
  callerId: string | undefined;
}) {
  const utils = trpc.useUtils();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [leaderId, setLeaderId] = useState<string>("");

  const [creatingUser, setCreatingUser] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("USER");

  const [addMemberFor, setAddMemberFor] = useState<{ id: string; name: string } | null>(null);

  const createTeam = trpc.teams.create.useMutation({
    onSuccess: () => {
      toast.success("Team created");
      setCreating(false);
      setName("");
      setLeaderId("");
      void utils.teams.list.invalidate();
      void utils.teams.myTeam.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateTeam = trpc.teams.update.useMutation({
    onSuccess: () => {
      toast.success("Team updated");
      void utils.teams.list.invalidate();
      void utils.teams.myTeam.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteTeam = trpc.teams.delete.useMutation({
    onSuccess: () => {
      toast.success("Team deleted");
      void utils.teams.list.invalidate();
      void utils.teams.myTeam.invalidate();
      void utils.teams.organizationMembers.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const setMembership = trpc.teams.setMembership.useMutation({
    onSuccess: () => {
      toast.success("Membership updated");
      void utils.teams.list.invalidate();
      void utils.teams.organizationMembers.invalidate();
      void utils.teams.myTeam.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const inviteUser = trpc.teams.inviteUser.useMutation({
    onSuccess: () => {
      toast.success("User added to organization");
      setCreatingUser(false);
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("USER");
      void utils.teams.organizationMembers.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const parseInviteRole = (value: string): InviteRole => {
    if (value === "MANAGER" || value === "ADMIN") return value;
    return "USER";
  };

  return (
    <>
      {addMemberFor ? (
        <AddMemberModal
          callerId={callerId}
          membersLoading={membersLoading}
          onClose={() => setAddMemberFor(null)}
          open={!!addMemberFor}
          orgMembers={members}
          teamId={addMemberFor.id}
          teamName={addMemberFor.name}
        />
      ) : null}

      <div className="crm-card flush" style={{ marginTop: 16 }}>
        <div className="crm-card-head">
          <h3>Teams (admin)</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="crm-btn" onClick={() => setCreatingUser((value) => !value)}>
              <UserPlus size={13} /> Create user account
            </button>
            <button className="crm-btn primary" onClick={() => setCreating((value) => !value)}>
              <Plus size={13} /> New team
            </button>
          </div>
        </div>

        {creatingUser ? (
          <div
            style={{
              padding: "12px 14px",
              borderTop: "1px solid var(--crm-border)",
              background: "var(--crm-surface-raised, var(--crm-surface))",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Create user account
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
              <input
                onChange={(event) => setInviteName(event.target.value)}
                placeholder="Full name"
                style={{ flex: "1 1 140px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
                value={inviteName}
              />
              <input
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="Email address"
                style={{ flex: "1 1 180px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
                type="email"
                value={inviteEmail}
              />
              <input
                onChange={(event) => setInvitePassword(event.target.value)}
                placeholder="Password (min 8 chars)"
                style={{ flex: "1 1 160px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
                type="password"
                value={invitePassword}
              />
              <select
                onChange={(event) => setInviteRole(parseInviteRole(event.target.value))}
                style={{ padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
                value={inviteRole}
              >
                <option value="USER">User</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                className="crm-btn primary"
                disabled={!inviteName.trim() || !inviteEmail.trim() || invitePassword.length < 8 || inviteUser.isPending}
                onClick={() =>
                  inviteUser.mutate({
                    name: inviteName.trim(),
                    email: inviteEmail.trim(),
                    password: invitePassword,
                    role: inviteRole,
                  })
                }
              >
                {inviteUser.isPending ? "Adding…" : "Add user"}
              </button>
              <button className="crm-btn" onClick={() => setCreatingUser(false)}>Cancel</button>
            </div>
          </div>
        ) : null}

        {creating ? (
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--crm-border)", display: "flex", gap: 8, alignItems: "center" }}>
            <input
              onChange={(event) => setName(event.target.value)}
              placeholder="Team name"
              style={{ flex: 1, padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
              value={name}
            />
            <select
              onChange={(event) => setLeaderId(event.target.value)}
              style={{ padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
              value={leaderId}
            >
              <option value="">(no leader)</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name || member.email}</option>
              ))}
            </select>
            <button
              className="crm-btn primary"
              disabled={!name.trim() || createTeam.isPending}
              onClick={() => name.trim() && createTeam.mutate({ name: name.trim(), leaderId: leaderId || undefined })}
            >
              Create
            </button>
            <button className="crm-btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        ) : null}

        {teams.map((team) => (
          <div key={team.id} style={{ padding: "12px 14px", borderTop: "1px solid var(--crm-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong style={{ fontSize: 14 }}>{team.name}</strong>
              <span style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>
                · {team.users.length} member{team.users.length === 1 ? "" : "s"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>Leader:</span>
                <select
                  defaultValue={team.leaderId ?? ""}
                  onChange={(event) =>
                    updateTeam.mutate({ id: team.id, leaderId: event.target.value || null })
                  }
                  style={{ padding: "4px 8px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)", fontSize: 12 }}
                >
                  <option value="">(none)</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name || member.email}</option>
                  ))}
                </select>
                <button
                  className="crm-btn ghost icon"
                  onClick={() => {
                    if (confirm(`Delete team "${team.name}"? Members will be detached.`)) {
                      deleteTeam.mutate({ id: team.id });
                    }
                  }}
                  title="Delete team"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {team.users.map((user) => (
                <span
                  key={user.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px 3px 4px",
                    background: "var(--crm-surface)",
                    border: "1px solid var(--crm-border)",
                    borderRadius: 999,
                    fontSize: 12,
                  }}
                >
                  <div className={`crm-avatar xs ${avatarClass(user.name)}`}>{initials(user.name || user.email)}</div>
                  {user.name || user.email}
                  <button
                    className="crm-btn ghost icon"
                    onClick={() => setMembership.mutate({ userId: user.id, teamId: null })}
                    style={{ width: 18, height: 18 }}
                    title="Remove from team"
                  >
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}

              <button
                className="crm-pill-btn"
                onClick={() => setAddMemberFor({ id: team.id, name: team.name })}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
              >
                <UserPlus size={11} /> Add member
              </button>
            </div>
          </div>
        ))}

        {teams.length === 0 && !creating ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--crm-fg-faint)" }}>
            No teams yet. Create one to start grouping users.
          </div>
        ) : null}
      </div>
    </>
  );
}
