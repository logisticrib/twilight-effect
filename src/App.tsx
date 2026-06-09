import { Shell } from './components/Shell';
import { Library } from './screens/Library';
import { Decks } from './screens/Decks';
import { Play } from './screens/Play';
import { useAppStore } from './store/appStore';

export default function App() {
  const tab = useAppStore(s => s.tab);
  return (
    <Shell>
      {tab === 'library' && <Library />}
      {tab === 'decks'   && <Decks />}
      {tab === 'play'    && <Play />}
    </Shell>
  );
}
