"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { trpc } from "@/app/_trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertCircle,
  Flag,
  X,
  Check,
  Link2,
  Pencil,
  Trash2,
  User,
  Calendar,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  isPast,
  isToday,
} from "date-fns";

type CalendarTask = inferRouterOutputs<AppRouter>["tasks"]["getCalendar"][number];
type OrgMember = inferRouterOutputs<AppRouter>["teams"]["organizationMembers"][number];

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "var(--crm-fg-faint)",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseCalendarDateParam(value: string | null) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function subscribeToLocationChange(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getLocationSearch() {
  return window.location.search;
}

function getServerLocationSearch() {
  return "";
}

function isOverdue(task: Pick<CalendarTask, "dueDate" | "status">) {
  if (task.status === "COMPLETED" || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  return isPast(due) && !isToday(due);
}

function leadLabel(lead: CalendarTask["lead"]) {
  if (!lead) return "";
  return lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—";
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const parsed = new Date(d);
  const t = format(parsed, "h:mm a");
  if (t === "12:00 AM") return format(parsed, "MMM d, yyyy");
  return format(parsed, "MMM d, yyyy h:mm a");
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy");
}

function toDateInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "";
  return format(parsed, "yyyy-MM-dd");
}

function toTimeInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "";
  const h = parsed.getHours().toString().padStart(2, "0");
  const m = parsed.getMinutes().toString().padStart(2, "0");
  if (h === "00" && m === "00") return "";
  return `${h}:${m}`;
}

function combineDateAndTime(dateStr: string, timeStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const base = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  if (isNaN(base.getTime())) return undefined;
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    base.setHours(h ?? 0, m ?? 0, 0, 0);
  }
  return base;
}

// ── Task Chip ─────────────────────────────────────────────────────────────────

function TaskChip({ task, onClick }: { task: CalendarTask; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const color = task.status === "COMPLETED"
    ? "#22c55e"
    : isOverdue(task)
      ? "#ef4444"
      : PRIORITY_COLORS[task.priority ?? "MEDIUM"];

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${task.title}${task.assignedTo ? ` · ${task.assignedTo.name}` : ""}`}
      style={{
        display: "block",
        width: "100%",
        marginBottom: 2,
        padding: "3px 6px",
        borderRadius: 4,
        border: "none",
        background: `${color}22`,
        cursor: "pointer",
        textAlign: "left",
        borderLeft: `2px solid ${color}`,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "block",
        }}
      >
        {task.title}
      </span>
    </button>
  );
}

// ── Day Detail Panel ──────────────────────────────────────────────────────────

function DayPanel({
  date,
  tasks,
  onTaskClick,
  onCreateForDay,
  onClose,
}: {
  date: Date;
  tasks: CalendarTask[];
  onTaskClick: (t: CalendarTask) => void;
  onCreateForDay: (date: Date) => void;
  onClose: () => void;
}) {
  const pending = tasks.filter((t) => t.status !== "COMPLETED");
  const done = tasks.filter((t) => t.status === "COMPLETED");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--crm-bg-card)",
          width: "100%",
          maxWidth: 360,
          height: "100%",
          borderLeft: "1px solid var(--crm-border)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid var(--crm-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "var(--crm-fg-faint)", marginBottom: 2 }}>
              {format(date, "EEEE")}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{format(date, "MMMM d, yyyy")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", cursor: "pointer", display: "flex" }}
          >
            <X size={18} style={{ color: "var(--crm-fg-muted)" }} />
          </button>
        </div>

        <div style={{ padding: "16px 20px", flex: 1 }}>
          <button
            type="button"
            onClick={() => onCreateForDay(date)}
            className="crm-btn primary"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 20 }}
          >
            <Plus size={13} /> Add Follow-up
          </button>

          {tasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--crm-fg-faint)", fontSize: 13 }}>
              <Calendar size={28} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              No follow-ups scheduled
            </div>
          ) : (
            <>
              {pending.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--crm-fg-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 8,
                    }}
                  >
                    Pending ({pending.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {pending.map((t) => (
                      <DayTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />
                    ))}
                  </div>
                </div>
              )}
              {done.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--crm-fg-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 8,
                    }}
                  >
                    Completed ({done.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {done.map((t) => (
                      <DayTaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DayTaskCard({ task, onClick }: { task: CalendarTask; onClick: () => void }) {
  const color = task.status === "COMPLETED"
    ? "#22c55e"
    : isOverdue(task)
      ? "#ef4444"
      : PRIORITY_COLORS[task.priority ?? "MEDIUM"];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        width: "100%",
        padding: "10px 12px",
        background: "var(--crm-surface-2, var(--crm-bg))",
        border: `1px solid var(--crm-border)`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: task.status === "COMPLETED" ? "var(--crm-fg-muted)" : "var(--crm-fg)",
          textDecoration: task.status === "COMPLETED" ? "line-through" : "none",
        }}
      >
        {task.title}
      </span>
      {task.lead && (
        <Link
          href={`/leads?leadId=${task.lead.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 11, color: "#3b82f6", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          <Link2 size={10} /> {leadLabel(task.lead)}
        </Link>
      )}
      {task.assignedTo && (
        <span style={{ fontSize: 11, color: "var(--crm-fg-faint)", display: "flex", alignItems: "center", gap: 4 }}>
          <User size={10} /> {task.assignedTo.name}
        </span>
      )}
    </div>
  );
}

// ── Task Detail Drawer ────────────────────────────────────────────────────────

function TaskDrawer({
  task,
  onComplete,
  onEdit,
  onDelete,
  onClose,
}: {
  task: CalendarTask;
  onComplete: (t: CalendarTask) => void;
  onEdit: (t: CalendarTask) => void;
  onDelete: (t: CalendarTask) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--crm-bg-card)",
          width: "100%",
          maxWidth: 380,
          height: "100%",
          borderLeft: "1px solid var(--crm-border)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--crm-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Follow-up Details</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", cursor: "pointer", display: "flex" }}
          >
            <X size={18} style={{ color: "var(--crm-fg-muted)" }} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", flex: 1 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
            {task.title}
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DetailRow icon={<User size={14} />} label="Assigned To" value={task.assignedTo?.name ?? "—"} />
            <DetailRow icon={<Link2 size={14} />} label="Lead">
              {task.lead ? (
                <Link
                  href={`/leads?leadId=${task.lead.id}`}
                  style={{ fontSize: 13, color: "#3b82f6", fontWeight: 500, textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  {leadLabel(task.lead)}
                </Link>
              ) : (
                <div style={{ fontSize: 13, color: "var(--crm-fg-faint)" }}>No lead</div>
              )}
            </DetailRow>
            <DetailRow
              icon={<Clock size={14} />}
              label="Due"
              value={fmtDateTime(task.dueDate)}
              accent={isOverdue(task)}
            />
            <DetailRow
              icon={<Flag size={14} />}
              label="Priority"
              value={PRIORITY_LABELS[task.priority ?? "MEDIUM"] ?? task.priority}
            />
            <DetailRow
              icon={<AlertCircle size={14} />}
              label="Status"
              value={STATUS_LABELS[task.status ?? "PENDING"] ?? task.status}
            />
            <DetailRow icon={<Calendar size={14} />} label="Created" value={fmtDate(task.createdAt)} />
          </div>
        </div>

        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--crm-border)",
            display: "flex",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="crm-btn"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            onClick={() => onComplete(task)}
          >
            <Check size={13} /> {task.status === "COMPLETED" ? "Reopen" : "Complete"}
          </button>
          <button
            type="button"
            className="crm-btn"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => onEdit(task)}
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#ef4444",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  accent,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  accent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ color: "var(--crm-fg-faint)", marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--crm-fg-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        {children ?? <div style={{ fontSize: 13, color: accent ? "#ef4444" : "var(--crm-fg)" }}>{value}</div>}
      </div>
    </div>
  );
}

// ── Create Task Dialog ────────────────────────────────────────────────────────

type TaskFormData = {
  title: string;
  description: string;
  assignedToId: string;
  dueDate: string;
  dueTime: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
};

function CreateTaskDialog({
  mode = "create",
  initial,
  members,
  pending,
  onSave,
  onClose,
}: {
  mode?: "create" | "edit";
  initial: Partial<TaskFormData>;
  members: OrgMember[];
  pending: boolean;
  onSave: (data: TaskFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TaskFormData>({
    title: "",
    description: "",
    assignedToId: "",
    dueDate: initial.dueDate ?? "",
    dueTime: "",
    priority: "MEDIUM",
    ...initial,
  });

  function set<K extends keyof TaskFormData>(key: K, val: TaskFormData[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required.");
      return;
    }
    onSave(form);
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    border: "1px solid var(--crm-border)",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--crm-fg)",
    background: "var(--crm-bg-card)",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "var(--crm-font-sans)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crm-fg-muted)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--crm-bg-card)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 480,
          margin: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "20px 24px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{mode === "create" ? "New Follow-up" : "Edit Follow-up"}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <X size={18} style={{ color: "var(--crm-fg-muted)" }} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Call back John Smith"
              maxLength={200}
              style={fieldStyle}
              disabled={pending}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional notes…"
              rows={2}
              style={{ ...fieldStyle, resize: "vertical" }}
              disabled={pending}
            />
          </div>

          <div>
            <label style={labelStyle}>Assign To</label>
            <select
              value={form.assignedToId}
              onChange={(e) => set("assignedToId", e.target.value)}
              style={fieldStyle}
              disabled={pending}
            >
              <option value="">— Unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                style={fieldStyle}
                disabled={pending}
              />
            </div>
            <div>
              <label style={labelStyle}>Due Time</label>
              <input
                type="time"
                value={form.dueTime}
                onChange={(e) => set("dueTime", e.target.value)}
                style={fieldStyle}
                disabled={pending}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Priority</label>
            <select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value as TaskFormData["priority"])}
              style={fieldStyle}
              disabled={pending}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} className="crm-btn" disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="crm-btn primary" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create Follow-up" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({
  title,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--crm-bg-card)",
          borderRadius: 12,
          padding: 28,
          maxWidth: 400,
          width: "calc(100% - 32px)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#fef2f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Trash2 size={18} style={{ color: "#ef4444" }} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Delete Follow-up</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--crm-fg-muted)" }}>
              Are you sure you want to delete <strong>&quot;{title}&quot;</strong>? This cannot be undone.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="crm-btn" disabled={pending}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: "#ef4444",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const locationSearch = useSyncExternalStore(
    subscribeToLocationChange,
    getLocationSearch,
    getServerLocationSearch,
  );
  const dateParam = useMemo(() => new URLSearchParams(locationSearch).get("date"), [locationSearch]);
  const linkedDate = useMemo(() => parseCalendarDateParam(dateParam), [dateParam]);
  const utils = trpc.useUtils();
  const [currentMonthOverride, setCurrentMonthOverride] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null | undefined>(undefined);
  const [selectedTask, setSelectedTask] = useState<CalendarTask | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState<string>("");
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<CalendarTask | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const currentMonth = currentMonthOverride ?? linkedDate ?? new Date();
  const activeSelectedDay = selectedDay === undefined ? linkedDate : selectedDay;
  const calendarStart = startOfWeek(startOfMonth(currentMonth));
  const calendarEnd = endOfWeek(endOfMonth(currentMonth));

  const { data: calendarTasks = [], isLoading } = trpc.tasks.getCalendar.useQuery({
    from: calendarStart,
    to: calendarEnd,
    assignedToId: assigneeFilter || undefined,
  });

  const { data: members = [] } = trpc.teams.organizationMembers.useQuery();

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const byDate = calendarTasks.reduce<Record<string, CalendarTask[]>>((acc, t) => {
    if (!t.dueDate) return acc;
    const key = format(new Date(t.dueDate), "yyyy-MM-dd");
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const invalidate = useCallback(() => {
    void utils.tasks.getCalendar.invalidate();
    void utils.tasks.getDueToday.invalidate();
    void utils.tasks.getAll.invalidate();
  }, [utils]);

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      invalidate();
      setCreating(false);
      toast.success("Follow-up created.");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      invalidate();
      setSelectedTask(null);
      setEditingTask(null);
      toast.success("Follow-up updated.");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      invalidate();
      setDeletingTask(null);
      setSelectedTask(null);
      toast.success("Follow-up deleted.");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleComplete(task: CalendarTask) {
    updateTask.mutate({ taskId: task.id, status: task.status === "COMPLETED" ? "PENDING" : "COMPLETED" });
  }

  function handleCreate(form: TaskFormData) {
    const dueDate = combineDateAndTime(form.dueDate, form.dueTime);
    createTask.mutate({
      title: form.title.trim(),
      description: form.description || undefined,
      assignedToId: form.assignedToId || undefined,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      priority: form.priority,
      status: "PENDING",
    });
  }

  function handleEditSave(form: TaskFormData) {
    if (!editingTask) return;
    const dueDate = combineDateAndTime(form.dueDate, form.dueTime);
    updateTask.mutate({
      taskId: editingTask.id,
      title: form.title.trim(),
      description: form.description || undefined,
      assignedToId: form.assignedToId || null,
      dueDate: dueDate ? dueDate.toISOString() : null,
      priority: form.priority,
    });
  }

  function openCreateForDay(date: Date) {
    setSelectedDay(null);
    setCreateDate(format(date, "yyyy-MM-dd"));
    setCreating(true);
  }

  const totalForMonth = calendarTasks.length;
  const overdueCount = calendarTasks.filter(isOverdue).length;
  const completedCount = calendarTasks.filter((t) => t.status === "COMPLETED").length;

  const today = new Date();

  // Tasks for the selected day panel
  const selectedDayTasks = activeSelectedDay
    ? (byDate[format(activeSelectedDay, "yyyy-MM-dd")] ?? [])
    : [];

  return (
    <DashboardLayout>
      <PageShell
        title="Follow-up Calendar"
        subtitle={
          <>
            {totalForMonth} scheduled this view ·{" "}
            {overdueCount > 0 && <span style={{ color: "#ef4444" }}>{overdueCount} overdue · </span>}
            {completedCount} completed
          </>
        }
        actions={
          <>
            {members.length > 0 && (
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="crm-clay-input"
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  color: "var(--crm-fg)",
                  outline: "none",
                }}
              >
                <option value="">All users</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => { setCreateDate(""); setCreating(true); }}
              className="crm-btn primary"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={13} /> New Follow-up
            </button>
          </>
        }
      >
        {/* Month nav */}
        <div className="crm-card flush" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => setCurrentMonthOverride((m) => subMonths(m ?? currentMonth, 1))}
              className="crm-btn"
              style={{ padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              {!isSameMonth(today, currentMonth) && (
                <button
                  type="button"
                  onClick={() => setCurrentMonthOverride(new Date())}
                  className="crm-btn"
                  style={{ fontSize: 12, padding: "3px 10px" }}
                >
                  Today
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCurrentMonthOverride((m) => addMonths(m ?? currentMonth, 1))}
              className="crm-btn"
              style={{ padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 1,
              marginBottom: 1,
            }}
          >
            {WEEK_DAYS.map((d) => (
              <div
                key={d}
                style={{
                  padding: "6px 8px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--crm-fg-muted)",
                  textAlign: "center",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          {isLoading ? (
            <div
              style={{
                padding: "60px 0",
                textAlign: "center",
                color: "var(--crm-fg-faint)",
                fontSize: 13,
              }}
            >
              Loading calendar…
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 1,
                background: "var(--crm-border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayTasks = byDate[key] ?? [];
                const inMonth = isSameMonth(day, currentMonth);
                const todayDay = isSameDay(day, today);
                const isSelected = activeSelectedDay ? isSameDay(day, activeSelectedDay) : false;

                return (
                  <div
                    key={key}
                    onClick={() => {
                      setSelectedTask(null);
                      setSelectedDay((prev) =>
                        prev && isSameDay(prev, day) ? null : day
                      );
                    }}
                    style={{
                      background: isSelected
                        ? "var(--crm-surface-hover, #f0f4ff)"
                        : "var(--crm-bg-card)",
                      minHeight: 110,
                      padding: "6px 6px 4px",
                      opacity: inMonth ? 1 : 0.35,
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: todayDay ? 700 : 500,
                        color: todayDay ? "#fff" : "var(--crm-fg)",
                        background: todayDay ? "#3b82f6" : "transparent",
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 4,
                      }}
                    >
                      {format(day, "d")}
                    </div>
                    {dayTasks.slice(0, 3).map((task) => (
                      <TaskChip
                        key={task.id}
                        task={task}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDay(null);
                          setSelectedTask(task);
                        }}
                      />
                    ))}
                    {dayTasks.length > 3 && (
                      <div
                        style={{ fontSize: 10, color: "var(--crm-fg-faint)", paddingLeft: 4 }}
                      >
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 12,
            flexWrap: "wrap",
            fontSize: 12,
            color: "var(--crm-fg-muted)",
          }}
        >
          {[
            { color: "#ef4444", label: "High priority / Overdue" },
            { color: "#f59e0b", label: "Medium priority" },
            { color: "var(--crm-fg-faint)", label: "Low priority" },
            { color: "#22c55e", label: "Completed" },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: item.color,
                  opacity: 0.7,
                }}
              />
              {item.label}
            </div>
          ))}
        </div>
      </PageShell>

      {/* Day panel */}
      {activeSelectedDay && !selectedTask && (
        <DayPanel
          date={activeSelectedDay}
          tasks={selectedDayTasks}
          onTaskClick={(t) => { setSelectedDay(null); setSelectedTask(t); }}
          onCreateForDay={openCreateForDay}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Task detail drawer */}
      {selectedTask && !deletingTask && (
        <TaskDrawer
          task={selectedTask}
          onComplete={handleComplete}
          onEdit={(t) => {
            setSelectedTask(null);
            setEditingTask(t);
          }}
          onDelete={(t) => { setDeletingTask(t); }}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* Create dialog */}
      {creating && (
        <CreateTaskDialog
          initial={{ dueDate: createDate }}
          members={members}
          pending={createTask.isPending}
          onSave={handleCreate}
          onClose={() => { setCreating(false); setCreateDate(""); }}
        />
      )}

      {/* Edit dialog */}
      {editingTask && (
        <CreateTaskDialog
          mode="edit"
          initial={{
            title: editingTask.title,
            description: editingTask.description ?? "",
            assignedToId: editingTask.assignedTo?.id ?? "",
            dueDate: toDateInputValue(editingTask.dueDate),
            dueTime: toTimeInputValue(editingTask.dueDate),
            priority: (editingTask.priority as TaskFormData["priority"]) ?? "MEDIUM",
          }}
          members={members}
          pending={updateTask.isPending}
          onSave={handleEditSave}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Delete confirm */}
      {deletingTask && (
        <DeleteConfirm
          title={deletingTask.title}
          pending={deleteTask.isPending}
          onConfirm={() => deleteTask.mutate({ taskId: deletingTask.id })}
          onClose={() => setDeletingTask(null)}
        />
      )}
    </DashboardLayout>
  );
}
