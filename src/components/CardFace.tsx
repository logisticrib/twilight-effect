import type { CSSProperties, Ref, WheelEvent } from 'react';
import type { BoardEntity, Card, TapState } from '../types/card';
import { TBL, CLASSCLR, CLASSDARK, GLYPH } from '../tokens';
import { useGameStore } from '../store/gameStore';
import { effectiveAttack, effectiveMaxHp, actionTypeOf, hasAnchorCounters } from '../store/keywords';
import type { ActionCost } from '../store/keywords';

// ─── Fixed card canvas ───────────────────────────────────────────────────────
const BASE_W = 200;
const BASE_H = 280;

export { BASE_W, BASE_H };

// ─── Shared style helpers ────────────────────────────────────────────────────
const s = {
  wrap(scale: number, rotateDeg: number, hoverable: boolean): CSSProperties {
    return {
      width: BASE_W * scale,
      height: BASE_H * scale,
      position: 'relative',
      flexShrink: 0,
      transition: 'transform .18s cubic-bezier(.2,.8,.3,1), filter .18s',
      transform: rotateDeg ? `rotate(${rotateDeg}deg)` : 'none',
      cursor: hoverable ? 'pointer' : 'default',
    };
  },
  card(dark: string, sel: boolean): CSSProperties {
    return {
      position: 'absolute',
      top: 0, left: 0,
      width: BASE_W, height: BASE_H,
      transformOrigin: 'top left',
      borderRadius: 14,
      background: `linear-gradient(160deg, ${dark} 0%, ${TBL.stockEdge} 60%)`,
      padding: 7,
      boxSizing: 'border-box',
      boxShadow: sel
        ? `0 0 0 3px ${TBL.amber}, 0 0 22px 4px rgba(214,160,80,0.45), 0 10px 24px rgba(0,0,0,0.6)`
        : `0 6px 16px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)`,
    };
  },
  inner(cls: string, amber?: boolean): CSSProperties {
    return {
      width: '100%', height: '100%',
      borderRadius: 9,
      border: `1.5px solid ${amber ? TBL.amber : cls}`,
      background: `linear-gradient(180deg, ${TBL.stock} 0%, ${TBL.stock2} 100%)`,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    };
  },
  banner(cls: string, dark: string): CSSProperties {
    return {
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 8px',
      background: `linear-gradient(180deg, ${cls}cc, ${dark})`,
      borderBottom: `1px solid ${TBL.stockEdge}`,
    };
  },
  name: {
    flex: 1,
    fontFamily: "'Newsreader', serif",
    fontSize: 15, fontWeight: 600,
    color: '#fff', lineHeight: 1.05, letterSpacing: '0.01em',
    textShadow: '0 1px 2px rgba(0,0,0,0.6)',
  } as CSSProperties,
  gem(dark: string, small?: boolean): CSSProperties {
    return {
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 35% 30%, #fff6, ${dark})`,
      border: '1.5px solid #ffffffcc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Newsreader', serif",
      fontSize: small ? 13 : 15, fontWeight: 700, color: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
    };
  },
  art(cls: string, dark: string): CSSProperties {
    return {
      height: 104, margin: 7, marginBottom: 4, borderRadius: 6,
      border: `1px solid ${cls}88`,
      background: `
        radial-gradient(ellipse at 50% 30%, ${cls}33, transparent 70%),
        repeating-linear-gradient(135deg, ${cls}14 0, ${cls}14 7px, transparent 7px, transparent 14px),
        linear-gradient(180deg, ${dark}, ${TBL.stockEdge})`,
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
  },
  artGlyph(cls: string, large?: boolean): CSSProperties {
    return {
      fontFamily: "'Newsreader', serif",
      fontSize: large ? 60 : 50,
      color: cls, opacity: 0.92,
      textShadow: `0 2px 12px ${cls}88`,
      lineHeight: 1,
    };
  },
  artVignette: {
    position: 'absolute', inset: 0,
    boxShadow: 'inset 0 -14px 22px rgba(0,0,0,0.55), inset 0 6px 14px rgba(0,0,0,0.3)',
    pointerEvents: 'none',
  } as CSSProperties,
  levelPip: {
    position: 'absolute', top: 5, left: 5,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8.5, letterSpacing: '0.08em',
    color: '#fff', background: 'rgba(0,0,0,0.5)',
    padding: '1px 5px', borderRadius: 3,
    textTransform: 'uppercase',
  } as CSSProperties,
  typeLine(cls: string): CSSProperties {
    return {
      margin: '0 7px', padding: '3px 6px', borderRadius: 4,
      background: `linear-gradient(90deg, ${cls}33, transparent)`,
      borderLeft: `2px solid ${cls}`,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 8, letterSpacing: '0.05em',
      color: TBL.ink, textTransform: 'uppercase',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
      whiteSpace: 'nowrap',
    };
  },
  textbox: {
    flex: 1, margin: 7, marginTop: 5, padding: '6px 8px', borderRadius: 6,
    background: TBL.textbox,
    border: '1px solid rgba(255,255,255,0.05)',
    fontFamily: "'Newsreader', serif",
    fontSize: 11.5, lineHeight: 1.32,
    color: TBL.ink, overflow: 'hidden',
    boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.4)',
  } as CSSProperties,
  footer: {
    display: 'flex', alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: '0 6px 6px', position: 'relative', marginTop: -2,
  } as CSSProperties,
  statGem(kind: 'atk' | 'hp', low?: boolean): CSSProperties {
    const bg = kind === 'atk'
      ? 'radial-gradient(circle at 35% 30%, #fff6, #7a1f1c)'
      : (low
          ? 'radial-gradient(circle at 35% 30%, #fff6, #7a1f1c)'
          : 'radial-gradient(circle at 35% 30%, #fff6, #1f5c33)');
    return {
      minWidth: 30, height: 30, borderRadius: 8, padding: '0 5px',
      background: bg,
      border: '1.5px solid #ffffffcc',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
      fontFamily: "'Newsreader', serif",
      fontSize: 16, fontWeight: 700, color: '#fff',
      boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
    };
  },
  statSmall: { fontSize: 10, opacity: 0.8, fontWeight: 600 } as CSSProperties,
  anchorWrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 5, padding: '0 6px 8px',
  } as CSSProperties,
  anchorPip(filled: boolean): CSSProperties {
    return {
      width: 13, height: 13, borderRadius: '50%',
      background: filled ? 'radial-gradient(circle at 35% 30%, #f5d89a, #9c6a1e)' : 'transparent',
      border: `1.5px solid ${filled ? '#f0c074' : 'rgba(214,176,108,0.4)'}`,
      boxShadow: filled ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
    };
  },
  condStack: {
    position: 'absolute', top: 38, right: 11,
    display: 'flex', flexDirection: 'column', gap: 3,
    zIndex: 3, alignItems: 'flex-end',
  } as CSSProperties,
  condBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8, fontWeight: 700,
    color: '#fff', background: 'rgba(224,106,106,0.92)',
    padding: '2px 5px', borderRadius: 3,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    border: '1px solid #fff5', boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
  } as CSSProperties,
  costBadge(col: string): CSSProperties {
    return {
      flexShrink: 0,
      padding: '1px 5px', borderRadius: 3,
      background: `${col}26`, border: `1px solid ${col}66`,
      color: col, fontWeight: 700, letterSpacing: '0.07em',
    };
  },
  itemRibbon(cls: string): CSSProperties {
    return {
      display: 'flex', alignItems: 'center', gap: 4,
      margin: '0 7px 5px', padding: '2px 6px', borderRadius: 4,
      background: `${cls}1c`, border: `1px solid ${cls}55`,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 8.5, color: TBL.ink, letterSpacing: '0.03em',
    };
  },
  exhaustTag: {
    position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8, fontWeight: 700,
    color: TBL.ink3, background: 'rgba(0,0,0,0.6)',
    padding: '2px 7px', borderRadius: 3,
    letterSpacing: '0.12em', zIndex: 4,
  } as CSSProperties,
};

// ─── PC card variant ──────────────────────────────────────────────────────────
function PcCard({
  data, scale = 1, selected = false, hoverable = false, scrollText, textboxRef, onWheel, upright = false, onClick, onMouseEnter, onMouseLeave,
}: CardFaceProps & { data: BoardEntity & { kind: 'pc' } }) {
  const cls = CLASSCLR[data.cls] ?? TBL.violet;
  const dark = CLASSDARK[data.cls] ?? '#3a2f5c';
  const low = data.hp / data.maxHp < 0.4;
  // The PC exhausts like any character (attacking is a Major Action — rules ruling
  // 2026-07-08), so its board card must rotate too; a fixed 0 hid the state.
  const rot = upright ? 0 : (TAP_DEG[data.tapped] ?? (data.exhausted ? 90 : 0));
  return (
    <div style={s.wrap(scale, rot, hoverable)}
      onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onWheel={onWheel}>
      <div style={{ ...s.card(dark, selected), transform: `scale(${scale})` }}>
        <div style={s.inner(cls, true)}>
          <div style={s.banner(cls, dark)}>
            <div style={s.name}>{data.name}</div>
            <div style={s.gem(dark, true)}>♛</div>
          </div>
          <div style={s.art(cls, dark)}>
            <div style={s.levelPip}>Champion</div>
            <div style={{ ...s.artGlyph(TBL.amber2, true) }}>※</div>
            <div style={s.artVignette} />
          </div>
          <div style={s.typeLine(cls)}>
            <span>Player Character</span><span>Core</span>
          </div>
          <div ref={textboxRef} className={scrollText ? 'tcard-scroll' : undefined} style={textboxStyle(scrollText)}>{data.text}</div>
          <div style={s.footer}>
            <div style={{ flex: 1 }} />
            <div style={s.statGem('hp', low)}>
              {data.hp}<span style={s.statSmall}>/{data.maxHp}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface CardFaceProps {
  /** A board entity (has live state like hp, tapped, loadout) OR a raw catalog Card. */
  data: BoardEntity | Card;
  scale?: number;
  selected?: boolean;
  hoverable?: boolean;
  /** Let the rules text scroll (wheel) when it overflows, instead of clipping. Used in
   *  Library/Deck card grids and the Play preview pane; board cards stay clipped. */
  scrollText?: boolean;
  /** Ref to the rules textbox element (Play preview registers it for wheel-scroll). */
  textboxRef?: Ref<HTMLDivElement>;
  /** Wheel handler on the card (source cards forward it to scroll the preview pane). */
  onWheel?: (e: WheelEvent<HTMLDivElement>) => void;
  /** Render the card upright even if the entity is tapped/exhausted (used by the
   *  hover preview pane — you're inspecting the card, not its board state). */
  upright?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/** Rules-textbox style, optionally made scrollable when text overflows. */
function textboxStyle(scrollText?: boolean): CSSProperties {
  return scrollText
    ? { ...s.textbox, overflowX: 'hidden', overflowY: 'auto', overscrollBehavior: 'contain' }
    : s.textbox;
}

const TAP_DEG: Record<TapState, number> = { none: 0, minor: 45, major: 90 };

// ─── Main CardFace ────────────────────────────────────────────────────────────
export function CardFace({
  data, scale = 1, selected = false, hoverable = false, scrollText = false, textboxRef, onWheel, upright = false,
  onClick, onMouseEnter, onMouseLeave,
}: CardFaceProps) {
  // Effective attack for a board companion (base + items + auras + buffs); null
  // for hand cards / constructs, which fall back to the printed value below.
  const effAtk = useGameStore(s =>
    data && 'kind' in data && data.kind === 'companion'
      ? effectiveAttack(data as BoardEntity, s.game)
      : null
  );
  const effMaxHp = useGameStore(s =>
    data && 'kind' in data && (data.kind === 'companion' || data.kind === 'pc')
      ? effectiveMaxHp(data as BoardEntity, s.game)
      : null
  );
  const setHovered = useGameStore(s => s.setHovered);
  if (!data) return null;

  // Default hover → the Play-screen preview pane (owner QoL 2026-07-08): any CardFace
  // without explicit hover handlers populates the preview — this is what makes cards
  // inside modals (class bonus, mulligan, pickers) previewable. Call sites with their
  // own handlers (board slots, hand fan) keep them.
  const hoverEnter = onMouseEnter ?? (() => setHovered({ data, owner: 'preview' }));
  const hoverLeave = onMouseLeave ?? (() => setHovered(null));

  if ('kind' in data && data.kind === 'pc') {
    return (
      <PcCard
        data={data as BoardEntity & { kind: 'pc' }}
        scale={scale} selected={selected} hoverable={hoverable} scrollText={scrollText}
        textboxRef={textboxRef} onWheel={onWheel} upright={upright}
        onClick={onClick} onMouseEnter={hoverEnter} onMouseLeave={hoverLeave}
      />
    );
  }

  // Resolve class — BoardEntity uses `cls`, Card uses `class1`
  const clsName = ('cls' in data ? data.cls : null) ?? (data as Card).class1 ?? 'Classless';
  const cls  = CLASSCLR[clsName] ?? TBL.ink3;
  const dark = CLASSDARK[clsName] ?? '#333';

  // Tap state (board entities only)
  const tapped: TapState = ('tapped' in data ? data.tapped : 'none') ?? 'none';
  const exhausted = 'exhausted' in data ? data.exhausted : false;
  const rot = upright ? 0 : (TAP_DEG[tapped] ?? (exhausted ? 90 : 0));

  // Type resolution
  const rawType = ('type' in data ? data.type : '') as string;
  const isCompanion = rawType === 'Companion' || ('kind' in data && data.kind === 'companion');
  const isConstruct = rawType === 'Construct'  || ('kind' in data && data.kind === 'construct');

  const hp    = 'hp'    in data ? (data as BoardEntity).hp    : null;
  // Board entities carry `maxHp`; a raw hand/library Card does not — fall back to its
  // printed `hp` so companion stats render off the board too (else the stat block hid).
  const maxHp = effMaxHp ?? ('maxHp' in data ? (data as BoardEntity).maxHp : (data as Card).hp);
  const atk   = effAtk ?? ('atk'  in data ? (data as BoardEntity).atk   : (data as Card).attack);
  const anchors      = 'anchors'      in data ? (data as BoardEntity).anchors      : null;
  const anchorsStart = 'anchorsStart' in data ? (data as BoardEntity).anchorsStart : null;
  const anchorsVal   = anchors      ?? (data as Card).anchor ?? 0;
  const anchorsMax   = anchorsStart ?? (data as Card).anchor ?? 0;

  const statuses  = ('statuses'  in data ? data.statuses  : []) ?? [];
  const level     = 'level' in data ? data.level : 0;
  const subtype   = ('subtype' in data ? data.subtype : '') ?? '';
  const text      = 'text' in data ? data.text : '';

  const low = isCompanion && hp != null && maxHp != null && (hp / maxHp) < 0.5;

  // Action cards surface their rules-live Minor/Major/Special cost (actionTypeOf —
  // the same read the play gate charges) as a tinted chip on the type line.
  const actionCost = rawType === 'Action' ? actionTypeOf(data as Card) : null;
  const costCol: Record<ActionCost, string> = { Major: TBL.amber, Minor: TBL.good, Special: TBL.violet };

  return (
    <div style={s.wrap(scale, rot, hoverable)}
      onClick={onClick} onMouseEnter={hoverEnter} onMouseLeave={hoverLeave} onWheel={onWheel}>
      <div style={{ ...s.card(dark, selected), transform: `scale(${scale})` }}>
        <div style={s.inner(cls)}>

          {/* Banner */}
          <div style={s.banner(cls, dark)}>
            <div style={s.name}>{data.name}</div>
            <div style={s.gem(dark)}>{level}</div>
          </div>

          {/* Art window */}
          <div style={s.art(cls, dark)}>
            <div style={s.levelPip}>{clsName}</div>
            <div style={s.artGlyph(cls)}>{GLYPH[clsName] ?? '◆'}</div>
            <div style={s.artVignette} />
          </div>

          {/* Condition badges */}
          {statuses.length > 0 && (
            <div style={s.condStack}>
              {statuses.map(st => <div key={st} style={s.condBadge}>{st}</div>)}
            </div>
          )}

          {/* Type line — single line; long subtypes ellipsis-truncate so the rules
              textbox below keeps its height (companions are tight with the stat block). */}
          <div style={s.typeLine(cls)}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {rawType || (isConstruct ? 'Construct' : isCompanion ? 'Companion' : 'Card')}{subtype ? ` · ${subtype}` : ''}
            </span>
            {actionCost && <span style={s.costBadge(costCol[actionCost])}>{actionCost}</span>}
            <span style={{ flexShrink: 0 }}>L{level}</span>
          </div>

          {/* Rules text (keyword chips removed — keywords already lead the text) */}
          <div ref={textboxRef} className={scrollText ? 'tcard-scroll' : undefined} style={textboxStyle(scrollText)}>
            <span>{text}</span>
          </div>

          {/* Footer — companions */}
          {isCompanion && atk != null && hp != null && maxHp != null && (
            <div style={s.footer}>
              <div style={s.statGem('atk')}>{atk}</div>
              <div style={s.statGem('hp', low)}>
                {hp}<span style={s.statSmall}>/{maxHp}</span>
              </div>
            </div>
          )}

          {/* Anchor pips on any counter-carrying COMPANION — i.e. an animated
              Manifest (Rules Note 2026-07-20: decay keys on counters, not card
              type; the counters are its remaining lifespan). Same predicate as
              the engine's decay (hasAnchorCounters) — the missing pips here were
              the display gap that surfaced the ruling. */}
          {isCompanion && 'anchors' in data && hasAnchorCounters(data as BoardEntity) && (
            <>
              <div style={{
                ...s.typeLine(cls),
                margin: '0 7px 4px', borderLeft: 'none',
                background: 'transparent', justifyContent: 'center', color: TBL.ink3,
              }}>
                Anchors {anchorsVal}/{Math.max(anchorsMax, anchorsVal)}
              </div>
              <div style={s.anchorWrap}>
                {Array.from({ length: Math.max(anchorsMax, anchorsVal) }).map((_, i) => (
                  <div key={i} style={s.anchorPip(i < anchorsVal)} />
                ))}
              </div>
            </>
          )}

          {/* Footer — constructs */}
          {isConstruct && (
            <>
              <div style={{
                ...s.typeLine(cls),
                margin: '0 7px 4px', borderLeft: 'none',
                background: 'transparent', justifyContent: 'center', color: TBL.ink3,
              }}>
                Anchors {anchorsVal}/{anchorsMax}
              </div>
              <div style={s.anchorWrap}>
                {Array.from({ length: anchorsMax }).map((_, i) => (
                  <div key={i} style={s.anchorPip(i < anchorsVal)} />
                ))}
              </div>
            </>
          )}

          {/* Action spacer */}
          {!isCompanion && !isConstruct && <div style={{ height: 8 }} />}

          {/* Tap tag */}
          {rot === 45 && <div style={s.exhaustTag}>MINOR · 45°</div>}
          {rot === 90 && <div style={s.exhaustTag}>TAPPED · 90°</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Card back ────────────────────────────────────────────────────────────────
export function CardBack({ scale = 1, label }: { scale?: number; label?: string }) {
  return (
    <div style={{ width: BASE_W * scale, height: BASE_H * scale, position: 'relative', flexShrink: 0 }}>
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: BASE_W, height: BASE_H,
        transform: `scale(${scale})`, transformOrigin: 'top left',
        borderRadius: 14,
        background: 'linear-gradient(150deg, #2a2340, #15111f)',
        border: `1px solid rgba(214,160,80,0.3)`,
        boxSizing: 'border-box',
        boxShadow: '0 6px 14px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 120, height: 120, borderRadius: '50%',
          border: `2px solid ${TBL.amber}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            fontFamily: "'Newsreader', serif", fontSize: 64,
            color: TBL.amber, opacity: 0.85, marginLeft: 14,
          }}>☾</div>
          <div style={{
            position: 'absolute', inset: -8, borderRadius: '50%',
            border: `1px solid ${TBL.amber}22`,
          }} />
        </div>
        {label && (
          <div style={{
            position: 'absolute', bottom: 14, left: 0, right: 0,
            textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: TBL.amber2, letterSpacing: '0.2em',
          }}>{label}</div>
        )}
      </div>
    </div>
  );
}
