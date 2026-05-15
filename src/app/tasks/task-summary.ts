import { isPast, isToday } from "date-fns";

export type TaskSummaryInput = {
  completed: boolean;
  dueDate: Date | string | null | undefined;
};

export type TaskSummaryCounts = {
  pending: number;
  overdue: number;
  completed: number;
  total: number;
};

export function isTaskOverdue(task: TaskSummaryInput) {
  if (task.completed || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  return isPast(due) && !isToday(due);
}

export function getTaskSummaryCounts(tasks: TaskSummaryInput[]): TaskSummaryCounts {
  return tasks.reduce<TaskSummaryCounts>(
    (counts, task) => {
      counts.total += 1;

      if (task.completed) {
        counts.completed += 1;
      } else if (isTaskOverdue(task)) {
        counts.overdue += 1;
      } else {
        counts.pending += 1;
      }

      return counts;
    },
    { pending: 0, overdue: 0, completed: 0, total: 0 },
  );
}
