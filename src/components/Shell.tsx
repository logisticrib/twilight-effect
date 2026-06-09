import type { CSSProperties, ReactNode } from 'react';
import { useAppStore, type AppTab } from '../store/appStore';
import { useDeckStore, deckCount } from '../store/deckStore';
import { TBL } from '../tokens';
import { CATALOG } from '../data/catalog';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'decks',   label: 'Decks' },
  { id: 'play',    label: 'Play' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { tab, setTab } = useAppStore();
  const { decks, activeDeckId } = useDeckStore();
  const activeDeck = decks.find(d => d.id === activeDeckId);

  const topbar: CSSProperties = {
    height: 44, flexShrink: 0,
    display: 'flex', alignItems: 'center', padding: '0 14px', gap: 4,
    background: 'linear-gradient(180deg, #1d1810, #14110b)',
    borderBottom: `1px solid ${TBL.matLine2}`,
  };
  const brand: CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11, color: TBL.amber,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    marginRight: 18,
    display: 'flex', alignItems: 'center', gap: 8,
  };
  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '6px 15px', fontSize: 13, fontWeight: 500, borderRadius: 5,
    color: active ? TBL.ink : TBL.ink3,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    background: active ? 'rgba(214,160,80,0.12)' : 'transparent',
    border: `1px solid ${active ? TBL.matLine2 : 'transparent'}`,
    transition: 'all .12s',
    userSelect: 'none',
  });
  const right: CSSProperties = {
    marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center',
  };
  const metaText: CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10, color: TBL.ink3,
    letterSpacing: '0.1em', textTransform: 'uppercase',
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: TBL.mat0, color: TBL.ink, overflow: 'hidden' }}>
      <div style={topbar}>
        <span style={brand}>▣ Twilight <span style={{ color: TBL.ink3, fontSize: 9, letterSpacing: '0.15em' }}>WORKBENCH</span></span>
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <div key={t.id} style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </div>
          ))}
        </div>
        <div style={right}>
          {tab === 'library' && <span style={metaText}>{CATALOG.length} cards</span>}
          {tab === 'decks' && activeDeck && (
            <span style={metaText}>{decks.length} decks · {deckCount(activeDeck)} in "{activeDeck.name}"</span>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
