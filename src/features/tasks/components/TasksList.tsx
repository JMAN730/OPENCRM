"use client";

import { useState } from "react";
import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import { Calendar as CalendarIcon, Clock, Flag, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AppRouter } from "@/server/api/root";
import { toast } from "sonner";

type TaskListItem = inferRouterOutputs<AppRouter>["tasks"]["getAll"]["items"][number];

const PRIORITY_LABELS = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;
const STATUS_LABELS = { PENDING: "Pending", IN_PROGRESS: "In Progress", COMPLETED: "Completed" } as const;

type EditTaskDialogProps = {
  onClose: () => void;
  onSave: (input: { taskId: string; title: string; dueDate?: string; priority?: "LOW" | "MEDIUM" | "HIGH"; status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" }) => void;
  pending: boolean;
  task: TaskListItem;
};

function toDateInputValue(date: Date | string | null | undefined) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function EditTaskDialog({ onClose, onSave, pending, task }: EditTaskDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">((task.priority as "LOW" | "MEDIUM" | "HIGH") ?? "MEDIUM");
  const [status, setStatus] = useState<"PENDING" | "IN_PROGRESS" | "COMPLETED">((task.status as "PENDING" | "IN_PROGRESS" | "COMPLETED") ?? "PENDING");

  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Task title is required.");
      return;
    }
    let parsedDueDate: string | undefined;
    if (dueDate) {
      const [y, m, d] = dueDate.split("-").map(Number);
      parsedDueDate = new Date(y, m - 1, d).toISOString();
    }
    onSave({ taskId: task.id, title: trimmedTitle, dueDate: parsedDueDate, priority, status });
  };

  const selectStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid hsl(var(--border))",
    borderRadius: 6, fontSize: 14, background: "hsl(var(--background))",
    color: "hsl(var(--foreground))", outline: "none",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>Update the task details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1" htmlFor="task-title">
            <span className="text-sm font-medium">Title</span>
            <Input
              autoFocus
              disabled={pending}
              id="task-title"
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>

          <label className="block space-y-1" htmlFor="task-due-date">
            <span className="text-sm font-medium">Due date</span>
            <Input
              disabled={pending}
              id="task-due-date"
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </label>

          <label className="block space-y-1" htmlFor="task-priority">
            <span className="text-sm font-medium">Priority</span>
            <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH")} disabled={pending} style={selectStyle}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>

          <label className="block space-y-1" htmlFor="task-status">
            <span className="text-sm font-medium">Status</span>
            <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as "PENDING" | "IN_PROGRESS" | "COMPLETED")} disabled={pending} style={selectStyle}>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </label>
        </div>

        <DialogFooter>
          <Button disabled={pending} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={pending} onClick={handleSubmit}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TasksList() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.tasks.getAll.useQuery({ limit: 100 });
  const tasks = data?.items ?? [];
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      void utils.tasks.getAll.invalidate();
      setEditingTask(null);
      toast.success("Task updated.");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      void utils.tasks.getAll.invalidate();
      toast.success("Task deleted.");
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const toggleTask = (taskId: string, completed: boolean) => {
    updateTask.mutate({ taskId, status: completed ? "COMPLETED" : "PENDING" });
  };

  const saveTaskChanges = (input: { taskId: string; title: string; dueDate?: string; priority?: "LOW" | "MEDIUM" | "HIGH"; status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" }) => {
    updateTask.mutate(input);
  };

  const handleDelete = (taskId: string) => {
    deleteTask.mutate({ taskId });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading tasks...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card py-20 text-center">
        <Clock size={36} className="text-muted-foreground/20" />
        <div>
          <p className="text-sm font-medium">No tasks yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a task to start tracking your follow-ups.</p>
        </div>
      </div>
    );
  }

  const isOverdue = (date: Date | string) => {
    const dueDate = new Date(date);
    const now = new Date();
    return dueDate < now && dueDate.toDateString() !== now.toDateString();
  };

  return (
    <>
      <div className="space-y-4">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-opacity ${task.status === "COMPLETED" ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-4">
              <Checkbox
                checked={task.status === "COMPLETED"}
                onCheckedChange={(checked) => toggleTask(task.id, !!checked)}
              />
              <div className="space-y-1">
                <p className={`font-medium ${task.status === "COMPLETED" ? "line-through text-muted-foreground" : ""}`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {task.dueDate && (
                    <span className={`flex items-center gap-1 ${task.status !== "COMPLETED" && isOverdue(task.dueDate) ? "text-destructive" : ""}`}>
                      <CalendarIcon size={12} />
                      {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {task.lead && task.lead.id ? (
                    <Link
                      href={`/leads?leadId=${task.lead.id}`}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <Users size={12} />
                      {task.lead.company || `${task.lead.firstName} ${task.lead.lastName}`}
                    </Link>
                  ) : null}
                  {task.assignedTo && (
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {task.assignedTo.name}
                    </span>
                  )}
                  {task.priority && task.priority !== "MEDIUM" && (
                    <span className="flex items-center gap-1">
                      <Flag size={12} />
                      {PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {task.status === "COMPLETED" ? (
                <Badge variant="outline" className="border-green-500/20 bg-green-500/10 text-green-500">
                  Completed
                </Badge>
              ) : task.dueDate && isOverdue(task.dueDate) ? (
                <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                  Overdue
                </Badge>
              ) : task.status ? (
                <Badge variant="outline">
                  {STATUS_LABELS[task.status as keyof typeof STATUS_LABELS] ?? task.status}
                </Badge>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button aria-label={`Open actions for ${task.title}`} variant="ghost" size="icon" className="h-8 w-8" />}
                >
                  <MoreHorizontal size={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setEditingTask(task)}>
                    <Pencil size={14} />
                    Edit task
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2"
                    onClick={() => handleDelete(task.id)}
                    variant="destructive"
                  >
                    <Trash2 size={14} />
                    Delete task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      {editingTask ? (
        <EditTaskDialog
          onClose={() => setEditingTask(null)}
          onSave={saveTaskChanges}
          pending={updateTask.isPending}
          task={editingTask}
        />
      ) : null}
    </>
  );
}
