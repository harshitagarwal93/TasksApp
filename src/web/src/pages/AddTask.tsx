import { useState, useEffect, useCallback } from 'react';
import type { TaskList } from '../types';
import * as api from '../api';

export default function AddTask({ onBack }: { onBack: () => void }) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [listId, setListId] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  const loadLists = useCallback(async () => {
    const data = await api.getLists();
    setLists(data);
    if (data.length > 0 && !listId) setListId(data[0].id);
  }, [listId]);

  useEffect(() => { loadLists(); }, [loadLists]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || !listId || trimmed.length > 100) return;
    setSubmitting(true);
    try {
      await api.createTask(listId, trimmed);
      setText('');
      setToast('Task added!');
      setTimeout(() => setToast(''), 2000);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = text.trim().length > 0 && text.trim().length <= 100 && !!listId && !submitting;

  return (
    <div className="add-task">
      <header className="header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>Add Task</h1>
      </header>
      <div className="add-form">
        <div className="field">
          <label htmlFor="task-text">What do you need to do?</label>
          <textarea
            id="task-text"
            placeholder="Enter your task..."
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={100}
            rows={2}
            autoFocus
          />
          <span className={`char-count${text.length > 90 ? ' warn' : ''}`}>{text.length}/100</span>
        </div>
        <div className="field">
          <label htmlFor="task-list">List</label>
          <select id="task-list" value={listId} onChange={e => setListId(e.target.value)}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <button className="submit-btn" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? 'Adding...' : 'Add Task'}
        </button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
