// On-sacrifice triggers (capability arc 5 — FINAL, owner-ratified 2026-07-15) —
// Siegeworks. Canon, verbatim (reworded this arc, owner 2026-07-15): "When one of
// your Physical Constructs is sacrificed, draw a card."
// R2 (existing canon, load-bearing): decay IS sacrifice — "Remove one counter at the
// beginning of each turn; sacrifice when last removed." The trigger fires on every
// event canon words as sacrifice (decay, Dismantle, sacrifice costs, trap
// self-sacrifice, Coercion) regardless of who caused it — and NEVER on destruction
// by damage (the cause is threaded through destroyEntity, not inferred from death).
// R3: the sacrificed permanent's OWN listener fires (gathered at event time,
// resolved after it leaves — 2026-07-12 queued-trigger canon).
// R1: there is no maximum number of Anchor counters (pinned here via Reinforce
// raising counters above the printed value — no clipping anywhere).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkCz } from './helpers';
import { applyDamage } from '../engine';
import { CATALOG } from '../data/catalog';

const czCards = CATALOG.slice(20, 25);
const siege = (id: string) => mkConstruct(id, 'Siegeworks', 4, { subtype: 'Fortification' });
const spark = (id: string) => mkConstruct(id, 'Lingering Spark', 1, { subtype: 'Incantation' });
/** A no-effects Physical Construct (Trap subtype) with the given anchors. */
const bulwark = (id: string, anchors: number) => mkConstruct(id, 'Reinforced Gate', anchors, { subtype: 'Fortification' });

/** p1 board seeded, action phase, known deck for draw counting. */
function seed(p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: p1Board, deck: CATALOG.slice(30, 36), hand: [],
      classZone: czCards.map((c, i) => mkCz(c, 'Wizard', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [], deck: CATALOG.slice(40, 46) },
  } }));
}
const p1 = () => gs.getState().game.p1;

describe('Siegeworks — "When one of your Physical Constructs is sacrificed, draw a card."', () => {
  it('draws on natural Anchor decay of another Physical Construct (decay IS sacrifice — R2)', () => {
    // p1 ends their turn; p2 is the readied player — put Siegeworks + a decaying
    // 1-anchor Physical Construct on p2's side.
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, board: { f1: siege('sw-1'), f2: bulwark('bw-1', 1) }, deck: CATALOG.slice(40, 46), hand: [] },
    } }));
    const handBefore = gs.getState().game.p2.hand.length;
    const deckBefore = gs.getState().game.p2.deck.length;
    gs.getState().endTurn();
    const g = gs.getState().game;
    expect(g.p2.board.f2, 'the 1-anchor construct decayed out').toBeUndefined();
    expect(g.p2.board.f1?.anchors, 'Siegeworks itself decayed 4 → 3').toBe(3);
    // Ready-phase listener draw + the normal turn draw = 2 cards.
    expect(g.p2.hand.length, 'listener draw AND turn draw').toBe(handBefore + 2);
    expect(g.p2.deck.length).toBe(deckBefore - 2);
  });

  it('R3: fires on its OWN decay — Siegeworks crumbling draws its controller a card', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, board: { f1: { ...siege('sw-1'), anchors: 1 } }, deck: CATALOG.slice(40, 46), hand: [] },
    } }));
    gs.getState().endTurn();
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'Siegeworks decayed out').toBeUndefined();
    expect(g.p2.dead.map(c => c.name), 'to the Dead Zone').toContain('Siegeworks');
    expect(g.p2.hand.length, 'its own sacrifice drew (R3) + turn draw').toBe(2);
  });

  it('draws on an opponent-caused Dismantle-style sacrifice (anchor drain to zero — "regardless of which player caused it")', () => {
    // p2 drains the last anchors off p1's Physical Construct via the real
    // action-target path (the interpreter anchor op with negative delta).
    seed({ f1: siege('sw-1'), f2: bulwark('bw-1', 1) });
    const handBefore = p1().hand.length;
    gs.setState({ localPlayer: 'p2', pendingActionTarget: { source: 'action', sourceName: 'Test Dismantle', lp: 'p2',
      effects: [{ op: 'anchor', delta: -1, target: 'anyConstruct' }], eligibleIds: ['bw-1'] } });
    gs.getState().resolveActionTarget('bw-1');
    gs.setState({ localPlayer: 'p1' });
    const g = gs.getState().game;
    expect(g.p1.board.f2, 'construct sacrificed by the drain').toBeUndefined();
    expect(g.p1.hand.length, "Siegeworks drew for its controller (p1), not the causer").toBe(handBefore + 1);
  });

  it('draws on arc-1 trap self-sacrifice (Tripwire fires and sacrifices itself mid-stack)', () => {
    // p1 plays a companion into p2's Tripwire; p2 also controls Siegeworks. The
    // Tripwire's self-sacrifice is a sacrifice of one of p2's Physical Constructs.
    freshGame();
    const card = { id: 'hc-1', name: 'Sturdy Recruit', level: 1, type: 'Companion', subtype: '', rarity: 'Common',
      class1: 'Wizard', class2: '', attack: 2, hp: 3, anchor: null, actionSub: '', actionPM: '', itemKind: '',
      keywords: [], text: '', flavor: '' } as never;
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, hand: [card], deck: CATALOG.slice(30, 33),
        classZone: czCards.map((c, i) => mkCz(c, 'Wizard', `cz-${i}`)), willpower: 5, board: {} },
      p2: { ...s.game.p2, board: { f1: mkConstruct('tw-1', 'Tripwire Snare', 2, { subtype: 'Trap' }), f2: siege('sw-1') }, deck: CATALOG.slice(40, 46), hand: [] },
    } }));
    gs.getState().beginPlay('hc-1');
    gs.getState().placeCard('b1');
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'Tripwire sacrificed itself').toBeUndefined();
    expect(g.p2.hand.length, "p2's Siegeworks drew on the trap's self-sacrifice").toBe(1);
    expect(g.triggerStack ?? undefined, 'stack drained').toBeUndefined();
  });

  it('does NOT trigger on an Incantation (Magical Construct) sacrifice, on OPPOSING Physical sacrifices, or on damage-destruction', () => {
    // Incantation drained to zero → sacrifice, but not Physical → no draw.
    seed({ f1: siege('sw-1'), f2: spark('sp-1') });
    let handBefore = p1().hand.length;
    gs.setState({ pendingActionTarget: { source: 'action', sourceName: 'Test Drain', lp: 'p1',
      effects: [{ op: 'anchor', delta: -1, target: 'anyConstruct' }], eligibleIds: ['sp-1'] } });
    gs.getState().resolveActionTarget('sp-1');
    expect(gs.getState().game.p1.board.f2, 'Incantation sacrificed').toBeUndefined();
    expect(p1().hand.length, 'no draw — not a Physical Construct').toBe(handBefore);

    // Opposing Physical Construct sacrificed → the OPPONENT's construct, not "yours".
    seed({ f1: siege('sw-1') }, { f1: bulwark('opp-bw', 1) });
    handBefore = p1().hand.length;
    gs.setState({ pendingActionTarget: { source: 'action', sourceName: 'Test Drain', lp: 'p1',
      effects: [{ op: 'anchor', delta: -1, target: 'anyConstruct' }], eligibleIds: ['opp-bw'] } });
    gs.getState().resolveActionTarget('opp-bw');
    expect(gs.getState().game.p2.board.f1, "opponent's construct sacrificed").toBeUndefined();
    expect(p1().hand.length, "no draw — it wasn't YOURS").toBe(handBefore);

    // Damage-destruction (no sacrifice cause): kill p1's own Physical Construct via
    // the real damage chokepoint — no draw. (No shipped card damages constructs, so
    // the cause-gate is pinned at the engine chokepoint directly.)
    seed({ f1: siege('sw-1'), f2: { ...bulwark('bw-1', 2), hp: 1 } });
    handBefore = p1().hand.length;
    gs.setState(s => ({ game: applyDamage(s.game, 'bw-1', 5, 'Test Blast', 'p2').game }));
    expect(gs.getState().game.p1.board.f2, 'construct destroyed by damage').toBeUndefined();
    expect(p1().hand.length, 'no draw — destruction by damage is not a sacrifice').toBe(handBefore);
  });

  it('two Siegeworks stack: each draws per sacrifice (two draws), in deterministic slot order', () => {
    seed({ f1: siege('sw-1'), f2: siege('sw-2'), f3: bulwark('bw-1', 1) });
    const handBefore = p1().hand.length;
    gs.setState({ pendingActionTarget: { source: 'action', sourceName: 'Test Drain', lp: 'p1',
      effects: [{ op: 'anchor', delta: -1, target: 'anyConstruct' }], eligibleIds: ['bw-1'] } });
    gs.getState().resolveActionTarget('bw-1');
    expect(p1().hand.length, 'both listeners drew').toBe(handBefore + 2);
  });

  it('sacrificeSelf activated cost fires it (sandbox ✕-sacrifice path)', () => {
    seed({ f1: siege('sw-1'), f2: bulwark('bw-1', 3) });
    const handBefore = p1().hand.length;
    gs.getState().sacrificeEntity('bw-1');
    expect(gs.getState().game.p1.board.f2, 'sacrificed').toBeUndefined();
    expect(p1().hand.length, 'Siegeworks drew').toBe(handBefore + 1);
  });
});

describe('R1 — there is no maximum number of Anchor counters', () => {
  it('Reinforce-style anchor adds raise counters ABOVE the printed value — no clipping anywhere', () => {
    seed({ f1: { ...bulwark('bw-1', 4), anchorsStart: 4 } }); // printed anchor 4
    gs.setState({ pendingActionTarget: { source: 'action', sourceName: 'Test Reinforce', lp: 'p1',
      effects: [{ op: 'anchor', delta: 3, target: 'anyConstruct' }], eligibleIds: ['bw-1'] } });
    gs.getState().resolveActionTarget('bw-1');
    const ent = gs.getState().game.p1.board.f1;
    expect(ent?.anchors, '4 + 3 = 7, above the printed 4').toBe(7);
    expect(ent?.anchorsStart, 'printed value untouched').toBe(4);
  });
});
