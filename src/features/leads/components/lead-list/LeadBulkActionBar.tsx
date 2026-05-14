"use client";

import { avatarClass, initials, type AssignableUser } from "./shared";

type LeadBulkActionBarProps = {
  assignableUsers: AssignableUser[];
  canAssign: boolean;
  isBulkDeleting: boolean;
  onAssign: (assigneeId: string | null) => void;
  onBulkDelete: () => void;
  onClear: () => void;
  onToggleAssignMenu: () => void;
  selectedCount: number;
  showAssignMenu: boolean;
};

export function LeadBulkActionBar({
  assignableUsers,
  canAssign,
  isBulkDeleting,
  onAssign,
  onBulkDelete,
  onClear,
  onToggleAssignMenu,
  selectedCount,
  showAssignMenu,
}: LeadBulkActionBarProps) {
  return (
    <div className="crm-selbar">
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
        <span>{selectedCount} selected</span>
        <button
          className="crm-pill-btn"
          disabled={!canAssign}
          title={canAssign ? "Reassign selected leads" : "Only team leaders or admins can reassign"}
          onClick={onToggleAssignMenu}
        >
          Assign
        </button>
        <button className="crm-pill-btn">Change stage</button>
        <button className="crm-pill-btn">Sequence</button>
        <button
          className="crm-pill-btn"
          onClick={onBulkDelete}
          disabled={isBulkDeleting}
          title="Delete selected leads"
        >
          {isBulkDeleting ? "Deleting..." : "Delete"}
        </button>
        <button className="crm-pill-btn" onClick={onClear}>
          Clear
        </button>

        {showAssignMenu ? (
          <div
            className="crm-card"
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 90,
              minWidth: 220,
              padding: 4,
              zIndex: 50,
              boxShadow: "0 6px 24px rgba(0,0,0,.25)",
              borderRadius: "var(--crm-radius-md)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: "6px 10px",
                fontSize: 11,
                color: "var(--crm-fg-faint)",
                textTransform: "uppercase",
              }}
            >
              Assign to
            </div>
            {assignableUsers.map((user) => (
              <button
                key={user.id}
                className="crm-nav-item"
                style={{
                  borderRadius: "var(--crm-radius-sm)",
                  fontSize: 13,
                  width: "100%",
                  textAlign: "left",
                }}
                onClick={() => onAssign(user.id)}
              >
                <div className={`crm-avatar xs ${avatarClass(user.name || "?")}`}>
                  {initials(user.name || user.email || "?")}
                </div>
                <span>{user.name || user.email}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "var(--crm-border)", margin: "4px 6px" }} />
            <button
              className="crm-nav-item"
              style={{
                borderRadius: "var(--crm-radius-sm)",
                fontSize: 13,
                width: "100%",
                textAlign: "left",
                color: "var(--crm-fg-faint)",
              }}
              onClick={() => onAssign(null)}
            >
              Unassign
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
