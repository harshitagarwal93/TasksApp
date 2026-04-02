import { useState } from 'react';
import Home from './pages/Home';
import AddTask from './pages/AddTask';
import ViewTasks from './pages/ViewTasks';

type View = 'home' | 'add' | 'view';

export default function App() {
  const [view, setView] = useState<View>('home');

  switch (view) {
    case 'home':
      return <Home onAdd={() => setView('add')} onView={() => setView('view')} />;
    case 'add':
      return <AddTask onBack={() => setView('home')} />;
    case 'view':
      return <ViewTasks onBack={() => setView('home')} />;
  }
}
