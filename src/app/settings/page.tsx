"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";

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

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      toast.success("Account deleted");
      await signOut({ callbackUrl: "/auth/signin" });
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
    ["Role",  (session?.user as { role?: string } | undefined)?.role ?? "USER"],
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
