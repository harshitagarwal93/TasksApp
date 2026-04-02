export interface TaskList {
  id: string;
  name: string;
  createdAt: string;
}

export interface Task {
  id: string;
  listId: string;
  text: string;
  isCurrent: boolean;
  isDone: boolean;
  createdAt: string;
  completedAt?: string;
}
