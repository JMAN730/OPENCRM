"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { avatarClass, initials, type InviteRole } from "@/features/teams/components/team-page/shared";

const NAV = ["Profile", "Workspace", "Members", "Integrations", "Billing", "API", "Audit log"];

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const [active, setActive] = useState("Profile");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const userName = session?.user?.name ?? "—";
  const userEmail = session?.user?.email ?? "—";

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await updateSession();
      toast.success("Profile updated");
      setEditing(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = userRole === "ADMIN";

  const { data: members = [], isLoading: membersLoading } = trpc.teams.organizationMembers.useQuery(
    undefined,
    { enabled: active === "Members" },
  );

  const utils = trpc.useUtils();

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("USER");

  const inviteUser = trpc.teams.inviteUser.useMutation({
    onSuccess: () => {
      toast.success("User added to organization");
      setShowInviteForm(false);
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("USER");
      void utils.teams.organizationMembers.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to add user"),
  });

  const parseInviteRole = (value: string): InviteRole => {
    if (value === "MANAGER" || value === "ADMIN") return value;
    return "USER";
  };

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      toast.success("Account deleted");
      await signOut({ callbackUrl: `${window.location.origin}/auth/signin` });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete account");
      setConfirmDelete(false);
    },
  });

  const handleEdit = (key: string, current: string) => {
    setEditing(key);
    setEditValue(current === "—" ? "" : current);
  };

  const handleSave = (key: string) => {
    if (!editValue.trim()) return;
    if (key === "Name") updateProfile.mutate({ name: editValue.trim() });
    else if (key === "Email") updateProfile.mutate({ email: editValue.trim() });
  };

  const profileRows: [string, string][] = [
    ["Name",  userName],
    ["Email", userEmail],
    ["Role",  userRole ?? "USER"],
  ];

  const workspaceRows: [string, string][] = [
    ["Workspace name",    "My workspace"],
    ["Time zone",         Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["Default currency",  "USD ($)"],
    ["Fiscal year start", "January"],
  ];

  const rows: [string, string][] =
    active === "Profile" ? profileRows :
    active === "Workspace" ? workspaceRows : [];

  const desc: Record<string, string> = {
    Profile:      "Your personal information and account preferences.",
    Workspace:    "Workspace defaults and regional settings.",
    Members:      "Manage who has access to this workspace.",
    Integrations: "Review supported integrations and placeholder areas that still need implementation.",
    Billing:      "Subscription plan and payment details.",
    API:          "API keys and webhook configuration.",
    "Audit log":  "A history of actions taken in this workspace.",
  };

  const editableKeys = new Set(["Name", "Email"]);

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Settings</h1>
            <div className="crm-page-sub">Workspace, team, integrations</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((s) => (
              <button
                key={s}
                className="crm-nav-item"
                aria-current={active === s ? "page" : undefined}
                onClick={() => { setActive(s); setEditing(null); }}
                style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="crm-card" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "var(--crm-fg)" }}>{active}</h3>
            <p style={{ margin: "0 0 20px", color: "var(--crm-fg-muted)", fontSize: 13 }}>{desc[active]}</p>

            {rows.length > 0 ? (
              <>
                {rows.map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "grid", gridTemplateColumns: "180px 1fr",
                      padding: "12px 0", borderTop: "1px solid var(--crm-border)", fontSize: 13,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ color: "var(--crm-fg-muted)" }}>{k}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {editing === k ? (
                        <>
                          <input
                            autoFocus
                            type={k === "Email" ? "email" : "text"}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSave(k);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            style={{
                              flex: 1, padding: "4px 8px", fontSize: 13,
                              border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)",
                              background: "var(--crm-surface)", color: "var(--crm-fg)",
                              outline: "none",
                            }}
                          />
                          <button
                            className="crm-btn primary"
                            style={{ height: 24, padding: "0 10px", fontSize: 12 }}
                            disabled={updateProfile.isPending || !editValue.trim()}
                            onClick={() => handleSave(k)}
                          >
                            {updateProfile.isPending ? "Saving…" : "Save"}
                          </button>
                          <button
                            className="crm-btn"
                            style={{ height: 24, padding: "0 10px", fontSize: 12 }}
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ color: "var(--crm-fg)" }}>{v}</span>
                          {editableKeys.has(k) && (
                            <button
                              className="crm-btn"
                              style={{ height: 24, padding: "0 10px", fontSize: 12, marginLeft: "auto" }}
                              onClick={() => handleEdit(k, v)}
                            >
                              Edit
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {active === "Profile" && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--crm-border)" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--crm-neg)", marginBottom: 4 }}>Danger zone</div>
                    <div style={{ fontSize: 13, color: "var(--crm-fg-muted)", marginBottom: 12 }}>
                      Once you delete your account, there is no going back.
                    </div>
                    {!confirmDelete ? (
                      <button
                        className="crm-btn"
                        style={{ height: 32, padding: "0 16px", border: "1px solid var(--crm-neg)", color: "var(--crm-neg)" }}
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete account
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "var(--crm-fg-muted)" }}>Are you sure?</span>
                        <button
                          className="crm-btn"
                          style={{ height: 32, padding: "0 14px", background: "var(--crm-neg)", color: "white", border: "none" }}
                          disabled={deleteAccount.isPending}
                          onClick={() => deleteAccount.mutate()}
                        >
                          {deleteAccount.isPending ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button
                          className="crm-btn"
                          style={{ height: 32, padding: "0 14px" }}
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {active !== "Profile" && (
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--crm-border)" }}>
                    <button className="crm-btn primary" style={{ height: 32, padding: "0 16px" }}>Save changes</button>
                  </div>
                )}
              </>
            ) : active === "Members" ? (
              <MembersPanel
                isAdmin={isAdmin}
                inviteEmail={inviteEmail}
                inviteIsPending={inviteUser.isPending}
                inviteName={inviteName}
                invitePassword={invitePassword}
                inviteRole={inviteRole}
                members={members}
                membersLoading={membersLoading}
                onInvite={() =>
                  inviteUser.mutate({
                    name: inviteName.trim(),
                    email: inviteEmail.trim(),
                    password: invitePassword,
                    role: inviteRole,
                  })
                }
                parseInviteRole={parseInviteRole}
                setInviteEmail={setInviteEmail}
                setInviteName={setInviteName}
                setInvitePassword={setInvitePassword}
                setInviteRole={setInviteRole}
                setShowInviteForm={setShowInviteForm}
                showInviteForm={showInviteForm}
              />
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13, borderTop: "1px solid var(--crm-border)" }}>
                Coming soon
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

type OrganizationMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  teamId: string | null;
  team: { id: string; name: string } | null;
};

type MembersPanelProps = {
  isAdmin: boolean;
  inviteEmail: string;
  inviteIsPending: boolean;
  inviteName: string;
  invitePassword: string;
  inviteRole: InviteRole;
  members: OrganizationMember[];
  membersLoading: boolean;
  onInvite: () => void;
  parseInviteRole: (value: string) => InviteRole;
  setInviteEmail: (v: string) => void;
  setInviteName: (v: string) => void;
  setInvitePassword: (v: string) => void;
  setInviteRole: (v: InviteRole) => void;
  setShowInviteForm: (v: boolean) => void;
  showInviteForm: boolean;
};

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  ADMIN:   { label: "Admin",   color: "var(--crm-accent, #6366f1)" },
  MANAGER: { label: "Manager", color: "var(--crm-pos, #16a34a)" },
  USER:    { label: "User",    color: "var(--crm-fg-muted)" },
};

function MembersPanel({
  isAdmin,
  inviteEmail,
  inviteIsPending,
  inviteName,
  invitePassword,
  inviteRole,
  members,
  membersLoading,
  onInvite,
  parseInviteRole,
  setInviteEmail,
  setInviteName,
  setInvitePassword,
  setInviteRole,
  setShowInviteForm,
  showInviteForm,
}: MembersPanelProps) {
  const canInvite =
    inviteName.trim().length > 0 &&
    inviteEmail.trim().length > 0 &&
    invitePassword.length >= 8 &&
    !inviteIsPending;

  return (
    <div>
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          {showInviteForm ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", padding: "12px 0", borderTop: "1px solid var(--crm-border)" }}>
              <input
                autoFocus
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Full name"
                style={{ flex: "1 1 140px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)", fontSize: 13 }}
                value={inviteName}
              />
              <input
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                style={{ flex: "1 1 180px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)", fontSize: 13 }}
                type="email"
                value={inviteEmail}
              />
              <input
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                style={{ flex: "1 1 160px", padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)", fontSize: 13 }}
                type="password"
                value={invitePassword}
              />
              <select
                onChange={(e) => setInviteRole(parseInviteRole(e.target.value))}
                style={{ padding: "6px 10px", background: "var(--crm-surface)", border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", color: "var(--crm-fg)", fontSize: 13 }}
                value={inviteRole}
              >
                <option value="USER">User</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button className="crm-btn primary" disabled={!canInvite} onClick={onInvite} style={{ height: 32, padding: "0 14px" }}>
                {inviteIsPending ? "Adding…" : "Add user"}
              </button>
              <button className="crm-btn" onClick={() => setShowInviteForm(false)} style={{ height: 32, padding: "0 14px" }}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="crm-btn" onClick={() => setShowInviteForm(true)} style={{ height: 32, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <UserPlus size={13} /> Add member
            </button>
          )}
        </div>
      )}

      {membersLoading ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>Loading…</div>
      ) : members.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13, borderTop: "1px solid var(--crm-border)" }}>No members found.</div>
      ) : (
        <div style={{ borderTop: "1px solid var(--crm-border)" }}>
          {members.map((member) => {
            const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.USER;
            return (
              <div
                key={member.id}
                style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--crm-border)" }}
              >
                <div className={`crm-avatar sm ${avatarClass(member.name)}`} style={{ flexShrink: 0 }}>
                  {initials(member.name || member.email)}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--crm-fg)" }}>{member.name ?? "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--crm-fg-muted)" }}>{member.email ?? "—"}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--crm-fg-muted)" }}>
                  {member.team?.name ?? <span style={{ color: "var(--crm-fg-faint)" }}>No team</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: `color-mix(in srgb, ${badge.color} 12%, transparent)`, padding: "2px 8px", borderRadius: 999 }}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
