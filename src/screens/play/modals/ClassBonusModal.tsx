import { useState, type CSSProperties } from 'react';
import { ModalShell, md } from './ModalShell';
import { CardFace } from '../../../components/CardFace';
import { useGameStore, seatName, type GameState, type PlayerState } from '../../../store/gameStore';
import { CATALOG } from '../../../data/catalog';
import { TBL, CLASSCLR, GLYPH } from '../../../tokens';
import type { Card, BoardEntity } from '../../../types/card';

/** Adjust a player's PC HP by `delta` (floored at 0), keeping the three views married:
 *  the PlayerState headline (stats pane), the stashed `_pc` (pre-placement), and any
 *  PC already on the board. Used by the Paladin (+5) and Sorcerer (−2 to opp) bonuses. */
function bumpPcHp(ps: PlayerState, delta: number): PlayerState {
  const clamp = (n: number) => Math.max(0, n + delta);
  const bumpEnt = (e?: BoardEntity): BoardEntity | undefined =>
    e ? { ...e, hp: clamp(e.hp), maxHp: clamp(e.maxHp) } : e;
  const board = Object.fromEntries(
    Object.entries(ps.board).map(([slot, e]) => [slot, e?.kind === 'pc' ? bumpEnt(e) : e]),
  ) as PlayerState['board'];
  return { ...ps, hp: clamp(ps.hp), maxHp: clamp(ps.maxHp), _pc: bumpEnt(ps._pc), board };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type BonusMode =
  | 'instant'      // no interaction — just click Apply
  | 'pick-hand'    // pick a card from hand; optionally swap with a specific CZ card type
  | 'view-deck';   // view top 2 cards of a deck, choose which to bottom

interface BonusDef {
  name: string;
  desc: string;
  mode: BonusMode;
  /** For view-deck: whose deck to inspect */
  deckOwner?: 'self' | 'opponent';
  /** For pick-hand CZ-swap bonuses: label + filter for the CZ card leaving */
  czTypeLabel?: string;
  czFilter?: (czName: string, czCls: string) => boolean;
  apply: (
    g: GameState,
    player: 'p1' | 'p2',
    handCard?: Card,
    extra?: { czCardId?: string; bottomIds?: string[]; topOrderIds?: string[] },
  ) => { g: GameState; result: string };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Swap a hand card into the CZ, returning the targeted CZ card to hand. */
function czSwapById(g: GameState, player: 'p1' | 'p2', handCard: Card, czCardId: string) {
  const ps = g[player];
  const hand   = ps.hand.filter(c => c.id !== handCard.id);
  const czIdx  = ps.classZone.findIndex(c => c.id === czCardId);
  if (czIdx === -1) return { g, result: 'CZ card not found' };

  const leaving = ps.classZone[czIdx];
  const newCZ   = ps.classZone.map((c, i) =>
    i === czIdx ? { id: c.id, cls: handCard.class1, name: handCard.name } : c
  );
  const retCard = CATALOG.find(c => c.name === leaving.name)
    ?? ({ ...handCard, id: `cz-ret-${Date.now()}`, name: leaving.name, class1: leaving.cls, cls: leaving.cls } as Card);

  return {
    g: { ...g, [player]: { ...ps, hand: [...hand, retCard], classZone: newCZ } },
    result: `${handCard.name} → CZ · ${leaving.name} → hand`,
  };
}

/** View-deck bonus: rearrange the looked-at top cards of `owner`'s deck — send any to
 *  the bottom, and keep the rest on top in the chosen order (`topOrderIds`). Mirrors the
 *  rule "put any number on the bottom and the rest on top in any order." */
function reorderTopCards(g: GameState, owner: 'p1' | 'p2', look: number, bottomIds: string[], topOrderIds: string[]) {
  const ds   = g[owner];
  const seen = ds.deck.slice(0, look);
  const rest = ds.deck.slice(look);
  const bottomed = seen.filter(c => bottomIds.includes(c.id));
  // Kept-on-top in the player's chosen order; append any kept card not listed (safety).
  const ordered = topOrderIds
    .map(id => seen.find(c => c.id === id))
    .filter((c): c is Card => !!c && !bottomIds.includes(c.id));
  const keptSet = new Set(ordered.map(c => c.id));
  const kept = [...ordered, ...seen.filter(c => !bottomIds.includes(c.id) && !keptSet.has(c.id))];
  const result = bottomed.length
    ? `Bottomed: ${bottomed.map(c => c.name).join(', ')}${kept.length > 1 ? ` · top: ${kept.map(c => c.name).join(', ')}` : ''}`
    : kept.length > 1 ? `Top order: ${kept.map(c => c.name).join(', ')}` : 'Kept on top';
  return { g: { ...g, [owner]: { ...ds, deck: [...kept, ...rest, ...bottomed] } }, result };
}

const isWeapon    = (name: string) => {
  const c = CATALOG.find(x => x.name === name);
  return !!c && c.type === 'Item' && (
    c.itemKind?.toLowerCase().includes('weapon') ||
    ['sword','bow','staff','dagger','axe','mace','wand'].some(w => c.subtype?.toLowerCase().includes(w))
  );
};
const isCompanion = (name: string) => CATALOG.find(x => x.name === name)?.type === 'Companion';
const isConstruct = (name: string) => CATALOG.find(x => x.name === name)?.type === 'Construct';

// ─── Bonus definitions ─────────────────────────────────────────────────────────

const BONUSES: Record<string, BonusDef> = {
  Paladin: {
    name: 'Divine Favor', mode: 'instant',
    desc: 'Add 5 HP to your starting health.',
    apply: (g, p) => {
      const ps = g[p];
      // The PC's HP lives on the PC entity (stashed in _pc until placement); mirror
      // it onto the PlayerState headline so stats + combat stay married.
      return { g: { ...g, [p]: bumpPcHp(ps, +5) }, result: `HP ${ps.hp} → ${ps.hp + 5}` };
    },
  },
  Sorcerer: {
    name: 'Elemental Fury', mode: 'instant',
    desc: "Reduce your opponent's starting HP by 2.",
    apply: (g, p) => {
      const opp: 'p1' | 'p2' = p === 'p1' ? 'p2' : 'p1';
      const ops = g[opp];
      const newHp = Math.max(0, ops.hp - 2);
      return { g: { ...g, [opp]: bumpPcHp(ops, -2) }, result: `Opponent's PC HP ${ops.hp} → ${newHp}` };
    },
  },
  Necromancer: {
    name: 'Grave Intent', mode: 'instant',
    desc: 'Put the top 3 cards of your deck into your Dead Zone.',
    apply: (g, p) => {
      const ps = g[p];
      const milled = ps.deck.slice(0, 3);
      return { g: { ...g, [p]: { ...ps, deck: ps.deck.slice(3), dead: [...ps.dead, ...milled] } }, result: `${milled.length} cards milled` };
    },
  },
  Wizard: {
    name: 'Knowledge is Power', mode: 'view-deck', deckOwner: 'self',
    desc: 'Look at the top 2 cards of your deck. Put any on the bottom; keep the rest on top in any order.',
    apply: (g, p, _h, { bottomIds = [], topOrderIds = [] } = {}) =>
      reorderTopCards(g, p, 2, bottomIds, topOrderIds),
  },
  'Doom-Whisperer': {
    name: 'Seeds of Despair', mode: 'view-deck', deckOwner: 'opponent',
    desc: "Look at the top 2 cards of your opponent's deck. Put any on the bottom; keep the rest on top in any order.",
    apply: (g, p, _h, { bottomIds = [], topOrderIds = [] } = {}) =>
      reorderTopCards(g, p === 'p1' ? 'p2' : 'p1', 2, bottomIds, topOrderIds),
  },
  Warrior: {
    name: 'Gear Up!', mode: 'pick-hand',
    czTypeLabel: 'Weapon', czFilter: (name) => isWeapon(name),
    desc: 'Choose a card from your hand and swap it for a Weapon card in your Class Zone.',
    apply: (g, p, card, { czCardId } = {}) =>
      card && czCardId ? czSwapById(g, p, card, czCardId) : { g, result: 'Skipped' },
  },
  Druid: {
    name: 'Call the Wild', mode: 'pick-hand',
    czTypeLabel: 'Companion', czFilter: (name) => isCompanion(name),
    desc: 'Choose a card from your hand and swap it for a Companion card in your Class Zone.',
    apply: (g, p, card, { czCardId } = {}) =>
      card && czCardId ? czSwapById(g, p, card, czCardId) : { g, result: 'Skipped' },
  },
  Builder: {
    name: 'Lay the Foundation', mode: 'pick-hand',
    czTypeLabel: 'Construct', czFilter: (name) => isConstruct(name),
    desc: 'Choose a card from your hand and swap it for a Construct card in your Class Zone.',
    apply: (g, p, card, { czCardId } = {}) =>
      card && czCardId ? czSwapById(g, p, card, czCardId) : { g, result: 'Skipped' },
  },
  Bard: {
    name: 'Encore!', mode: 'pick-hand',
    desc: 'Shuffle one card from your hand into your deck, then draw a card.',
    apply: (g, p, card) => {
      if (!card) return { g, result: 'Skipped' };
      const ps = g[p];
      const hand = ps.hand.filter(c => c.id !== card.id);
      const pile = [...ps.deck, card].sort(() => Math.random() - 0.5);
      const [drawn, ...rest] = pile;
      return { g: { ...g, [p]: { ...ps, hand: [...hand, drawn], deck: rest } }, result: `Shuffled in ${card.name}, drew ${drawn.name}` };
    },
  },
  Rogue: {
    name: 'Sleight of Hand', mode: 'instant',
    desc: 'Look at your Player Character card.',
    apply: (g, p) => {
      const pc = g[p]._pc as (import('../../../types/card').BoardEntity & { _hiddenCard?: Card }) | undefined;
      const name = pc?._hiddenCard?.name ?? '(unknown)';
      return { g, result: `Your PC is: ${name}` };
    },
  },
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props { onClose: () => void; isSequence?: boolean; player?: 'p1' | 'p2'; }

export function ClassBonusModal({ onClose, isSequence, player = 'p1' }: Props) {
  const { game, setGame, localPlayer } = useGameStore();
  const ps         = game[player];
  // The set of class bonuses is LOCKED at the classes in the Class Zone when this phase
  // begins (i.e. once hands are kept) — snapshot it on mount. A bonus that swaps a CZ
  // card (czSwapById) changes the live CZ classes, but must NOT change which bonuses are
  // offered. (Live `ps.classZone` is still used below for swap-target lookups.)
  const [czClasses] = useState<string[]>(() => [...new Set(game[player].classZone.map(c => c.cls))]);

  type Resolution = { kind: 'applied' | 'skipped'; result: string };
  const [resolved,    setResolved]    = useState<Record<number, Resolution>>({});
  const [pickingIdx,  setPickingIdx]  = useState<number | null>(null);
  const [czTargetId,  setCzTargetId]  = useState<string | null>(null);
  const [toBottom,    setToBottom]    = useState<string[]>([]);
  // view-deck: the chosen top order (ids of the looked-at cards, top → bottom).
  const [topOrder,    setTopOrder]    = useState<string[]>([]);

  const allDone = czClasses.every((_, i) => resolved[i] !== undefined);

  const applyBonus = (i: number, cls: string, handCard?: Card, czCardId?: string, bottomIds?: string[], topOrderIds?: string[]) => {
    const bonus = BONUSES[cls];
    if (!bonus) { skipBonus(i); return; }
    let appliedResult = '';
    setGame(g => {
      const { g: newG, result } = bonus.apply(g, player, handCard, { czCardId, bottomIds, topOrderIds });
      appliedResult = result;
      return newG;
    });
    setResolved(r => ({ ...r, [i]: { kind: 'applied', result: appliedResult } }));
    setPickingIdx(null);
    setCzTargetId(null);
    setToBottom([]);
    setTopOrder([]);
  };

  const skipBonus = (i: number) => {
    setResolved(r => ({ ...r, [i]: { kind: 'skipped', result: '' } }));
    setPickingIdx(null);
    setCzTargetId(null);
    setToBottom([]);
    setTopOrder([]);
  };

  const openPicker = (i: number, cls: string) => {
    if (pickingIdx === i) { setPickingIdx(null); setCzTargetId(null); return; }
    setPickingIdx(i);
    setToBottom([]);
    setTopOrder([]);
    // Auto-select the first valid CZ target if exactly one exists
    const bonus = BONUSES[cls];
    if (bonus?.czFilter) {
      const validCZ = ps.classZone.filter(c => !c.faceDown && bonus.czFilter!(c.name, c.cls));
      setCzTargetId(validCZ.length === 1 ? validCZ[0].id : null);
    } else if (bonus?.mode === 'view-deck') {
      // Seed the top-order list with the looked-at cards in current deck order.
      const owner = bonus.deckOwner === 'opponent' ? (player === 'p1' ? 'p2' : 'p1') : player;
      setTopOrder(game[owner].deck.slice(0, 2).map(c => c.id));
      setCzTargetId(null);
    } else {
      setCzTargetId(null);
    }
  };

  // Move a looked-at card earlier/later in the top order (view-deck reorder).
  const moveTop = (id: string, dir: -1 | 1) => setTopOrder(o => {
    const idx = o.indexOf(id), j = idx + dir;
    if (idx < 0 || j < 0 || j >= o.length) return o;
    const n = [...o]; [n[idx], n[j]] = [n[j], n[idx]]; return n;
  });

  const itemStyle = (isDone: boolean, isPicking: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'flex-start', gap: 14,
    padding: '12px 14px', borderRadius: 9, marginBottom: 8,
    background: isPicking ? 'rgba(214,160,80,0.08)' : 'rgba(255,255,255,0.025)',
    border: `1px solid ${isPicking ? TBL.matLine2 : TBL.matLine}`,
    opacity: isDone ? 0.6 : 1,
  });

  const cardHoverStyle: CSSProperties = { cursor: 'pointer', transition: 'transform .12s' };
  const arrowBtn: CSSProperties = {
    cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1,
    color: TBL.ink, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TBL.matLine2}`,
    borderRadius: 4, padding: '3px 7px',
  };

  return (
    <ModalShell
      glyph="✦" color={TBL.violet}
      eyebrow={`Setup · ${player.toUpperCase()} Class Bonuses`}
      title={`${seatName(player, localPlayer)} — Apply Class Bonuses`}
      sub="One bonus per class in your Class Zone. Apply in any order — each is optional."
      footer={
        <>
          <span style={md.costNote}>{Object.keys(resolved).length} / {czClasses.length} resolved</span>
          <div style={md.spacer} />
          <button style={md.btn(allDone ? 'primary' : 'ghost')} onClick={onClose}>
            {allDone ? (isSequence ? 'Continue ›' : 'Begin encounter') : 'Skip'}
          </button>
        </>
      }
    >
      {czClasses.map((cls, i) => {
        const bonus     = BONUSES[cls];
        const clr       = CLASSCLR[cls] ?? TBL.ink3;
        const res       = resolved[i];
        const isPicking = pickingIdx === i;

        // CZ swap bonuses: find valid targets
        const validCzTargets = bonus?.czFilter
          ? ps.classZone.filter(c => !c.faceDown && bonus.czFilter!(c.name, c.cls))
          : [];
        const hasCzFilter     = !!bonus?.czFilter;
        const noCzTarget      = hasCzFilter && validCzTargets.length === 0;

        // view-deck: whose deck
        const deckOwnerKey = bonus?.mode === 'view-deck'
          ? (bonus.deckOwner === 'opponent' ? (player === 'p1' ? 'p2' : 'p1') : player)
          : null;
        const deckPreview = isPicking && deckOwnerKey ? game[deckOwnerKey].deck.slice(0, 2) : [];

        return (
          <div key={cls}>
            {/* ── Bonus header row ── */}
            <div style={itemStyle(!!res, isPicking)}>
              <div style={{
                width: 42, height: 42, borderRadius: 9, flexShrink: 0,
                background: `${clr}22`, border: `1px solid ${clr}66`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: clr, fontFamily: "'Newsreader', serif",
              }}>
                {GLYPH[cls] ?? '◆'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Newsreader', serif", fontSize: 17, color: TBL.ink, fontWeight: 600 }}>{cls}</div>
                {bonus && (
                  <>
                    <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 13, color: TBL.amber2, marginTop: 1 }}>
                      "{bonus.name}"
                    </div>
                    <div style={{ fontSize: 12.5, color: TBL.ink2, lineHeight: 1.4, marginTop: 3, fontFamily: "'Inter', sans-serif" }}>
                      {bonus.desc}
                    </div>
                    {/* Warning: no valid CZ target */}
                    {!res && hasCzFilter && noCzTarget && (
                      <div style={{
                        marginTop: 5, padding: '4px 9px', borderRadius: 5,
                        background: 'rgba(224,106,106,0.1)', border: `1px solid ${TBL.danger}44`,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.danger,
                      }}>
                        ⚠ No {bonus.czTypeLabel} card in your Class Zone — swap not available
                      </div>
                    )}
                  </>
                )}
                {res && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TBL.good, marginTop: 4 }}>
                    {res.kind === 'applied' ? `✓ ${res.result}` : '— Skipped'}
                  </div>
                )}
              </div>

              {!res && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
                  <button style={md.btn('ghost')} onClick={() => skipBonus(i)}>Skip</button>
                  <button
                    style={{ ...md.btn('primary'), opacity: noCzTarget ? 0.38 : 1, cursor: noCzTarget ? 'not-allowed' : 'pointer' }}
                    onClick={() => !noCzTarget && (!bonus || bonus.mode === 'instant' ? applyBonus(i, cls) : openPicker(i, cls))}
                    title={noCzTarget ? `No ${bonus?.czTypeLabel} in your Class Zone` : ''}
                  >
                    {!bonus || bonus.mode === 'instant' ? 'Apply' : 'Choose…'}
                  </button>
                </div>
              )}
              {res && (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, flexShrink: 0,
                  color: res.kind === 'applied' ? TBL.good : TBL.ink3,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  {res.kind === 'applied' ? '✓ Applied' : 'Skipped'}
                </div>
              )}
            </div>

            {/* ── pick-hand picker (Bard: hand only; Warrior/Druid/Builder: CZ target + hand) ── */}
            {isPicking && !res && bonus?.mode === 'pick-hand' && (
              <div style={{
                margin: '2px 0 12px', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(214,160,80,0.05)', border: `1px solid ${TBL.matLine2}`,
                display: 'flex', flexDirection: 'column', gap: 14,
              }}>

                {/* CZ target section (Warrior / Druid / Builder only) */}
                {hasCzFilter && (
                  <div>
                    <div style={{ ...md.sectionLbl, marginBottom: 8 }}>
                      {bonus.czTypeLabel} leaving your Class Zone
                      {validCzTargets.length > 1 && ' — click to select target'}
                      <div style={md.sectionLine} />
                    </div>
                    {validCzTargets.length === 0 ? (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.danger }}>
                        No {bonus.czTypeLabel} in your Class Zone
                      </span>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {validCzTargets.map(cz => {
                          const czCard = CATALOG.find(c => c.name === cz.name);
                          const isSelected = czTargetId === cz.id;
                          if (!czCard) return null;
                          return (
                            <div
                              key={cz.id}
                              onClick={() => setCzTargetId(cz.id)}
                              style={{
                                cursor: 'pointer', position: 'relative',
                                outline: isSelected ? `2px solid ${TBL.danger}` : `1px solid ${TBL.matLine2}`,
                                borderRadius: 10,
                                filter: isSelected ? 'none' : 'brightness(0.65)',
                                transition: 'filter .12s',
                              }}
                            >
                              <CardFace data={czCard} scale={0.48} />
                              <div style={{
                                position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                                color: '#fff', background: isSelected ? TBL.danger : TBL.ink3,
                                padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap',
                              }}>
                                {isSelected ? '← LEAVES CZ' : 'click to select'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Hand section */}
                <div>
                  <div style={{ ...md.sectionLbl, marginBottom: 8 }}>
                    {hasCzFilter ? 'Your hand — click a card to swap into the Class Zone' : 'Your hand — click a card to use'}
                    <div style={md.sectionLine} />
                    {hasCzFilter && !czTargetId && validCzTargets.length > 1 && (
                      <span style={{ color: TBL.amber2, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                        Select a CZ target above first
                      </span>
                    )}
                  </div>
                  {ps.hand.length === 0 && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink4 }}>Hand is empty</span>
                  )}
                  <div style={md.cardRow}>
                    {ps.hand.map(card => {
                      const disabled = hasCzFilter && !czTargetId;
                      return (
                        <div
                          key={card.id}
                          onClick={() => !disabled && applyBonus(i, cls, card, czTargetId ?? undefined)}
                          style={{
                            ...cardHoverStyle,
                            opacity: disabled ? 0.4 : 1,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={e => !disabled && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-6px)')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = '')}
                        >
                          <CardFace data={card} scale={0.46} hoverable={!disabled} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button style={{ ...md.btn('ghost'), alignSelf: 'flex-start' }} onClick={() => openPicker(i, cls)}>Cancel</button>
              </div>
            )}

            {/* ── view-deck picker (Wizard / Doom-Whisperer) ── */}
            {isPicking && !res && bonus?.mode === 'view-deck' && (
              <div style={{
                margin: '2px 0 12px', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(138,122,214,0.05)', border: `1px solid ${TBL.violet}55`,
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ ...md.sectionLbl, color: TBL.violet }}>
                  Top {deckPreview.length} card{deckPreview.length !== 1 ? 's' : ''} of {bonus.deckOwner === 'opponent' ? "opponent's" : 'your'} deck — click to bottom; arrows set the top order (1 = drawn first)
                  <div style={md.sectionLine} />
                </div>
                {deckPreview.length === 0 && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink4 }}>Deck is empty</span>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {(() => {
                    const ordered = topOrder.length
                      ? topOrder.map(id => deckPreview.find(c => c.id === id)).filter((c): c is Card => !!c)
                      : deckPreview;
                    const keptCount = ordered.filter(c => !toBottom.includes(c.id)).length;
                    let topN = 0;
                    return ordered.map(card => {
                      const marked = toBottom.includes(card.id);
                      const rank = marked ? null : ++topN;
                      return (
                        <div key={card.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div
                            onClick={() => setToBottom(ids => ids.includes(card.id) ? ids.filter(x => x !== card.id) : [...ids, card.id])}
                            style={{
                              cursor: 'pointer', position: 'relative',
                              transform: marked ? 'translateY(8px)' : 'none',
                              transition: 'transform .14s',
                              filter: marked ? 'brightness(0.6)' : 'none',
                              outline: marked ? `2px solid ${TBL.danger}` : 'none',
                              borderRadius: 10,
                            }}
                          >
                            <CardFace data={card} scale={0.52} />
                            <div style={{
                              position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                              color: '#fff', background: marked ? TBL.danger : TBL.violet,
                              padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap',
                            }}>
                              {marked ? '↓ BOTTOM' : `TOP ${rank}`}
                            </div>
                          </div>
                          {!marked && keptCount > 1 && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button style={arrowBtn} onClick={() => moveTop(card.id, -1)} title="Move earlier (toward top)">◀</button>
                              <button style={arrowBtn} onClick={() => moveTop(card.id, 1)} title="Move later">▶</button>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={md.btn('ghost')} onClick={() => openPicker(i, cls)}>Cancel</button>
                  <button style={md.btn('primary')} onClick={() => applyBonus(i, cls, undefined, undefined, toBottom, topOrder)}>
                    Confirm order
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </ModalShell>
  );
}
