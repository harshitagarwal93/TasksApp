export default function Home({ onAdd, onView }: { onAdd: () => void; onView: () => void }) {
  return (
    <div className="home">
      <h1>TaskApp</h1>
      <div className="home-buttons">
        <button className="home-btn" onClick={onAdd}>Add Task</button>
        <button className="home-btn secondary" onClick={onView}>View Tasks</button>
      </div>
    </div>
  );
}
