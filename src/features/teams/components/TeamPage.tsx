"use client";

import { trpc } from "@/app/_trpc/client";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Crown, UserPlus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

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

// ── Add Member Modal ──────────────────────────────────────────────────────────

interface AddMemberModalProps {
  teamId: string;
  teamName: string;
  orgMembers: any[];
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
      utils.teams.list.invalidate();
      utils.teams.organizationMembers.invalidate();
      utils.teams.myTeam.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Users available to add: not current user, not already in this team
  const available = useMemo(() => {
    const q = search.toLowerCase();
    return orgMembers.filter((m) => {
      if (m.id === callerId) return false;
      if (m.teamId === teamId) return false;
      if (!q) return true;
      return (
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [orgMembers, callerId, teamId, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((userId) =>
        setMembership.mutateAsync({ userId, teamId })
      )
    );
    toast.success(
      ids.length === 1 ? "Member added" : `${ids.length} members added`
    );
    setSelected(new Set());
    setSearch("");
    onClose();
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSearch("");
      setSelected(new Set());
      onClose();
    }
  }

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
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
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
            // Loading skeletons
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
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
                  <Skeleton className="h-3 w-28 mb-1" />
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
                : orgMembers.filter((m) => m.id !== callerId && m.teamId !== teamId).length === 0
                  ? "No users available to add. Use \"Invite user to org\" to create accounts first."
                  : "No users match your search."}
            </div>
          ) : (
            available.map((m) => (
              <label
                key={m.id}
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
                  checked={selected.has(m.id)}
                  onCheckedChange={() => toggle(m.id)}
                />
                <div className={`crm-avatar sm ${avatarClass(m.name)}`}>
                  {initials(m.name || m.email)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {m.name || m.email}
                  </div>
                  {m.name && (
                    <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>
                      {m.email}
                    </div>
                  )}
                  {m.team && (
                    <div style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>
                      Currently in: {m.team.name}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    color: "var(--crm-fg-faint)",
                  }}
                >
                  {m.role}
                </span>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={setMembership.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selected.size === 0 || setMembership.isPending}
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

// ── Main TeamPage ─────────────────────────────────────────────────────────────

export function TeamPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
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
                : "You're not currently on a team"}
          </div>
        </div>
      </div>

      {!myTeam && !isAdmin && (
        <div className="crm-card" style={{ padding: 32, textAlign: "center", color: "var(--crm-fg-faint)" }}>
          You haven't been added to a team yet. Ask your admin to invite you.
        </div>
      )}

      {myTeam && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
          {/* Members */}
          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Members</h3>
              <span className="crm-sub">· {myTeam.users.length}</span>
            </div>
            <div>
              {myTeam.users.map((u) => {
                const canViewDetail = isAdmin || isLeader || u.id === callerId;
                const isLeaderOfTeam = myTeam.leaderId === u.id;
                const row = (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderTop: "1px solid var(--crm-border)",
                      cursor: canViewDetail ? "pointer" : "default",
                    }}
                  >
                    <div className={`crm-avatar sm ${avatarClass(u.name)}`}>
                      {initials(u.name || u.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="crm-n">{u.name || u.email}</span>
                        {isLeaderOfTeam && (
                          <span title="Team leader" style={{ color: "var(--crm-warn, #d4a017)", display: "inline-flex" }}>
                            <Crown size={12} />
                          </span>
                        )}
                      </div>
                      {u.email && <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>{u.email}</div>}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--crm-fg-faint)", textTransform: "uppercase" }}>{u.role}</span>
                  </div>
                );
                return canViewDetail ? (
                  <Link key={u.id} href={`/team/${u.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                    {row}
                  </Link>
                ) : (
                  row
                );
              })}
            </div>
          </div>

          {/* Activity feed */}
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
                feed.map((a: any) => {
                  const verb = ACTIVITY_VERB[a.type] ?? a.type.toLowerCase();
                  const leadLabel =
                    [a.lead?.firstName, a.lead?.lastName].filter(Boolean).join(" ") ||
                    a.lead?.company ||
                    "(lead)";
                  return (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "10px 14px",
                        borderTop: "1px solid var(--crm-border)",
                        alignItems: "flex-start",
                      }}
                    >
                      <div className={`crm-avatar xs ${avatarClass(a.user?.name)}`}>
                        {initials(a.user?.name || a.user?.email)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13 }}>
                          <strong>{a.user?.name || a.user?.email || "Someone"}</strong>{" "}
                          <span style={{ color: "var(--crm-fg-faint)" }}>{verb}</span>{" "}
                          <Link href={`/leads`} style={{ color: "var(--crm-fg)" }}>
                            {leadLabel}
                          </Link>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)", marginTop: 1 }}>
                          {a.description} · {relativeTime(a.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <AdminTeamsPanel
          teams={allTeams}
          members={orgMembers}
          membersLoading={membersLoading}
          callerId={callerId}
        />
      )}

      {teamLoading && !myTeam && !isAdmin && (
        <div style={{ padding: 32, textAlign: "center", color: "var(--crm-fg-faint)" }}>Loading…</div>
      )}
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────

function AdminTeamsPanel({
  teams,
  members,
  membersLoading,
  callerId,
}: {
  teams: any[];
  members: any[];
  membersLoading: boolean;
  callerId: string | undefined;
}) {
  const utils = trpc.useUtils();

  // New team form
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [leaderId, setLeaderId] = useState<string>("");

  // Invite user to org form
  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"USER" | "MANAGER" | "ADMIN">("USER");

  // Add member modal
  const [addMemberFor, setAddMemberFor] = useState<{ id: string; name: string } | null>(null);

  const createTeam = trpc.teams.create.useMutation({
    onSuccess: () => {
      toast.success("Team created");
      setCreating(false);
      setName("");
      setLeaderId("");
      utils.teams.list.invalidate();
      utils.teams.myTeam.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTeam = trpc.teams.update.useMutation({
    onSuccess: () => {
      toast.success("Team updated");
      utils.teams.list.invalidate();
      utils.teams.myTeam.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTeam = trpc.teams.delete.useMutation({
    onSuccess: () => {
      toast.success("Team deleted");
      utils.teams.list.invalidate();
      utils.teams.myTeam.invalidate();
      utils.teams.organizationMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const setMembership = trpc.teams.setMembership.useMutation({
    onSuccess: () => {
      toast.success("Membership updated");
      utils.teams.list.invalidate();
      utils.teams.organizationMembers.invalidate();
      utils.teams.myTeam.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteUser = trpc.teams.inviteUser.useMutation({
    onSuccess: () => {
      toast.success("User added to organization");
      setInviting(false);
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("USER");
      utils.teams.organizationMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      {/* Add Member Modal */}
      {addMemberFor && (
        <AddMemberModal
          teamId={addMemberFor.id}
          teamName={addMemberFor.name}
          orgMembers={members}
          membersLoading={membersLoading}
          callerId={callerId}
          open={!!addMemberFor}
          onClose={() => setAddMemberFor(null)}
        />
      )}

      <div className="crm-card flush" style={{ marginTop: 16 }}>
        <div className="crm-card-head">
          <h3>Teams (admin)</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              className="crm-btn"
              onClick={() => setInviting((v) => !v)}
            >
              <UserPlus size={13} /> Invite user to org
            </button>
            <button
              className="crm-btn primary"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus size={13} /> New team
            </button>
          </div>
        </div>

        {/* Invite user to org form */}
        {inviting && (
          <div
            style={{
              padding: "12px 14px",
              borderTop: "1px solid var(--crm-border)",
              background: "var(--crm-surface-raised, var(--crm-surface))",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Invite new user to organization
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
              <input
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                style={{ flex: "1 1 140px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
              />
              <input
                placeholder="Email address"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                style={{ flex: "1 1 180px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
              />
              <input
                placeholder="Password (min 8 chars)"
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                style={{ flex: "1 1 160px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                style={{ padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
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
              <button className="crm-btn" onClick={() => setInviting(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* New team form */}
        {creating && (
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--crm-border)", display: "flex", gap: 8, alignItems: "center" }}>
            <input
              placeholder="Team name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: 1, padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
            />
            <select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              style={{ padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)" }}
            >
              <option value="">(no leader)</option>
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
            <button
              className="crm-btn primary"
              onClick={() => name.trim() && createTeam.mutate({ name: name.trim(), leaderId: leaderId || undefined })}
              disabled={!name.trim() || createTeam.isPending}
            >Create</button>
            <button className="crm-btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        )}

        {teams.map((t: any) => (
          <div key={t.id} style={{ padding: "12px 14px", borderTop: "1px solid var(--crm-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong style={{ fontSize: 14 }}>{t.name}</strong>
              <span style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>
                · {t.users.length} member{t.users.length === 1 ? "" : "s"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>Leader:</span>
                <select
                  defaultValue={t.leaderId ?? ""}
                  onChange={(e) =>
                    updateTeam.mutate({ id: t.id, leaderId: e.target.value || null })
                  }
                  style={{ padding: "4px 8px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)", fontSize: 12 }}
                >
                  <option value="">(none)</option>
                  {members.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name || m.email}</option>
                  ))}
                </select>
                <button
                  className="crm-btn ghost icon"
                  title="Delete team"
                  onClick={() => {
                    if (confirm(`Delete team "${t.name}"? Members will be detached.`)) {
                      deleteTeam.mutate({ id: t.id });
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {t.users.map((u: any) => (
                <span
                  key={u.id}
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
                  <div className={`crm-avatar xs ${avatarClass(u.name)}`}>{initials(u.name || u.email)}</div>
                  {u.name || u.email}
                  <button
                    className="crm-btn ghost icon"
                    style={{ width: 18, height: 18 }}
                    title="Remove from team"
                    onClick={() => setMembership.mutate({ userId: u.id, teamId: null })}
                  >
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}

              <button
                className="crm-pill-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                onClick={() => setAddMemberFor({ id: t.id, name: t.name })}
              >
                <UserPlus size={11} /> Add member
              </button>
            </div>
          </div>
        ))}

        {teams.length === 0 && !creating && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--crm-fg-faint)" }}>
            No teams yet. Create one to start grouping users.
          </div>
        )}
      </div>
    </>
  );
}
