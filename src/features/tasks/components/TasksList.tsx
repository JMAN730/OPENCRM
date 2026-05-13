"use client";

import { trpc } from "@/app/_trpc/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MoreHorizontal, 
  Trash2, 
  Users 
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function TasksList() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.tasks.getAll.useQuery({ limit: 100 });
  const tasks = data?.items;
  
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });

  const toggleTask = (taskId: string, completed: boolean) => {
    updateTask.mutate({ taskId, completed });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading tasks...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-dashed border-border rounded-xl bg-card">
        <Clock size={36} className="text-muted-foreground/20" />
        <div>
          <p className="text-sm font-medium">No tasks yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a task to start tracking your follow-ups.</p>
        </div>
      </div>
    );
  }

  const isOverdue = (date: Date | string) => {
    return new Date(date) < new Date() && new Date(date).toDateString() !== new Date().toDateString();
  };

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div 
          key={task.id} 
          className={`flex items-center justify-between p-4 rounded-lg border border-border bg-card transition-opacity ${task.completed ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-4">
            <Checkbox 
              checked={task.completed} 
              onCheckedChange={(checked) => toggleTask(task.id, !!checked)}
            />
            <div className="space-y-1">
              <p className={`font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {task.dueDate && (
                  <span className={`flex items-center gap-1 ${!task.completed && isOverdue(task.dueDate) ? "text-destructive" : ""}`}>
                    <CalendarIcon size={12} />
                    {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )}
                {task.lead && (
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {task.lead.company || `${task.lead.firstName} ${task.lead.lastName}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {task.completed ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                Completed
              </Badge>
            ) : task.dueDate && isOverdue(task.dueDate) ? (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                Overdue
              </Badge>
            ) : null}
            
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                <MoreHorizontal size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2 cursor-pointer">
                  Edit Task
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer text-destructive">
                  <Trash2 size={14} />
                  Delete Task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
