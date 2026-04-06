import { useState, useEffect, useCallback } from 'react';
import type { TaskList } from '../types';
import * as api from '../api';

function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setOffset(window.innerHeight - vv.height);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return offset;
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
  const kbOffset = useKeyboardOffset();

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
        <button
          className="submit-btn"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={kbOffset > 0 ? { marginTop: 0, marginBottom: 0, position: 'fixed', bottom: kbOffset, left: 0, right: 0, borderRadius: 0, zIndex: 20 } : undefined}
        >
          {submitting ? 'Adding...' : 'Add Task'}
        </button>
      </div>
      {toast && <div className="toast" style={kbOffset > 0 ? { bottom: kbOffset + 60 } : undefined}>{toast}</div>}
    </div>
  );
}
