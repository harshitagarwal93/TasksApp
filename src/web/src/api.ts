import type { TaskList, Task } from './types';

const BASE = '/api';

export async function getLists(): Promise<TaskList[]> {
  const res = await fetch(`${BASE}/lists`);
  if (!res.ok) throw new Error('Failed to fetch lists');
  return res.json();
}

export async function createList(name: string): Promise<TaskList> {
  const res = await fetch(`${BASE}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Failed to create list');
  return res.json();
}

export async function deleteList(id: string): Promise<void> {
  const res = await fetch(`${BASE}/lists/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete list');
}

// In-memory ETag cache for /api/tasks (revalidates with If-None-Match -> 304).
let tasksEtag: string | null = null;
let tasksCache: Task[] = [];

export async function getTasks(listId?: string): Promise<Task[]> {
  const url = listId ? `${BASE}/tasks?listId=${encodeURIComponent(listId)}` : `${BASE}/tasks`;
  const headers: Record<string, string> = {};
  if (!listId && tasksEtag) headers['If-None-Match'] = tasksEtag;
  const res = await fetch(url, { headers });
  if (res.status === 304) return tasksCache;
  if (!res.ok) throw new Error('Failed to fetch tasks');
  const data = await res.json();
  if (!listId) {
    tasksEtag = res.headers.get('etag');
    tasksCache = data;
  }
  return data;
}

export async function getArchivedTasks(listId: string): Promise<Task[]> {
  const res = await fetch(`${BASE}/tasks/archived?listId=${encodeURIComponent(listId)}`);
  if (!res.ok) throw new Error('Failed to fetch archived tasks');
  return res.json();
}

export async function createTask(listId: string, text: string): Promise<Task> {
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listId, text })
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export async function updateTask(id: string, listId: string, updates: Partial<Pick<Task, 'isCurrent' | 'isDone' | 'text'>>): Promise<Task> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, listId })
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

export async function moveTask(id: string, fromListId: string, toListId: string): Promise<Task> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromListId, toListId })
  });
  if (!res.ok) throw new Error('Failed to move task');
  return res.json();
}

export async function deleteTask(id: string, listId: string): Promise<void> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(id)}?listId=${encodeURIComponent(listId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete task');
}

export async function reorderTasks(listId: string, taskIds: string[]): Promise<Task[]> {
  const res = await fetch(`${BASE}/tasks/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listId, taskIds })
  });
  if (!res.ok) throw new Error('Failed to reorder tasks');
  return res.json();
}
