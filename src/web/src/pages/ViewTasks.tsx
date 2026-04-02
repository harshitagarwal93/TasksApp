import { useState, useEffect, useCallback } from 'react';
import type { TaskList, Task } from '../types';
import * as api from '../api';

export default function ViewTasks({ onBack }: { onBack: () => void }) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newListName, setNewListName] = useState('');
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [l, t] = await Promise.all([api.getLists(), api.getTasks()]);
    setLists(l);
    setTasks(t);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentTask = tasks.find(t => t.isCurrent);

  const handleSetCurrent = async (task: Task) => {
    if (task.isCurrent) return;
    await api.updateTask(task.id, task.listId, { isCurrent: true });
    load();
  };

  const handleMarkDone = async (task: Task) => {
    await api.updateTask(task.id, task.listId, { isDone: true, isCurrent: false });
    load();
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

      {currentTask && (
        <div className="current-banner">
          <span className="current-label">Working on</span>
          <span className="current-text">{currentTask.text}</span>
          <button className="done-btn" onClick={() => handleMarkDone(currentTask)}>✓ Done</button>
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
                  onClick={() => handleSetCurrent(task)}
                >
                  <span className="task-indicator">{task.isCurrent ? '●' : '○'}</span>
                  <span className="task-text">{task.text}</span>
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
