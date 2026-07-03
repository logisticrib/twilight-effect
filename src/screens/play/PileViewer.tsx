import { useState, useMemo, useEffect, type CSSProperties } from 'react';
import { CardFace } from '../../components/CardFace';
import { TBL, Z } from '../../tokens';
import { useGameStore, seatName } from '../../store/gameStore';

const CARD_SCALE = 0.62;

export function PileViewer() {
  const { pileView, game, closePile, localPlayer } = useGameStore();
  const [search, setSearch] = useState('');

  const player = pileView ? game[pileView.player] : null;
  const cards = player?.dead ?? [];

  // Reset the query each time a pile is opened
  useEffect(() => { if (pileView) setSearch(''); }, [pileView?.player, pileView?.zone]);
  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    if (!q) return cards;
    return cards.filter(c =>
      `${c.name} ${c.text} ${c.subtype} ${c.keywords.join(' ')}`.toLowerCase().includes(q)
    );
  }, [q, cards]);

  if (!pileView || !player) return null;

  return (
    <div
      onClick={closePile}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.pileView,
        background: 'rgba(8,6,4,0.86)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 28,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1100px, 94vw)', height: 'min(760px, 90vh)',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(28,22,14,0.98), rgba(18,14,9,0.98))',
          border: `1px solid ${TBL.matLine2}`, borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 20px', borderBottom: `1px solid ${TBL.matLine}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink3, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Dead Zone
            </div>
            <div style={{ fontFamily: "'Newsreader', serif", fontSize: 22, fontWeight: 600, color: TBL.ink, lineHeight: 1.1 }}>
              {seatName(pileView.player, localPlayer)}
            </div>
          </div>

          {/* Search */}
          <div style={{ flex: 1, position: 'relative', maxWidth: 460, marginLeft: 'auto' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TBL.ink3, fontSize: 13, pointerEvents: 'none' }}>⌕</span>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, text, subtype, keywords…"
              style={{
                width: '100%', padding: '8px 12px 8px 34px',
                background: TBL.mat2, border: `1px solid ${TBL.matLine2}`,
                borderRadius: 8, color: TBL.ink,
                fontFamily: "'Inter', sans-serif", fontSize: 13, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink3, letterSpacing: '0.1em', flexShrink: 0 }}>
            {filtered.length} / {cards.length}
          </span>

          {/* Close */}
          <button onClick={closePile} style={closeBtn}>✕</button>
        </div>

        {/* Grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 20,
          display: 'flex', flexWrap: 'wrap', gap: 14, alignContent: 'flex-start',
          justifyContent: filtered.length ? 'flex-start' : 'center',
        }}>
          {filtered.map((card, i) => (
            <CardFace key={`${card.id}-${i}`} data={card} scale={CARD_SCALE} />
          ))}
          {cards.length === 0 && (
            <div style={emptyMsg}>The Dead Zone is empty.</div>
          )}
          {cards.length > 0 && filtered.length === 0 && (
            <div style={emptyMsg}>No cards match “{search}”.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const closeBtn: CSSProperties = {
  flexShrink: 0, width: 32, height: 32, borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${TBL.matLine}`,
  color: TBL.ink2, fontSize: 14, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const emptyMsg: CSSProperties = {
  alignSelf: 'center', margin: 'auto',
  fontFamily: "'Inter', sans-serif", fontSize: 14, color: TBL.ink3,
};
