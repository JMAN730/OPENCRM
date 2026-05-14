"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/app/_trpc/client";
import { AddMemberModal } from "./AddMemberModal";
import {
  avatarClass,
  initials,
  type InviteRole,
  type OrganizationMember,
  type TeamsListItem,
} from "./shared";

type AdminTeamsPanelProps = {
  callerId: string | undefined;
  members: OrganizationMember[];
  membersLoading: boolean;
  teams: TeamsListItem[];
};

export function AdminTeamsPanel({
  callerId,
  members,
  membersLoading,
  teams,
}: AdminTeamsPanelProps) {
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
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 8,
                color: "var(--crm-fg-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Create user account
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
              <input
                onChange={(event) => setInviteName(event.target.value)}
                placeholder="Full name"
                style={{
                  flex: "1 1 140px",
                  padding: "6px 10px",
                  background: "var(--crm-surface)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: "var(--crm-radius-sm)",
                  color: "var(--crm-fg)",
                }}
                value={inviteName}
              />
              <input
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="Email address"
                style={{
                  flex: "1 1 180px",
                  padding: "6px 10px",
                  background: "var(--crm-surface)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: "var(--crm-radius-sm)",
                  color: "var(--crm-fg)",
                }}
                type="email"
                value={inviteEmail}
              />
              <input
                onChange={(event) => setInvitePassword(event.target.value)}
                placeholder="Password (min 8 chars)"
                style={{
                  flex: "1 1 160px",
                  padding: "6px 10px",
                  background: "var(--crm-surface)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: "var(--crm-radius-sm)",
                  color: "var(--crm-fg)",
                }}
                type="password"
                value={invitePassword}
              />
              <select
                onChange={(event) => setInviteRole(parseInviteRole(event.target.value))}
                style={{
                  padding: "6px 10px",
                  background: "var(--crm-surface)",
                  border: "1px solid var(--crm-border)",
                  borderRadius: "var(--crm-radius-sm)",
                  color: "var(--crm-fg)",
                }}
                value={inviteRole}
              >
                <option value="USER">User</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                className="crm-btn primary"
                disabled={
                  !inviteName.trim() ||
                  !inviteEmail.trim() ||
                  invitePassword.length < 8 ||
                  inviteUser.isPending
                }
                onClick={() =>
                  inviteUser.mutate({
                    name: inviteName.trim(),
                    email: inviteEmail.trim(),
                    password: invitePassword,
                    role: inviteRole,
                  })
                }
              >
                {inviteUser.isPending ? "Adding..." : "Add user"}
              </button>
              <button className="crm-btn" onClick={() => setCreatingUser(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {creating ? (
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--crm-border)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              onChange={(event) => setName(event.target.value)}
              placeholder="Team name"
              style={{
                flex: 1,
                padding: "6px 10px",
                background: "var(--crm-surface)",
                border: "1px solid var(--crm-border)",
                borderRadius: "var(--crm-radius-sm)",
                color: "var(--crm-fg)",
              }}
              value={name}
            />
            <select
              onChange={(event) => setLeaderId(event.target.value)}
              style={{
                padding: "6px 10px",
                background: "var(--crm-surface)",
                border: "1px solid var(--crm-border)",
                borderRadius: "var(--crm-radius-sm)",
                color: "var(--crm-fg)",
              }}
              value={leaderId}
            >
              <option value="">(no leader)</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
            <button
              className="crm-btn primary"
              disabled={!name.trim() || createTeam.isPending}
              onClick={() =>
                name.trim() &&
                createTeam.mutate({ name: name.trim(), leaderId: leaderId || undefined })
              }
            >
              Create
            </button>
            <button className="crm-btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
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
                  style={{
                    padding: "4px 8px",
                    background: "var(--crm-surface)",
                    border: "1px solid var(--crm-border)",
                    borderRadius: "var(--crm-radius-sm)",
                    color: "var(--crm-fg)",
                    fontSize: 12,
                  }}
                >
                  <option value="">(none)</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name || member.email}
                    </option>
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
                  <div className={`crm-avatar xs ${avatarClass(user.name)}`}>
                    {initials(user.name || user.email)}
                  </div>
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
