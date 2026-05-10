"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { trpc } from "@/app/_trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";

type Task = inferRouterOutputs<AppRouter>["tasks"]["getAll"][number];

const COLS = [
  {
    key: "today", label: "Today",
    filter: (d?: string | null) => d ? new Date(d).toDateString() === new Date().toDateString() : false,
    dueOffset: 0,
  },
  {
    key: "week", label: "This week",
    filter: (d?: string | null) => {
      if (!d) return false;
      const t = new Date(d); const now = new Date(); const end = new Date(now);
      end.setDate(now.getDate() + 7);
      return t > now && t <= end;
    },
    dueOffset: 3,
  },
  {
    key: "later", label: "Later",
    filter: (d?: string | null) => {
      if (!d) return true;
      const t = new Date(d); const end = new Date();
      end.setDate(end.getDate() + 7);
      return t > end;
    },
    dueOffset: 14,
  },
] as const;

function fmt(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TasksPage() {
  const utils = trpc.useUtils();
  const { data: tasksRaw } = trpc.tasks.getAll.useQuery();
  const tasks: Task[] = tasksRaw ?? [];
  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const updateTask = trpc.tasks.update.useMutation({ onSuccess: () => utils.tasks.getAll.invalidate() });
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.getAll.invalidate();
      setAdding(null);
      setNewTitle("");
      toast.success("Task created");
    },
    onError: (e) => toast.error(e.message),
  });

  const pending = tasks.filter((t: Task) => !t.completed);
  const completed = tasks.filter((t: Task) => t.completed);
  const colTasks = COLS.map((col) => ({
    ...col,
    tasks: pending.filter((t: Task) => col.filter(t.dueDate ? String(t.dueDate) : null)),
  }));

  const submitNew = (e: React.FormEvent, dueOffset: number) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const due = new Date();
    due.setDate(due.getDate() + dueOffset);
    createTask.mutate({ title: newTitle.trim(), dueDate: due.toISOString() });
  };

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Tasks</h1>
            <div className="crm-page-sub">Your work, organised · {pending.length} pending</div>
          </div>
          <div className="crm-page-head-actions">
            <button className="crm-btn primary" onClick={() => { setAdding("today"); setNewTitle(""); }}>
              <Plus size={13} /> New task
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {colTasks.map((col) => (
            <div key={col.key} className="crm-card flush">
              <div className="crm-card-head">
                <h3>{col.label}</h3>
                <span className="crm-sub">· {col.tasks.length}</span>
              </div>
              <div className="crm-tasks">
                {col.tasks.map((t: Task) => (
                  <div
                    key={t.id}
                    className="crm-task"
                    data-done={t.completed}
                    onClick={() => updateTask.mutate({ taskId: t.id, completed: !t.completed })}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="crm-check">
                      {t.completed && <Check size={11} strokeWidth={2.4} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="crm-task-label">{t.title}</div>
                      {t.description && (
                        <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.description}
                        </div>
                      )}
                    </div>
                    {t.dueDate && <div className="crm-task-meta">{fmt(t.dueDate)}</div>}
                  </div>
                ))}

                {adding === col.key ? (
                  <form
                    onSubmit={(e) => submitNew(e, col.dueOffset)}
                    style={{ padding: "8px 14px 10px", borderTop: col.tasks.length ? "1px solid var(--crm-border)" : "none" }}
                  >
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Task title…"
                      onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
                      style={{
                        width: "100%", border: "none", outline: "none", background: "transparent",
                        fontSize: 13, color: "var(--crm-fg)", fontFamily: "var(--crm-font-sans)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button type="submit" className="crm-btn primary" style={{ height: 26, padding: "0 10px", fontSize: 12 }}>Add</button>
                      <button type="button" className="crm-btn" style={{ height: 26, padding: "0 10px", fontSize: 12 }} onClick={() => setAdding(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => { setAdding(col.key); setNewTitle(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%",
                      padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
                      fontSize: 13, color: "var(--crm-fg-faint)", fontFamily: "var(--crm-font-sans)",
                      borderTop: col.tasks.length ? "1px solid var(--crm-border)" : "none",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--crm-fg-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--crm-fg-faint)")}
                  >
                    <Plus size={13} /> Add task
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {completed.length > 0 && (
          <div className="crm-card flush" style={{ marginTop: 8 }}>
            <div className="crm-card-head">
              <h3 style={{ color: "var(--crm-fg-muted)" }}>Completed</h3>
              <span className="crm-sub">· {completed.length}</span>
            </div>
            <div className="crm-tasks">
              {completed.slice(0, 6).map((t: Task) => (
                <div
                  key={t.id}
                  className="crm-task"
                  data-done={true}
                  onClick={() => updateTask.mutate({ taskId: t.id, completed: false })}
                  style={{ cursor: "pointer" }}
                >
                  <div className="crm-check"><Check size={11} strokeWidth={2.4} /></div>
                  <div className="crm-task-label">{t.title}</div>
                  {t.dueDate && <div className="crm-task-meta">{fmt(t.dueDate)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
