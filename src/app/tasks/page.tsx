"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { trpc } from "@/app/_trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Calendar, List, ChevronLeft, ChevronRight,
  Pencil, Trash2, Check, AlertCircle, Clock, User, Link2,
  X, Search, Flag,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths,
} from "date-fns";
import { getTaskSummaryCounts, isTaskOverdue } from "./task-summary";

type TaskItem = inferRouterOutputs<AppRouter>["tasks"]["getAll"]["items"][number];
type OrgMember = inferRouterOutputs<AppRouter>["teams"]["organizationMembers"][number];
type LeadResult = inferRouterOutputs<AppRouter>["leads"]["getAll"]["items"][number];

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_LABELS = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;
const STATUS_LABELS = { PENDING: "Pending", IN_PROGRESS: "In Progress", COMPLETED: "Completed" } as const;

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "var(--crm-fg-faint)",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "var(--crm-fg-muted)",
  IN_PROGRESS: "#3b82f6",
  COMPLETED: "#22c55e",
};

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy");
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const parsed = new Date(d);
  const timeStr = format(parsed, "h:mm a");
  if (timeStr === "12:00 AM") return format(parsed, "MMM d, yyyy");
  return format(parsed, "MMM d, yyyy h:mm a");
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

function isOverdue(task: Pick<TaskItem, "dueDate" | "status">) {
  return isTaskOverdue(task);
}

function leadName(lead: TaskItem["lead"]) {
  if (!lead) return "";
  return lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—";
}

// ── Lead Search Combobox ──────────────────────────────────────────────────────

function LeadCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = trpc.leads.getAll.useQuery(
    { search: search || undefined, limit: 10 },
    { enabled: open && search.length > 0 },
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const leads = data?.items ?? [];

  function select(lead: LeadResult) {
    const name = lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed";
    onChange(lead.id, name);
    setDisplayName(name);
    setSearch("");
    setOpen(false);
  }

  function clear() {
    onChange("", "");
    setDisplayName("");
    setSearch("");
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {value && !open ? (
          <div style={{
            flex: 1, padding: "6px 10px", border: "1px solid var(--crm-border)",
            borderRadius: 6, fontSize: 13, color: "var(--crm-fg)", display: "flex",
            alignItems: "center", justifyContent: "space-between", gap: 6,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Link2 size={12} style={{ color: "var(--crm-fg-muted)" }} />
              {displayName}
            </span>
            <button type="button" onClick={clear} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <X size={12} style={{ color: "var(--crm-fg-muted)" }} />
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--crm-fg-faint)" }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search leads by name, company, email…"
              style={{
                width: "100%", padding: "6px 10px 6px 28px",
                border: "1px solid var(--crm-border)", borderRadius: 6,
                fontSize: 13, color: "var(--crm-fg)", background: "var(--crm-bg-card)",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>
      {open && search.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "var(--crm-bg-card)", border: "1px solid var(--crm-border)",
          borderRadius: 8, marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          maxHeight: 240, overflowY: "auto",
        }}>
          {leads.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--crm-fg-faint)" }}>No leads found</div>
          ) : leads.map((lead) => {
            const name = lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed";
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => select(lead)}
                style={{
                  width: "100%", padding: "8px 14px", border: "none", background: "none",
                  cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--crm-fg)",
                  display: "flex", flexDirection: "column", gap: 2,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--crm-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span style={{ fontWeight: 500 }}>{name}</span>
                {lead.email && <span style={{ fontSize: 11, color: "var(--crm-fg-muted)" }}>{lead.email}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Task Form (used in Create and Edit dialogs) ───────────────────────────────

type TaskFormData = {
  title: string;
  description: string;
  assignedToId: string;
  leadId: string;
  leadName: string;
  dueDate: string;
  dueTime: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
};

function emptyForm(): TaskFormData {
  return { title: "", description: "", assignedToId: "", leadId: "", leadName: "", dueDate: "", dueTime: "", priority: "MEDIUM", status: "PENDING" };
}

function formFromTask(task: TaskItem): TaskFormData {
  return {
    title: task.title,
    description: task.description ?? "",
    assignedToId: task.assignedTo?.id ?? task.user?.id ?? "",
    leadId: task.lead?.id ?? "",
    leadName: leadName(task.lead),
    dueDate: toDateInputValue(task.dueDate),
    dueTime: toTimeInputValue(task.dueDate),
    priority: (task.priority as TaskFormData["priority"]) ?? "MEDIUM",
    status: (task.status as TaskFormData["status"]) ?? "PENDING",
  };
}

type TaskDialogProps = {
  mode: "create" | "edit";
  initial: TaskFormData;
  members: OrgMember[];
  pending: boolean;
  onSave: (data: TaskFormData) => void;
  onClose: () => void;
};

function TaskDialog({ mode, initial, members, pending, onSave, onClose }: TaskDialogProps) {
  const [form, setForm] = useState<TaskFormData>(initial);

  function set<K extends keyof TaskFormData>(key: K, val: TaskFormData[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required."); return; }
    onSave(form);
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", border: "1px solid var(--crm-border)",
    borderRadius: 6, fontSize: 13, color: "var(--crm-fg)", background: "var(--crm-bg-card)",
    outline: "none", boxSizing: "border-box", fontFamily: "var(--crm-font-sans)",
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--crm-fg-muted)", marginBottom: 4, display: "block" };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--crm-bg-card)", borderRadius: 12, width: "100%", maxWidth: 540,
        margin: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{mode === "create" ? "New Task" : "Edit Task"}</h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={18} style={{ color: "var(--crm-fg-muted)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Call Bob Smith"
              maxLength={200}
              style={fieldStyle}
              disabled={pending}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional details…"
              rows={2}
              style={{ ...fieldStyle, resize: "vertical" }}
              disabled={pending}
            />
          </div>

          {/* Assign To */}
          <div>
            <label style={labelStyle}>Assigned To</label>
            <select
              value={form.assignedToId}
              onChange={(e) => set("assignedToId", e.target.value)}
              style={fieldStyle}
              disabled={pending}
            >
              <option value="">— Unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          </div>

          {/* Lead */}
          <div>
            <label style={labelStyle}>Lead</label>
            <LeadCombobox
              value={form.leadId}
              onChange={(id, name) => setForm((f) => ({ ...f, leadId: id, leadName: name }))}
            />
          </div>

          {/* Due Date + Time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} style={fieldStyle} disabled={pending} />
            </div>
            <div>
              <label style={labelStyle}>Due Time</label>
              <input type="time" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} style={fieldStyle} disabled={pending} />
            </div>
          </div>

          {/* Priority + Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value as TaskFormData["priority"])} style={fieldStyle} disabled={pending}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value as TaskFormData["status"])} style={fieldStyle} disabled={pending}>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} className="crm-btn" disabled={pending}>Cancel</button>
            <button type="submit" className="crm-btn primary" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create Task" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Dialog ─────────────────────────────────────────────────────

function DeleteConfirm({ taskTitle, onConfirm, onClose, pending }: { taskTitle: string; onConfirm: () => void; onClose: () => void; pending: boolean }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--crm-bg-card)", borderRadius: 12, padding: 28, maxWidth: 400,
        width: "calc(100% - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trash2 size={18} style={{ color: "#ef4444" }} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>Delete Task</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--crm-fg-muted)" }}>
              Are you sure you want to delete <strong>&quot;{taskTitle}&quot;</strong>? This action cannot be undone.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="crm-btn" disabled={pending}>Cancel</button>
          <button onClick={onConfirm} disabled={pending} style={{
            padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            background: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 600,
          }}>
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ task }: { task: TaskItem }) {
  const overdue = isOverdue(task);
  if (overdue) return <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", background: "#fef2f2", borderRadius: 4, padding: "2px 6px" }}>Overdue</span>;
  const status = task.status ?? "PENDING";
  const color = STATUS_COLORS[status] ?? "var(--crm-fg-muted)";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}18`, borderRadius: 4, padding: "2px 6px" }}>
      {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "var(--crm-fg-muted)";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}18`, borderRadius: 4, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3 }}>
      <Flag size={10} />
      {PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority}
    </span>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onEdit,
  onDelete,
  onComplete,
}: {
  task: TaskItem;
  onEdit: (t: TaskItem) => void;
  onDelete: (t: TaskItem) => void;
  onComplete: (t: TaskItem) => void;
}) {
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuPos) return;
    function handle(e: MouseEvent) {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenuPos(null);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuPos]);

  function openMenu() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--crm-border)" }}>
      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => onComplete(task)}
            title={task.status === "COMPLETED" ? "Mark incomplete" : "Mark complete"}
            style={{
              width: 18, height: 18, borderRadius: 4, border: "1.5px solid",
              borderColor: task.status === "COMPLETED" ? "#22c55e" : "var(--crm-border)",
              background: task.status === "COMPLETED" ? "#22c55e" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {task.status === "COMPLETED" && <Check size={11} color="#fff" strokeWidth={2.5} />}
          </button>
          <span style={{ fontSize: 13, fontWeight: 500, textDecoration: task.status === "COMPLETED" ? "line-through" : "none", color: task.status === "COMPLETED" ? "var(--crm-fg-muted)" : "var(--crm-fg)" }}>
            {task.title}
          </span>
        </div>
        {task.description && (
          <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", marginTop: 2, marginLeft: 28, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
            {task.description}
          </div>
        )}
      </td>
      <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--crm-fg-muted)", verticalAlign: "middle" }}>
        {task.assignedTo?.name ?? task.user?.name ?? "—"}
      </td>
      <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--crm-fg-muted)", verticalAlign: "middle" }}>
        {task.lead ? (
          <span style={{ color: "#3b82f6", fontWeight: 500 }}>{leadName(task.lead)}</span>
        ) : "—"}
      </td>
      <td style={{ padding: "10px 16px", fontSize: 13, color: isOverdue(task) ? "#ef4444" : "var(--crm-fg-muted)", verticalAlign: "middle", whiteSpace: "nowrap" }}>
        {fmtDateTime(task.dueDate)}
      </td>
      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}><StatusBadge task={task} /></td>
      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}><PriorityBadge priority={task.priority ?? "MEDIUM"} /></td>
      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
        <button
          ref={btnRef}
          type="button"
          onClick={openMenu}
          style={{ border: "none", background: "none", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", color: "var(--crm-fg-muted)" }}
        >
          <span style={{ display: "flex", gap: 2 }}>
            <span style={{ width: 4, height: 4, borderRadius: 2, background: "currentcolor" }} />
            <span style={{ width: 4, height: 4, borderRadius: 2, background: "currentcolor" }} />
            <span style={{ width: 4, height: 4, borderRadius: 2, background: "currentcolor" }} />
          </span>
        </button>
        {menuPos && (
          <div ref={menuRef} style={{
            position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 200,
            background: "var(--crm-bg-card)", border: "1px solid var(--crm-border)",
            borderRadius: 8, minWidth: 150, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}>
            <button type="button" onClick={() => { setMenuPos(null); onComplete(task); }} style={menuItemStyle}>
              <Check size={13} /> {task.status === "COMPLETED" ? "Mark incomplete" : "Mark complete"}
            </button>
            <button type="button" onClick={() => { setMenuPos(null); onEdit(task); }} style={menuItemStyle}>
              <Pencil size={13} /> Edit
            </button>
            <div style={{ borderTop: "1px solid var(--crm-border)" }} />
            <button type="button" onClick={() => { setMenuPos(null); onDelete(task); }} style={{ ...menuItemStyle, color: "#ef4444" }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: "100%", padding: "8px 14px", border: "none", background: "none",
  cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex",
  alignItems: "center", gap: 8, color: "var(--crm-fg)",
};

// ── Calendar View ─────────────────────────────────────────────────────────────

function CalendarView({ tasks, onTaskClick }: { tasks: TaskItem[]; onTaskClick: (t: TaskItem) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarStart = startOfWeek(startOfMonth(currentMonth));
  const calendarEnd = endOfWeek(endOfMonth(currentMonth));
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const byDate = tasks.reduce<Record<string, TaskItem[]>>((acc, t) => {
    if (!t.dueDate) return acc;
    const key = format(new Date(t.dueDate), "yyyy-MM-dd");
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const today = new Date();
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      {/* Calendar header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button type="button" onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="crm-btn" style={{ padding: "4px 10px" }}>
          <ChevronLeft size={16} />
        </button>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{format(currentMonth, "MMMM yyyy")}</h3>
        <button type="button" onClick={() => setCurrentMonth((m) => addMonths(m, 1))} className="crm-btn" style={{ padding: "4px 10px" }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
        {DAYS.map((d) => (
          <div key={d} style={{ padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "var(--crm-fg-muted)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--crm-border)", borderRadius: 8, overflow: "hidden" }}>
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = byDate[key] ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const todayDay = isSameDay(day, today);

          return (
            <div key={key} style={{
              background: "var(--crm-bg-card)",
              minHeight: 100,
              padding: "6px 6px 4px",
              opacity: inMonth ? 1 : 0.35,
            }}>
              <div style={{
                fontSize: 12, fontWeight: todayDay ? 700 : 500,
                color: todayDay ? "#fff" : "var(--crm-fg)",
                background: todayDay ? "#3b82f6" : "transparent",
                width: 22, height: 22, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 4,
              }}>
                {format(day, "d")}
              </div>
              {dayTasks.slice(0, 3).map((task) => {
                const color = task.status === "COMPLETED" ? "#22c55e" : isOverdue(task) ? "#ef4444" : PRIORITY_COLORS[task.priority ?? "MEDIUM"];
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onTaskClick(task)}
                    title={`${task.title}${task.assignedTo ? ` · ${task.assignedTo.name}` : ""}`}
                    style={{
                      display: "block", width: "100%", marginBottom: 2,
                      padding: "2px 5px", borderRadius: 3, border: "none",
                      background: `${color}22`, cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 500, color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                      {task.title}
                    </span>
                  </button>
                );
              })}
              {dayTasks.length > 3 && (
                <div style={{ fontSize: 10, color: "var(--crm-fg-faint)", paddingLeft: 4 }}>+{dayTasks.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Task Detail Sidebar ───────────────────────────────────────────────────────

function TaskDetailSidebar({ task, onEdit, onDelete, onComplete, onClose }: {
  task: TaskItem;
  onEdit: (t: TaskItem) => void;
  onDelete: (t: TaskItem) => void;
  onComplete: (t: TaskItem) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--crm-bg-card)", width: "100%", maxWidth: 380, height: "100%",
        borderLeft: "1px solid var(--crm-border)", boxShadow: "-12px 0 40px rgba(0,0,0,0.1)",
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--crm-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Task Details</h3>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", display: "flex" }}>
            <X size={18} style={{ color: "var(--crm-fg-muted)" }} />
          </button>
        </div>
        <div style={{ padding: "20px 24px", flex: 1 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</h4>

          {task.description && (
            <p style={{ fontSize: 13, color: "var(--crm-fg-muted)", marginBottom: 16, lineHeight: 1.5 }}>{task.description}</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row icon={<User size={14} />} label="Assigned To" value={task.assignedTo?.name ?? task.user?.name ?? "—"} />
            <Row icon={<Link2 size={14} />} label="Lead" value={task.lead ? leadName(task.lead) : "—"} />
            <Row icon={<Clock size={14} />} label="Due" value={fmtDateTime(task.dueDate)} accent={isOverdue(task)} />
            <Row icon={<Flag size={14} />} label="Priority" value={PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS] ?? task.priority} />
            <Row icon={<AlertCircle size={14} />} label="Status">
              <StatusBadge task={task} />
            </Row>
            <Row icon={<Calendar size={14} />} label="Created" value={fmtDate(task.createdAt)} />
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--crm-border)", display: "flex", gap: 8 }}>
          <button type="button" className="crm-btn" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => onComplete(task)}>
            <Check size={13} /> {task.status === "COMPLETED" ? "Reopen" : "Complete"}
          </button>
          <button type="button" className="crm-btn" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => onEdit(task)}>
            <Pencil size={13} /> Edit
          </button>
          <button type="button" onClick={() => onDelete(task)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fef2f2", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, accent, children }: { icon: React.ReactNode; label: string; value?: string; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ color: "var(--crm-fg-faint)", marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
        {children ?? <div style={{ fontSize: 13, color: accent ? "#ef4444" : "var(--crm-fg)" }}>{value}</div>}
      </div>
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

type Filters = {
  assignedToId: string;
  status: string;
  priority: string;
  search: string;
};

function FilterBar({ filters, members, onChange }: { filters: Filters; members: OrgMember[]; onChange: (f: Filters) => void }) {
  const selectStyle: React.CSSProperties = {
    padding: "5px 8px", border: "1px solid var(--crm-border)", borderRadius: 6,
    fontSize: 12, color: "var(--crm-fg)", background: "var(--crm-bg-card)",
    cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ position: "relative" }}>
        <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--crm-fg-faint)" }} />
        <input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search tasks…"
          style={{ ...selectStyle, paddingLeft: 26, width: 180 }}
        />
      </div>
      <select value={filters.assignedToId} onChange={(e) => onChange({ ...filters, assignedToId: e.target.value })} style={selectStyle}>
        <option value="">All users</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
      </select>
      <select value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value })} style={selectStyle}>
        <option value="">All statuses</option>
        <option value="PENDING">Pending</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="COMPLETED">Completed</option>
      </select>
      <select value={filters.priority} onChange={(e) => onChange({ ...filters, priority: e.target.value })} style={selectStyle}>
        <option value="">All priorities</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </select>
      {(filters.assignedToId || filters.status || filters.priority || filters.search) && (
        <button type="button" onClick={() => onChange({ assignedToId: "", status: "", priority: "", search: "" })} style={{ ...selectStyle, display: "flex", alignItems: "center", gap: 4, color: "var(--crm-fg-muted)" }}>
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const utils = trpc.useUtils();

  const [view, setView] = useState<"list" | "calendar">("list");
  const [filters, setFilters] = useState<Filters>({ assignedToId: "", status: "", priority: "", search: "" });
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  const { data: tasksData, isLoading } = trpc.tasks.getAll.useQuery({
    limit: 200,
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.status ? { status: filters.status as "PENDING" | "IN_PROGRESS" | "COMPLETED" } : {}),
    ...(filters.priority ? { priority: filters.priority as "LOW" | "MEDIUM" | "HIGH" } : {}),
  });

  const { data: members = [] } = trpc.teams.organizationMembers.useQuery();

  const allTasks = tasksData?.items ?? [];

  const tasks = filters.search
    ? allTasks.filter((t) => {
        const q = filters.search.toLowerCase();
        return t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
      })
    : allTasks;

  const invalidate = useCallback(() => {
    void utils.tasks.getAll.invalidate();
    void utils.tasks.getDueToday.invalidate();
  }, [utils]);

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => { invalidate(); setCreating(false); toast.success("Task created."); },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => { invalidate(); setEditingTask(null); setSelectedTask(null); toast.success("Task updated."); },
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { invalidate(); setDeletingTask(null); setSelectedTask(null); toast.success("Task deleted."); },
    onError: (e) => toast.error(e.message),
  });

  function handleCreate(form: TaskFormData) {
    const dueDate = combineDateAndTime(form.dueDate, form.dueTime);
    createTask.mutate({
      title: form.title.trim(),
      description: form.description || undefined,
      leadId: form.leadId || undefined,
      assignedToId: form.assignedToId || undefined,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      priority: form.priority,
      status: form.status,
    });
  }

  function handleEdit(form: TaskFormData) {
    if (!editingTask) return;
    const dueDate = combineDateAndTime(form.dueDate, form.dueTime);
    updateTask.mutate({
      taskId: editingTask.id,
      title: form.title.trim(),
      description: form.description || undefined,
      leadId: form.leadId || null,
      assignedToId: form.assignedToId || null,
      dueDate: dueDate ? dueDate.toISOString() : null,
      priority: form.priority,
      status: form.status,
    });
  }

  function handleComplete(task: TaskItem) {
    updateTask.mutate({ taskId: task.id, status: task.status !== "COMPLETED" ? "COMPLETED" : "PENDING" });
  }

  const counts = getTaskSummaryCounts(tasks);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
    background: active ? "var(--crm-fg)" : "transparent",
    color: active ? "var(--crm-bg)" : "var(--crm-fg-muted)",
    display: "flex", alignItems: "center", gap: 6,
  });

  return (
    <DashboardLayout>
      <div className="crm-content">
        {/* Header */}
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Tasks</h1>
            <div className="crm-page-sub">
              {counts.pending} pending · {counts.overdue > 0 && <span style={{ color: "#ef4444" }}>{counts.overdue} overdue · </span>}{counts.completed} completed
            </div>
          </div>
          <div className="crm-page-head-actions">
            <button type="button" onClick={() => setCreating(true)} className="crm-btn primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> New Task
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Pending", count: counts.pending, color: "#3b82f6", icon: <Clock size={16} /> },
            { label: "Overdue", count: counts.overdue, color: "#ef4444", icon: <AlertCircle size={16} /> },
            { label: "Completed", count: counts.completed, color: "#22c55e", icon: <Check size={16} /> },
            { label: "Total", count: counts.total, color: "var(--crm-fg-muted)", icon: <List size={16} /> },
          ].map((card) => (
            <div key={card.label} className="crm-card" style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--crm-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</span>
                <span style={{ color: card.color }}>{card.icon}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: card.color, marginTop: 4 }}>{card.count}</div>
            </div>
          ))}
        </div>

        {/* Toolbar: tabs + filters */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, background: "var(--crm-bg-card)", border: "1px solid var(--crm-border)", borderRadius: 8, padding: 3 }}>
            <button type="button" style={tabStyle(view === "list")} onClick={() => setView("list")}>
              <List size={14} /> List
            </button>
            <button type="button" style={tabStyle(view === "calendar")} onClick={() => setView("calendar")}>
              <Calendar size={14} /> Calendar
            </button>
          </div>
          <FilterBar filters={filters} members={members} onChange={setFilters} />
        </div>

        {/* Content */}
        {view === "list" ? (
          <div className="crm-card flush">
            {isLoading ? (
              <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>Loading tasks…</div>
            ) : tasks.length === 0 ? (
              <div style={{ padding: "48px 16px", textAlign: "center" }}>
                <Clock size={32} style={{ color: "var(--crm-fg-faint)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>No tasks found</p>
                <p style={{ fontSize: 13, color: "var(--crm-fg-muted)", margin: 0 }}>Create a task or adjust your filters.</p>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--crm-border)" }}>
                    {["Task", "Assigned To", "Lead", "Due Date/Time", "Status", "Priority", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--crm-fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onEdit={(t) => setEditingTask(t)}
                      onDelete={(t) => setDeletingTask(t)}
                      onComplete={handleComplete}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="crm-card flush" style={{ padding: 16 }}>
            <CalendarView tasks={tasks} onTaskClick={(t) => setSelectedTask(t)} />
          </div>
        )}
      </div>

      {/* Dialogs */}
      {creating && (
        <TaskDialog
          mode="create"
          initial={emptyForm()}
          members={members}
          pending={createTask.isPending}
          onSave={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}

      {editingTask && (
        <TaskDialog
          mode="edit"
          initial={formFromTask(editingTask)}
          members={members}
          pending={updateTask.isPending}
          onSave={handleEdit}
          onClose={() => setEditingTask(null)}
        />
      )}

      {deletingTask && (
        <DeleteConfirm
          taskTitle={deletingTask.title}
          pending={deleteTask.isPending}
          onConfirm={() => deleteTask.mutate({ taskId: deletingTask.id })}
          onClose={() => setDeletingTask(null)}
        />
      )}

      {selectedTask && !editingTask && !deletingTask && (
        <TaskDetailSidebar
          task={selectedTask}
          onEdit={(t) => { setSelectedTask(null); setEditingTask(t); }}
          onDelete={(t) => { setSelectedTask(null); setDeletingTask(t); }}
          onComplete={handleComplete}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </DashboardLayout>
  );
}
