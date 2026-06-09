import { useState, useMemo, type CSSProperties } from 'react';
import { CardFace } from '../components/CardFace';
import { CATALOG } from '../data/catalog';
import { useDeckStore, deckCount, type Deck } from '../store/deckStore';
import { TBL, CLASSCLR } from '../tokens';
import type { Card } from '../types/card';

const DECK_EXACT = 50;

const ALL_CLASSES = [
  'Warrior','Rogue','Wizard','Sorcerer','Paladin',
  'Druid','Bard','Builder','Doom-Whisperer','Necromancer','Classless',
];
const TYPE_ORDER = ['Companion', 'Action', 'Item', 'Construct'] as const;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } as CSSProperties,

  bar: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
    borderBottom: `1px solid ${TBL.matLine}`, background: 'rgba(0,0,0,0.2)', flexWrap: 'wrap' as const,
  } as CSSProperties,
  lbl: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink3,
    letterSpacing: '0.12em', textTransform: 'uppercase',
  } as CSSProperties,
  select: {
    background: 'rgba(0,0,0,0.4)', color: TBL.ink, border: `1px solid ${TBL.matLine2}`,
    borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: "'Inter', sans-serif",
    outline: 'none', minWidth: 190,
  } as CSSProperties,
  nameInput: {
    background: 'rgba(0,0,0,0.4)', color: TBL.ink, border: `1px solid ${TBL.matLine2}`,
    borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: "'Newsreader', serif",
    outline: 'none', minWidth: 200,
  } as CSSProperties,
  newBtn: {
    padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TBL.matLine2}`,
    color: TBL.ink, fontSize: 12.5, fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' as const,
  } as CSSProperties,
  validity: (ok: boolean): CSSProperties => ({
    marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    color: ok ? TBL.good : TBL.amber2, letterSpacing: '0.06em',
    display: 'flex', alignItems: 'center', gap: 7,
  }),
  vDot: (ok: boolean): CSSProperties => ({
    width: 8, height: 8, borderRadius: '50%', background: ok ? TBL.good : TBL.amber,
  }),

  panes: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 380px' } as CSSProperties,

  // Pool
  pool: { display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: `1px solid ${TBL.matLine}` } as CSSProperties,
  poolBar: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    borderBottom: `1px solid ${TBL.matLine}`, flexWrap: 'wrap' as const,
  } as CSSProperties,
  poolSearch: {
    flex: 1, minWidth: 160, maxWidth: 260, background: 'rgba(0,0,0,0.4)', color: TBL.ink,
    border: `1px solid ${TBL.matLine2}`, borderRadius: 6, padding: '6px 10px', fontSize: 12.5,
    outline: 'none', fontFamily: "'Inter', sans-serif",
  } as CSSProperties,
  pills: { display: 'flex', gap: 4, flexWrap: 'wrap' as const } as CSSProperties,
  pill: (on: boolean, clr?: string): CSSProperties => ({
    fontSize: 10.5, padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", userSelect: 'none',
    background: on ? `${clr ?? TBL.amber}28` : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? (clr ?? TBL.amber) : TBL.matLine2}`,
    color: on ? '#fff' : TBL.ink3,
  }),
  poolGrid: {
    flex: 1, overflowY: 'auto', padding: 14,
    display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start',
  } as CSSProperties,
  poolCard: (hov: boolean): CSSProperties => ({
    position: 'relative', cursor: 'pointer', transition: 'transform .14s',
    transform: hov ? 'translateY(-4px)' : 'none',
    filter: hov ? 'drop-shadow(0 12px 22px rgba(0,0,0,0.5))' : 'none',
  }),
  inDeckBadge: {
    position: 'absolute', top: -6, right: -6, zIndex: 5,
    width: 22, height: 22, borderRadius: 11,
    background: TBL.good, color: '#0c1a10',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid #0c1a10',
  } as CSSProperties,
  addOverlay: (inDeck: boolean, visible: boolean): CSSProperties => ({
    position: 'absolute', inset: 0, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: inDeck ? 'rgba(224,106,106,0.18)' : 'rgba(116,192,138,0.18)',
    color: '#fff', fontSize: 24,
    opacity: visible ? 1 : 0, transition: 'opacity .14s', pointerEvents: 'none',
  }),

  // Deck side
  deck: { display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(0,0,0,0.18)' } as CSSProperties,
  deckHead: { flexShrink: 0, padding: '12px 14px 10px', borderBottom: `1px solid ${TBL.matLine}` } as CSSProperties,
  deckTitle: { fontFamily: "'Newsreader', serif", fontSize: 18, color: TBL.ink, fontWeight: 600 } as CSSProperties,

  // Stats
  statsWrap: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 } as CSSProperties,
  barRow: { display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  barLbl: {
    width: 90, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink3,
    letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'right', flexShrink: 0,
  } as CSSProperties,
  barTrack: { flex: 1, height: 7, background: 'rgba(0,0,0,0.4)', borderRadius: 4, overflow: 'hidden' } as CSSProperties,
  barNum: {
    width: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: TBL.ink2,
    textAlign: 'right', flexShrink: 0,
  } as CSSProperties,
  curveRow: { display: 'flex', alignItems: 'flex-end', gap: 5, height: 42, marginTop: 2 } as CSSProperties,
  curveLblRow: { display: 'flex', gap: 5 } as CSSProperties,
  curveLbl: {
    flex: 1, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9, color: TBL.ink3, lineHeight: 1.4,
  } as CSSProperties,
  typeLine: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: TBL.ink3,
    letterSpacing: '0.06em', marginTop: 4,
  } as CSSProperties,

  // List
  list: {
    flex: 1, overflowY: 'auto', padding: '6px 12px 12px',
    display: 'flex', flexDirection: 'column', gap: 3,
  } as CSSProperties,
  groupLbl: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.amber2,
    letterSpacing: '0.14em', textTransform: 'uppercase', margin: '10px 0 4px',
    display: 'flex', gap: 8, alignItems: 'center',
  } as CSSProperties,
  groupLine: { flex: 1, height: 1, background: TBL.matLine } as CSSProperties,
  entry: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6,
    background: 'rgba(255,255,255,0.025)', border: `1px solid ${TBL.matLine}`,
  } as CSSProperties,
  entryTag: (clr: string): CSSProperties => ({ width: 3, height: 24, borderRadius: 2, background: clr, flexShrink: 0 }),
  entryLvl: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: TBL.ink3, flexShrink: 0 } as CSSProperties,
  entryName: {
    flex: 1, minWidth: 0, fontSize: 12.5, color: TBL.ink,
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    fontFamily: "'Inter', sans-serif",
  } as CSSProperties,
  removeBtn: {
    width: 24, height: 24, borderRadius: 5, cursor: 'pointer',
    border: `1px solid ${TBL.matLine2}`, background: 'rgba(224,106,106,0.1)',
    color: TBL.danger, fontSize: 14, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  } as CSSProperties,
  emptyDeck: {
    padding: 30, textAlign: 'center', color: TBL.ink3, fontSize: 13,
    lineHeight: 1.7, fontFamily: "'Newsreader', serif",
  } as CSSProperties,
};

// ─── Deck stats panel ─────────────────────────────────────────────────────────
function DeckStats({ deck }: { deck: Deck }) {
  const total = deckCount(deck);
  if (total === 0) return null;

  const cardIds = Object.keys(deck.cards);
  const cards = cardIds.map(id => CATALOG.find(c => c.id === id)).filter(Boolean) as Card[];

  // Class balance
  const byClass: Record<string, number> = {};
  cards.forEach(c => { byClass[c.class1] = (byClass[c.class1] ?? 0) + 1; });
  const classRows = Object.entries(byClass).sort((a, b) => b[1] - a[1]);

  // Level curve 1–5
  const curve = [0, 0, 0, 0, 0];
  cards.forEach(c => { if (c.level >= 1 && c.level <= 5) curve[c.level - 1]++; });
  const maxCurve = Math.max(1, ...curve);

  // Type breakdown
  const byType: Record<string, number> = {};
  cards.forEach(c => { byType[c.type] = (byType[c.type] ?? 0) + 1; });

  return (
    <div style={s.statsWrap}>
      <span style={s.lbl}>Class balance</span>
      {classRows.map(([cls, n]) => (
        <div key={cls} style={s.barRow}>
          <span style={s.barLbl}>{cls}</span>
          <div style={s.barTrack}>
            <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: CLASSCLR[cls] ?? TBL.ink3 }} />
          </div>
          <span style={s.barNum}>{n}</span>
        </div>
      ))}

      <span style={{ ...s.lbl, marginTop: 4 }}>Level curve</span>
      <div style={s.curveRow}>
        {curve.map((n, i) => (
          <div key={i} style={{
            flex: 1, height: `${Math.max(6, (n / maxCurve) * 100)}%`,
            background: TBL.amber, borderRadius: '3px 3px 0 0', minHeight: 3,
          }} />
        ))}
      </div>
      <div style={s.curveLblRow}>
        {curve.map((n, i) => (
          <div key={i} style={s.curveLbl}>L{i + 1}<br />{n}</div>
        ))}
      </div>

      <div style={s.typeLine}>
        {Object.entries(byType).map(([t, n]) => `${t} ${n}`).join('  ·  ')}
      </div>
    </div>
  );
}

// ─── Decks screen ─────────────────────────────────────────────────────────────
export function Decks() {
  const { decks, activeDeckId, setActiveDeck, newDeck, renameDeck, toggleCard, removeCard } = useDeckStore();
  const deck = decks.find(d => d.id === activeDeckId) ?? decks[0];

  const [search,    setSearch]    = useState('');
  const [clsFilter, setClsFilter] = useState<string | null>(null);
  const [hovered,   setHovered]   = useState<string | null>(null);

  const pool = useMemo(() => {
    return CATALOG.filter(c => {
      if (clsFilter && c.class1 !== clsFilter && c.class2 !== clsFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(c.name.toLowerCase().includes(q) || c.text.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [search, clsFilter]);

  const total = deck ? deckCount(deck) : 0;
  const ok    = total === DECK_EXACT;
  const diff  = DECK_EXACT - total;

  // Group deck cards by type
  const grouped = useMemo(() => {
    if (!deck) return {} as Record<string, Card[]>;
    const g: Record<string, Card[]> = {};
    Object.keys(deck.cards).forEach(id => {
      const c = CATALOG.find(x => x.id === id);
      if (!c) return;
      (g[c.type] ??= []).push(c);
    });
    // sort each group by level then name
    Object.values(g).forEach(arr => arr.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)));
    return g;
  }, [deck]);

  if (!deck) return null;

  return (
    <div style={s.root}>
      {/* Top bar */}
      <div style={s.bar}>
        <span style={s.lbl}>Deck</span>
        <select style={s.select} value={activeDeckId}
          onChange={e => setActiveDeck(e.target.value)}>
          {decks.map(d => (
            <option key={d.id} value={d.id}>{d.name} ({deckCount(d)})</option>
          ))}
        </select>
        <input
          style={s.nameInput}
          value={deck.name}
          onChange={e => renameDeck(deck.id, e.target.value)}
        />
        <div style={s.newBtn} onClick={newDeck}>＋ New deck</div>
        <div style={s.validity(ok)}>
          <span style={s.vDot(ok)} />
          {total} / {DECK_EXACT}
          {ok ? ' · legal' : diff > 0 ? ` · need ${diff} more` : ` · ${-diff} over`}
        </div>
      </div>

      <div style={s.panes}>
        {/* Pool */}
        <div style={s.pool}>
          <div style={s.poolBar}>
            <input
              style={s.poolSearch}
              placeholder="Search library…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div style={s.pills}>
              <div style={s.pill(clsFilter === null)} onClick={() => setClsFilter(null)}>All</div>
              {ALL_CLASSES.map(cls => (
                <div key={cls}
                  style={s.pill(clsFilter === cls, CLASSCLR[cls])}
                  onClick={() => setClsFilter(clsFilter === cls ? null : cls)}>
                  {cls}
                </div>
              ))}
            </div>
          </div>
          <div style={s.poolGrid}>
            {pool.map(card => {
              const inDeck = !!deck.cards[card.id];
              const isHov  = hovered === card.id;
              return (
                <div key={card.id}
                  style={s.poolCard(isHov)}
                  onMouseEnter={() => setHovered(card.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => toggleCard(deck.id, card.id)}>
                  {inDeck && <div style={s.inDeckBadge}>✓</div>}
                  <CardFace data={card} scale={0.6} hoverable scrollText />
                  <div style={s.addOverlay(inDeck, isHov)}>
                    {inDeck ? '−' : '＋'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deck panel */}
        <div style={s.deck}>
          <div style={s.deckHead}>
            <div style={s.deckTitle}>{deck.name}</div>
            <DeckStats deck={deck} />
          </div>
          <div style={s.list}>
            {total === 0 && (
              <div style={s.emptyDeck}>
                This deck is empty.<br />
                Click cards in the pool to add them.
              </div>
            )}
            {TYPE_ORDER.filter(t => grouped[t]?.length).map(type => (
              <div key={type}>
                <div style={s.groupLbl}>
                  {type}
                  <div style={s.groupLine} />
                  {grouped[type].length}
                </div>
                {grouped[type].map(card => (
                  <div key={card.id} style={s.entry}>
                    <div style={s.entryTag(CLASSCLR[card.class1] ?? TBL.ink3)} />
                    <span style={s.entryLvl}>L{card.level}</span>
                    <span style={s.entryName}>{card.name}</span>
                    <div style={s.removeBtn} title="Remove"
                      onClick={() => removeCard(deck.id, card.id)}>−</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
