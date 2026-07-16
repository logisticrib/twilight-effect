// Master of Foundations — "REINFORCE 3. When this enters play, add 3 Anchor
// counters to target Physical Construct. Your Physical Constructs do not lose
// Anchor counters at the start of your turn."
// PINNED 2026-07-15 to CORRECT the arc-5 sweep finding: this card is NOT a
// Grudrik-shaped partial. Its enter sentence is the REINFORCE 3 reminder text —
// implemented via the KEYWORD path (parseEnterTrigger → pendingTrigger →
// resolveTrigger), not via a structured op; the decay-prevention sentence is the
// static preventAnchorDecay op. Canon REINFORCE N (quoted verbatim): "When this
// enters play, add N Anchor counters to target Physical Construct you control."
// — own-side targeting, which the keyword machinery honors.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkConstruct, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';

const czCards = CATALOG.slice(20, 25);
const mof = CATALOG.find(c => c.name === 'Master of Foundations')!;

describe('Master of Foundations — Reinforce 3 via the KEYWORD path (not a partial implementation)', () => {
  it('entering arms the Reinforce prompt over OWN Physical Constructs only; resolving adds 3 anchors', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, hand: [mof], deck: CATALOG.slice(30, 33),
        board: { f1: mkConstruct('own-bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) },
        classZone: czCards.map((c, i) => mkCz(c, 'Builder', `cz-${i}`)), willpower: 5 },
      p2: { ...s.game.p2, board: { f1: mkConstruct('opp-bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) }, hand: [] },
    } }));
    gs.getState().beginPlay(mof.id);
    gs.getState().placeCard('b1');
    const pt = gs.getState().pendingTrigger;
    expect(pt, 'Reinforce prompt armed on enter (keyword-parsed, no structured op needed)').toBeTruthy();
    expect(pt?.kind).toBe('reinforce');
    expect(pt?.n, 'N = 3 from "Reinforce 3"').toBe(3);
    expect(pt?.eligibleIds, 'canon "you control": own construct only, never the opponent\'s').toEqual(['own-bw']);

    gs.getState().resolveTrigger('own-bw');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.anchors, '2 + 3 = 5 (and above printed — no cap, R1 2026-07-15)').toBe(5);
    expect(gs.getState().pendingTrigger, 'prompt cleared').toBeNull();
  });
});
