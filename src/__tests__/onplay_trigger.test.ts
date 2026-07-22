// On-play triggers (capability arc 4, owner-ratified 2026-07-15) — Patient Conjurer.
// Canon, verbatim: "When you play a Magical Construct, this character heals 1."
// R1 (2026-07-15): "Playing" a card means playing it FROM HAND, universally —
// conversions, placements, and every other entry-into-play route never emit a play
// event (generalizes the 2026-07-04 Paranoia-specific ruling).
// Cited existing canon exercised here (no new notes needed):
//   - Trigger Stack (2026-07-12): the on-play trigger queues ABOVE the played card
//     and resolves BEFORE it enters — "plays" and "enters" are distinct events.
//   - Mandatory triggers (2026-07-12): no "may" — fires even at full HP (heal no-ops).
//   - Queued-trigger survival (2026-07-12): a queued trigger resolves even if its
//     source left play; with the source gone the heal does nothing.
import { describe, it, expect, afterEach } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const czCards = CATALOG.slice(20, 25);

/** Synthetic hand card (real placeCard path). */
const mkHandCard = (id: string, name: string, type: 'Construct' | 'Companion', subtype: string): Card => ({
  id, name, level: 1, type, subtype, rarity: 'Common', class1: 'Wizard', class2: '',
  attack: type === 'Companion' ? 2 : 0, hp: type === 'Companion' ? 3 : 0,
  anchor: type === 'Construct' ? 2 : null, actionSub: '', actionPM: '', itemKind: '',
  keywords: [], text: '', flavor: '',
} as unknown as Card);

const incantation = (id = 'hc-inc') => mkHandCard(id, 'Test Incantation', 'Construct', 'Incantation');
const conjurer = (id: string, hp: number) =>
  mkComp(id, 'Patient Conjurer', { cls: 'Wizard', hp, maxHp: 3, atk: 1, keywords: ['Ranged'] });

/** p1 holds `hand`, boards as given; Wizard CZ so Wizard cards are playable. */
function seed(hand: Card[], p1Board: Record<string, ReturnType<typeof mkComp>> = {}, p2Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand, deck: CATALOG.slice(30, 33), board: p1Board,
      classZone: czCards.map((c, i) => mkCz(c, 'Wizard', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [] },
  } }));
}
const play = (card: Card, slot: string) => { gs.getState().beginPlay(card.id); gs.getState().placeCard(slot as never); };

afterEach(() => {
  // Synthetic CATALOG pushes are cleaned per test (ability_sweep discipline).
  const i = CATALOG.findIndex(c => c.id === 'syn-onplay-listener');
  if (i >= 0) CATALOG.splice(i, 1);
});

describe('Patient Conjurer — "When you play a Magical Construct, this character heals 1."', () => {
  it('heals 1 when its controller plays a Magical Construct from hand (toast names the source)', () => {
    seed([incantation()], { b1: conjurer('pc-1', 2) });
    play(incantation(), 'f1');
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, '2 → 3').toBe(3);
    expect(g.p1.board.f1?.name, 'the construct entered').toBe('Test Incantation');
    expect(g.triggerStack ?? undefined, 'stack drained (fixture-hash invariant)').toBeUndefined();
    expect(gs.getState().toasts.some(t => t.msg.includes('Patient Conjurer triggers')), 'no silent outcomes').toBe(true);
  });

  it('mandatory: fires as a no-op at full HP (toast still surfaces, HP capped at max)', () => {
    seed([incantation()], { b1: conjurer('pc-1', 3) });
    play(incantation(), 'f1');
    expect(gs.getState().game.p1.board.b1?.hp, 'capped at max — no overheal').toBe(3);
    expect(gs.getState().toasts.some(t => t.msg.includes('Patient Conjurer triggers')), 'mandatory trigger still fired').toBe(true);
  });

  it('"you" — does NOT trigger when the OPPONENT plays a Magical Construct', () => {
    seed([], { b1: conjurer('pc-1', 2) });
    gs.setState(s => ({ localPlayer: 'p2' as const, game: { ...s.game,
      p2: { ...s.game.p2, hand: [incantation('hc-opp')], deck: CATALOG.slice(35, 38),
        classZone: czCards.map((c, i) => mkCz(c, 'Wizard', `czb-${i}`)), willpower: 5 } } }));
    gs.getState().beginPlay('hc-opp');
    gs.getState().placeCard('f1');
    gs.setState({ localPlayer: 'p1' });
    const g = gs.getState().game;
    expect(g.p2.board.f1?.name, "opponent's construct entered").toBe('Test Incantation');
    expect(g.p1.board.b1?.hp, "opponent's play never heals the Conjurer").toBe(2);
  });

  it('R1 — an Animate Magic conversion is NOT "playing" a construct (real interpreter path, no event)', () => {
    // Conversion turns an on-board Incantation into a companion — nothing is played
    // from hand, so no on-play event may fire. (It converts AWAY from construct;
    // the point is the CONVERSION route emits no play event of any kind.)
    seed([], { b1: conjurer('pc-1', 2), f1: mkConstruct('inc-1', 'Test Incantation', 2, { subtype: 'Incantation' }) });
    gs.setState({ pendingActionTarget: { source: 'action', sourceName: 'Test Animate', lp: 'p1',
      effects: [{ op: 'animate', atk: 2, hp: 2, target: 'magicalConstruct' }], eligibleIds: ['inc-1'] } });
    gs.getState().resolveActionTarget('inc-1');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.kind, 'conversion happened (construct → companion)').toBe('companion');
    expect(g.p1.board.b1?.hp, 'no heal — a conversion is not a play (R1)').toBe(2);
  });

  it('filter — does NOT trigger on a non-Magical construct play or a companion play', () => {
    seed([mkHandCard('hc-trap', 'Test Trap', 'Construct', 'Trap')], { b1: conjurer('pc-1', 2) });
    play(mkHandCard('hc-trap', 'Test Trap', 'Construct', 'Trap'), 'f1');
    expect(gs.getState().game.p1.board.b1?.hp, 'Physical construct play: no heal').toBe(2);

    seed([mkHandCard('hc-comp', 'Test Recruit', 'Companion', 'Human Wizard')], { b1: conjurer('pc-1', 2) });
    play(mkHandCard('hc-comp', 'Test Recruit', 'Companion', 'Human Wizard'), 'b2');
    expect(gs.getState().game.p1.board.b1?.hp, 'companion play: no heal').toBe(2);
  });

  it('stack order (2026-07-12 canon): the on-play trigger resolves BEFORE the construct enters', () => {
    // Synthetic listener whose effect is gated on "controls an Incantation": if the
    // trigger resolved AFTER the enter, the condition would be TRUE and it would
    // draw. Resolving BEFORE the enter (correct), the player controls no
    // Incantation yet → the draw does not happen. Real placeCard path throughout.
    CATALOG.push({ id: 'syn-onplay-listener', name: 'Order Probe', level: 1, type: 'Construct',
      subtype: 'Incantation', rarity: 'Common', class1: 'Wizard', class2: '', attack: 0, hp: 0,
      anchor: 2, actionSub: '', actionPM: '', itemKind: '', keywords: [], text: '', flavor: '',
      effects: [{ trigger: 'ownPlaysMagicalConstruct', effects: [{ op: 'draw', count: 1, if: { kind: 'controlsType', cardType: 'Construct', subtype: 'Incantation' } }] }],
    } as unknown as Card);
    // The board listener entity carries subtype 'Trap' (conditions read BOARD
    // entities), so the PLAYED card is the only Incantation anywhere — the
    // condition can only become true by the construct entering.
    seed([incantation()], { b2: mkConstruct('probe', 'Order Probe', 2, { subtype: 'Trap' }) });
    const deckBefore = gs.getState().game.p1.deck.length;
    play(incantation(), 'f1');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.name, 'construct entered after resolution').toBe('Test Incantation');
    expect(g.p1.deck.length, 'no draw: at resolution the construct had NOT entered yet').toBe(deckBefore);
  });

  it('two listeners queue the OWNER ordering prompt (2026-07-22 — here the owner IS the placer, unchanged; identical triggers still actively ordered); a queued trigger from a departed listener still resolves as a no-op', () => {
    seed([incantation()], { b1: conjurer('pc-1', 2), b2: conjurer('pc-2', 2) });
    play(incantation(), 'f1');
    let g = gs.getState().game;
    expect(g.pendingTriggerOrder, '>1 simultaneous play-window trigger → ordering prompt').toBeTruthy();
    expect(g.pendingTriggerOrder?.items.length).toBe(2);
    expect(g.p1.board.f1, 'nothing entered while ordering is open').toBeUndefined();
    // The first-picked listener leaves before resolution completes: sacrifice pc-1
    // mid-ordering, then order pc-1 first — its heal no-ops (source gone, R1
    // 2026-07-12 survival), pc-2 still heals.
    gs.getState().sacrificeEntity('pc-1');
    const idx1 = gs.getState().game.pendingTriggerOrder!.items.findIndex(i => i.kind === 'reactive' && i.sourceId === 'pc-1');
    gs.getState().resolveTriggerOrder(idx1);
    g = gs.getState().game;
    expect(g.pendingTriggerOrder ?? undefined, 'order complete (last implied) — stack ran').toBeUndefined();
    expect(g.p1.board.b1, 'pc-1 left play').toBeUndefined();
    expect(g.p1.board.b2?.hp, 'the surviving listener healed').toBe(3);
    expect(g.p1.board.f1?.name, 'construct entered at the bottom of the stack').toBe('Test Incantation');
  });

  it('interop with arc-1 windows: a companion play trips enter-traps but never the on-play listener; a construct play trips the listener but no companion-scoped trap', () => {
    // Companion play with an opposing Tripwire: trap fires, Conjurer silent.
    seed([mkHandCard('hc-comp', 'Test Recruit', 'Companion', 'Human Wizard')],
      { b1: conjurer('pc-1', 2) }, { f1: mkConstruct('tw-1', 'Tripwire Snare', 2, { subtype: 'Trap' }) });
    play(mkHandCard('hc-comp', 'Test Recruit', 'Companion', 'Human Wizard'), 'b2');
    let g = gs.getState().game;
    expect(g.p1.board.b2?.hp, 'Tripwire hit the entering companion (3 − 1)').toBe(2);
    expect(g.p1.board.b1?.hp, 'Conjurer silent on a companion play').toBe(2);
    expect(g.p2.board.f1, 'Tripwire self-sacrificed').toBeUndefined();

    // Construct play with an opposing Tripwire still standing: listener fires,
    // trap does NOT (all three arc-1 trap windows are companion-scoped).
    seed([incantation()], { b1: conjurer('pc-1', 2) }, { f1: mkConstruct('tw-2', 'Tripwire Snare', 2, { subtype: 'Trap' }) });
    play(incantation(), 'f1');
    g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'Conjurer healed on the construct play').toBe(3);
    expect(g.p2.board.f1?.name, 'Tripwire untouched — constructs do not trip companion-enter traps').toBe('Tripwire Snare');
  });
});
