import { useState, useMemo, useCallback, type CSSProperties } from 'react';
import { CardFace } from '../components/CardFace';
import { CATALOG } from '../data/catalog';
import { KEYWORD_DEFS } from '../data/keywords';
import { TBL, CLASSCLR } from '../tokens';
import type { Card } from '../types/card';

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_CLASSES = [
  'Warrior','Rogue','Wizard','Sorcerer','Paladin',
  'Druid','Bard','Builder','Doom-Whisperer','Necromancer','Classless',
];
const ALL_TYPES = ['Companion', 'Item', 'Construct', 'Action'] as const;
const ALL_LEVELS = [1, 2, 3, 4, 5] as const;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: {
    display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden',
  } as CSSProperties,

  // Sidebar
  sidebar: {
    width: 196, flexShrink: 0,
    background: TBL.mat1,
    borderRight: `1px solid ${TBL.matLine}`,
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto', padding: '12px 0',
  } as CSSProperties,
  sideSection: {
    padding: '0 12px 14px',
    borderBottom: `1px solid ${TBL.matLine}`,
    marginBottom: 14,
  } as CSSProperties,
  sideLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: TBL.ink3, marginBottom: 8, display: 'block',
  } as CSSProperties,
  clearBtn: {
    width: '100%', padding: '5px 0', borderRadius: 5,
    border: `1px solid ${TBL.matLine2}`,
    background: 'rgba(214,160,80,0.08)',
    color: TBL.amber, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
    marginTop: 4,
  } as CSSProperties,

  // Main area
  main: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  } as CSSProperties,
  toolbar: {
    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
    borderBottom: `1px solid ${TBL.matLine}`,
    background: TBL.mat1, flexShrink: 0,
  } as CSSProperties,
  searchWrap: {
    flex: 1, position: 'relative',
  } as CSSProperties,
  searchInput: {
    width: '100%', padding: '7px 12px 7px 34px',
    background: TBL.mat2, border: `1px solid ${TBL.matLine2}`,
    borderRadius: 7, color: TBL.ink,
    fontFamily: "'Inter', sans-serif", fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  } as CSSProperties,
  searchIcon: {
    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
    color: TBL.ink3, fontSize: 13, pointerEvents: 'none',
  } as CSSProperties,
  countBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10, color: TBL.ink3, letterSpacing: '0.1em',
    flexShrink: 0,
  } as CSSProperties,
  grid: {
    flex: 1, overflowY: 'auto', padding: 20,
    display: 'flex', flexWrap: 'wrap', gap: 14, alignContent: 'flex-start',
  } as CSSProperties,
  cardWrap: (hovered: boolean): CSSProperties => ({
    transition: 'transform .15s ease, filter .15s ease',
    transform: hovered ? 'translateY(-6px)' : 'none',
    filter: hovered ? 'drop-shadow(0 10px 20px rgba(0,0,0,0.7))' : 'none',
    cursor: 'pointer',
  }),

  // Detail overlay
  scrim: {
    position: 'fixed', inset: 0,
    background: 'rgba(10,8,5,0.85)',
    zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  } as CSSProperties,
  detailBox: {
    display: 'flex', gap: 40, padding: 40,
    maxWidth: 900, width: '100%', maxHeight: '92vh',
    position: 'relative',
  } as CSSProperties,
  detailMeta: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12,
    overflowY: 'auto',
  } as CSSProperties,
  detailName: {
    fontFamily: "'Newsreader', serif",
    fontSize: 26, fontWeight: 600,
    color: TBL.ink, lineHeight: 1.1,
  } as CSSProperties,
  tagRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  } as CSSProperties,
  tag: (color: string): CSSProperties => ({
    padding: '2px 9px', borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
    background: `${color}22`, color: color,
    border: `1px solid ${color}55`,
  }),
  statRow: {
    display: 'flex', gap: 14, alignItems: 'center',
  } as CSSProperties,
  statBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  } as CSSProperties,
  statNum: {
    fontFamily: "'Newsreader', serif",
    fontSize: 30, fontWeight: 700, color: TBL.amber2, lineHeight: 1,
  } as CSSProperties,
  statLbl: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8.5, color: TBL.ink3, letterSpacing: '0.12em', textTransform: 'uppercase',
  } as CSSProperties,
  divider: {
    height: 1, background: TBL.matLine, flexShrink: 0,
  } as CSSProperties,
  kwSection: {
    display: 'flex', flexDirection: 'column', gap: 10,
  } as CSSProperties,
  kwEntry: {
    display: 'flex', flexDirection: 'column', gap: 4,
  } as CSSProperties,
  kwChip: (color: string): CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px', borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase',
    background: `${color}28`, color: '#fff',
    border: `1px solid ${color}`,
    fontWeight: 600,
  }),
  kwDef: {
    fontFamily: "'Newsreader', serif",
    fontSize: 12.5, color: TBL.ink2, lineHeight: 1.45,
  } as CSSProperties,
  rulesText: {
    fontFamily: "'Newsreader', serif",
    fontSize: 14, color: TBL.ink, lineHeight: 1.55,
  } as CSSProperties,
  addBtn: (inDeck: boolean): CSSProperties => ({
    padding: '9px 20px', borderRadius: 7,
    border: `1px solid ${inDeck ? TBL.good : TBL.amber}`,
    background: inDeck ? 'rgba(116,192,138,0.1)' : 'rgba(214,160,80,0.12)',
    color: inDeck ? TBL.good : TBL.amber,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    fontSize: 13, fontWeight: 600,
    marginTop: 'auto',
    display: 'flex', alignItems: 'center', gap: 8,
  }),
  closeBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 30, height: 30, borderRadius: 6,
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${TBL.matLine2}`,
    color: TBL.ink3, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14,
  } as CSSProperties,
};

// ─── Filter sidebar pieces ────────────────────────────────────────────────────
function ClassFilter({ selected, toggle }: { selected: Set<string>; toggle: (v: string) => void }) {
  return (
    <div style={s.sideSection}>
      <span style={s.sideLabel}>Class</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {ALL_CLASSES.map(cls => {
          const on = selected.has(cls);
          const clr = CLASSCLR[cls] ?? TBL.ink3;
          return (
            <div key={cls} onClick={() => toggle(cls)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', padding: '3px 0',
                opacity: on ? 1 : 0.55,
                userSelect: 'none',
              }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                background: on ? clr : 'transparent',
                border: `1.5px solid ${clr}`,
              }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: on ? TBL.ink : TBL.ink2 }}>{cls}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckFilter<T extends string>({
  label, options, selected, toggle,
}: { label: string; options: readonly T[]; selected: Set<T>; toggle: (v: T) => void }) {
  return (
    <div style={s.sideSection}>
      <span style={s.sideLabel}>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {options.map(opt => {
          const on = selected.has(opt);
          return (
            <div key={opt} onClick={() => toggle(opt)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', padding: '3px 0', userSelect: 'none',
                opacity: on ? 1 : 0.55,
              }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                background: on ? TBL.amber : 'transparent',
                border: `1.5px solid ${on ? TBL.amber : TBL.ink3}`,
              }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: on ? TBL.ink : TBL.ink2 }}>{opt}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LevelFilter({ selected, toggle }: { selected: Set<number>; toggle: (v: number) => void }) {
  return (
    <div style={{ padding: '0 12px 14px' }}>
      <span style={s.sideLabel}>Level</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {ALL_LEVELS.map(lv => {
          const on = selected.has(lv);
          return (
            <div key={lv} onClick={() => toggle(lv)}
              style={{
                width: 28, height: 28, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', userSelect: 'none',
                background: on ? 'rgba(214,160,80,0.18)' : 'rgba(0,0,0,0.2)',
                border: `1.5px solid ${on ? TBL.amber : TBL.matLine2}`,
                color: on ? TBL.amber2 : TBL.ink3,
                fontFamily: "'Newsreader', serif",
                fontSize: 14, fontWeight: 600,
              }}>
              {lv}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detail overlay ───────────────────────────────────────────────────────────
function DetailOverlay({ card, onClose }: { card: Card; onClose: () => void }) {
  const cls = card.class1 ?? 'Classless';
  const clr = CLASSCLR[cls] ?? TBL.ink3;

  const stats: { label: string; value: number | null }[] = [];
  if (card.type === 'Companion' || card.type === 'Construct') {
    if (card.attack != null) stats.push({ label: 'Attack', value: card.attack });
    if (card.hp      != null) stats.push({ label: 'HP',     value: card.hp });
    if (card.anchor  != null) stats.push({ label: 'Anchors', value: card.anchor });
  }
  stats.push({ label: 'Level', value: card.level });

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.detailBox} onClick={e => e.stopPropagation()}>
        {/* Card at 1.7× */}
        <div style={{ flexShrink: 0 }}>
          <CardFace data={card} scale={1.1} scrollText />
        </div>

        {/* Metadata column */}
        <div style={s.detailMeta}>
          <div style={s.detailName}>{card.name}</div>

          {/* Tags */}
          <div style={s.tagRow}>
            <span style={s.tag(clr)}>{cls}</span>
            {card.class2 && <span style={s.tag(CLASSCLR[card.class2] ?? TBL.ink3)}>{card.class2}</span>}
            <span style={s.tag(TBL.ink2)}>{card.type}</span>
            {card.subtype && <span style={s.tag(TBL.ink3)}>{card.subtype}</span>}
            <span style={s.tag(TBL.ink4)}>{card.rarity}</span>
          </div>

          {/* Stats */}
          {stats.length > 0 && (
            <div style={s.statRow}>
              {stats.map(st => st.value != null && (
                <div key={st.label} style={s.statBlock}>
                  <span style={s.statNum}>{st.value}</span>
                  <span style={s.statLbl}>{st.label}</span>
                </div>
              ))}
            </div>
          )}

          <div style={s.divider} />

          {/* Keywords with glossary */}
          {card.keywords.length > 0 && (
            <div style={s.kwSection}>
              <span style={s.sideLabel}>Keywords</span>
              {card.keywords.map(kw => (
                <div key={kw} style={s.kwEntry}>
                  <div><span style={s.kwChip(clr)}>{kw}</span></div>
                  {KEYWORD_DEFS[kw] && <p style={s.kwDef}>{KEYWORD_DEFS[kw]}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Rules text */}
          {card.text && (
            <>
              <div style={s.divider} />
              <p style={s.rulesText}>{card.text}</p>
            </>
          )}

          {/* Flavor */}
          {card.flavor && (
            <p style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: 'italic', fontSize: 12.5, color: TBL.ink3, lineHeight: 1.5,
            }}>{card.flavor}</p>
          )}
        </div>

        {/* Close */}
        <div style={s.closeBtn} onClick={onClose}>✕</div>
      </div>
    </div>
  );
}

// ─── Library screen ───────────────────────────────────────────────────────────
export function Library() {
  const [search, setSearch]   = useState('');
  const [classes, setClasses] = useState<Set<string>>(new Set());
  const [types,   setTypes]   = useState<Set<string>>(new Set());
  const [levels,  setLevels]  = useState<Set<number>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [detail,  setDetail]  = useState<Card | null>(null);

  const toggleSet = useCallback(<T,>(set: Set<T>, val: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
  }, []);

  const activeFilterCount = classes.size + types.size + levels.size;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return CATALOG.filter(c => {
      if (classes.size && !classes.has(c.class1) && !classes.has(c.class2)) return false;
      if (types.size   && !types.has(c.type))   return false;
      if (levels.size  && !levels.has(c.level)) return false;
      if (q) {
        const haystack = `${c.name} ${c.text} ${c.subtype} ${c.keywords.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [search, classes, types, levels]);

  // Close overlay on Esc
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setDetail(null);
  }, []);

  return (
    <div style={s.root} onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        {activeFilterCount > 0 && (
          <div style={{ padding: '0 12px 10px' }}>
            <button style={s.clearBtn} onClick={() => { setClasses(new Set()); setTypes(new Set()); setLevels(new Set()); }}>
              Clear filters ({activeFilterCount})
            </button>
          </div>
        )}
        <ClassFilter selected={classes} toggle={v => toggleSet(classes, v, setClasses)} />
        <CheckFilter label="Type" options={ALL_TYPES} selected={types as Set<typeof ALL_TYPES[number]>} toggle={v => toggleSet(types as Set<string>, v, setTypes)} />
        <LevelFilter selected={levels} toggle={v => toggleSet(levels, v, setLevels)} />
      </div>

      {/* Main */}
      <div style={s.main}>
        {/* Toolbar */}
        <div style={s.toolbar}>
          <div style={s.searchWrap}>
            <span style={s.searchIcon}>⌕</span>
            <input
              style={s.searchInput}
              placeholder="Search name, text, subtype, keywords…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span style={s.countBadge}>{filtered.length} / {CATALOG.length} cards</span>
        </div>

        {/* Grid */}
        <div style={s.grid}>
          {filtered.map(card => (
            <div
              key={card.id}
              style={s.cardWrap(hovered === card.id)}
              onMouseEnter={() => setHovered(card.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setDetail(card)}
            >
              <CardFace data={card} scale={0.82} hoverable scrollText />
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{
              color: TBL.ink3, fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              padding: 40,
            }}>
              No cards match
            </div>
          )}
        </div>
      </div>

      {/* Detail overlay */}
      {detail && <DetailOverlay card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
