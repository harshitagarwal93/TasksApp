import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskList, Task } from '../types';
import * as api from '../api';

export default function ViewTasks({ onBack }: { onBack: () => void }) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newListName, setNewListName] = useState('');
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [movingTask, setMovingTask] = useState<Task | null>(null);
  const prevTasks = useRef<Task[]>([]);

  const load = useCallback(async () => {
    try {
      const [l, t] = await Promise.all([api.getLists(), api.getTasks()]);
      setLists(l);
      setTasks(t);
    } catch {
      try {
        const l = await api.getLists();
        setLists(l);
      } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentTasks = tasks.filter(t => t.isCurrent);

  const optimisticUpdate = (taskId: string, changes: Partial<Task>, apiCall: () => Promise<unknown>) => {
    prevTasks.current = tasks;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...changes } : t));
    apiCall().catch(() => setTasks(prevTasks.current));
  };

  const handleToggleCurrent = (task: Task) => {
    optimisticUpdate(task.id, { isCurrent: !task.isCurrent }, () =>
      api.updateTask(task.id, task.listId, { isCurrent: !task.isCurrent })
    );
  };

  const handleMarkDone = (task: Task) => {
    optimisticUpdate(task.id, { isDone: true, isCurrent: false, completedAt: new Date().toISOString() }, () =>
      api.updateTask(task.id, task.listId, { isDone: true, isCurrent: false })
    );
  };

  const handleReopen = (task: Task) => {
    optimisticUpdate(task.id, { isDone: false, completedAt: undefined }, () =>
      api.updateTask(task.id, task.listId, { isDone: false })
    );
  };

  const handleMoveTask = async (task: Task, newListId: string) => {
    setMovingTask(null);
    if (newListId === task.listId) return;
    prevTasks.current = tasks;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, listId: newListId } : t));
    try {
      await api.moveTask(task.id, task.listId, newListId);
    } catch {
      setTasks(prevTasks.current);
    }
  };

  const handleAddList = async () => {
    const name = newListName.trim();
    if (!name) return;
    await api.createList(name);
    setNewListName('');
    load();
  };

  const handleDeleteList = async (id: string) => {
    await api.deleteList(id);
    load();
  };

  const toggleDone = (listId: string) => {
    setExpandedDone(prev => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId); else next.add(listId);
      return next;
    });
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="view-tasks">
      <header className="header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>Tasks</h1>
      </header>

      {currentTasks.length > 0 && (
        <div className="current-banner">
          <span className="current-label">Working on ({currentTasks.length})</span>
          <div className="current-items">
            {currentTasks.map(t => (
              <div key={t.id} className="current-item">
                <span className="current-text">{t.text}</span>
                <button className="unmark-btn" onClick={() => handleToggleCurrent(t)}>✕</button>
                <button className="done-btn" onClick={() => handleMarkDone(t)}>✓ Done</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="add-list-row">
        <input
          type="text"
          placeholder="New list name..."
          value={newListName}
          onChange={e => setNewListName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddList()}
          maxLength={30}
        />
        <button onClick={handleAddList} disabled={!newListName.trim()}>+ List</button>
      </div>

      {movingTask && (
        <div className="move-overlay" onClick={() => setMovingTask(null)}>
          <div className="move-dialog" onClick={e => e.stopPropagation()}>
            <h3>Move to list</h3>
            <p className="move-task-text">{movingTask.text}</p>
            {lists.map(l => (
              <button
                key={l.id}
                className={`move-option${l.id === movingTask.listId ? ' current-list' : ''}`}
                onClick={() => handleMoveTask(movingTask, l.id)}
                disabled={l.id === movingTask.listId}
              >
                {l.name}{l.id === movingTask.listId ? ' (current)' : ''}
              </button>
            ))}
            <button className="move-cancel" onClick={() => setMovingTask(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="lists-grid">
        {lists.map(list => {
          const active = tasks.filter(t => t.listId === list.id && !t.isDone);
          const done = tasks.filter(t => t.listId === list.id && t.isDone);
          const isDoneExpanded = expandedDone.has(list.id);

          return (
            <div key={list.id} className="list-card">
              <h2>
                {list.name}
                <button className="delete-list-btn" onClick={() => handleDeleteList(list.id)} aria-label={`Delete ${list.name}`}>✕</button>
              </h2>
              {active.length === 0 && <p className="empty">No active tasks</p>}
              {active.map(task => (
                <div
                  key={task.id}
                  className={`task-row${task.isCurrent ? ' current' : ''}`}
                  onClick={() => handleToggleCurrent(task)}
                >
                  <span className="task-indicator">{task.isCurrent ? '●' : '○'}</span>
                  <span className="task-text">{task.text}</span>
                  <button className="move-btn" onClick={e => { e.stopPropagation(); setMovingTask(task); }} aria-label="Move task">⇄</button>
                  {task.isCurrent && (
                    <button className="done-btn-sm" onClick={e => { e.stopPropagation(); handleMarkDone(task); }}>✓</button>
                  )}
                </div>
              ))}
              {done.length > 0 && (
                <div className="done-section">
                  <button className="done-toggle" onClick={() => toggleDone(list.id)}>
                    {isDoneExpanded ? '▾' : '▸'} Completed ({done.length})
                  </button>
                  {isDoneExpanded && done.map(task => (
                    <div key={task.id} className="task-row done">
                      <span className="task-indicator">✓</span>
                      <span className="task-text">{task.text}</span>
                      <button className="move-btn" onClick={() => setMovingTask(task)} aria-label="Move task">⇄</button>
                      <button className="reopen-btn" onClick={() => handleReopen(task)}>↩</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
