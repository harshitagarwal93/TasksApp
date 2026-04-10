import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskList } from '../types';
import * as api from '../api';

function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);
  return height;
}

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
    if (!trimmed || !listId || trimmed.length > 500) return;
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

  const canSubmit = text.trim().length > 0 && text.trim().length <= 500 && !!listId && !submitting;
  const vvHeight = useVisualViewportHeight();
  const btnRef = useRef<HTMLButtonElement>(null);

  // When keyboard opens and toast shows, scroll button into view
  useEffect(() => {
    if (toast && btnRef.current) {
      btnRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [toast]);

  return (
    <div className="add-task" style={vvHeight ? { height: vvHeight } : undefined}>
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
            maxLength={500}
            rows={2}
            autoFocus
          />
          <span className={`char-count${text.length > 450 ? ' warn' : ''}`}>{text.length}/500</span>
        </div>
        <div className="field">
          <label htmlFor="task-list">List</label>
          <select id="task-list" value={listId} onChange={e => setListId(e.target.value)}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="submit-area">
          {toast && <div className="toast-inline">{toast}</div>}
          <button
            ref={btnRef}
            className="submit-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
