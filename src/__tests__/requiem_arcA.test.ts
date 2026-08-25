// REQUIEM deck — Arc A (mill + ENTOMB + the deck-out loss), 2026-08-25.
// Four cards convert from DEV NOT-IMPLEMENTED to live: Gravegnaw Rat (Entomb 1),
// Palegrove Gravekeeper (Scavenger + Entomb 2 — the owner-ordered multi-pending
// probe), Tomb Chanter (startOfTurn self-mill) and Grave Whispers (mill 2 + draw 1).
// Marrowlight Lich's flag NARROWS to the Haunt half.
//
// RULES UNDER TEST:
// - ENTOMB N (MKL, owner-ratified 2026-08-25): on enter, put the top N cards of
//   YOUR deck into YOUR Dead Zone; all remaining when short; the milled cards are
//   ordinary Dead Zone residents.
// - THE DECK-OUT LOSS (owner-ruled 2026-08-25, canon GRU:158 / CDP §6): ANY
//   mandatory draw attempted while the deck is empty loses the game — the Draw
//   Phase draw AND effect draws. Partial first: "draw 2" with 1 left draws 1,
//   then loses. MILLING an empty deck is NOT a loss (the loss is tied to draws).
// - Same-owner simultaneous enter triggers are ordered by their OWNER (2026-07-22),
//   each unit evaluated FRESH as of its resolution (per-event state, 2026-07-21):
//   Entomb-before-Scavenger can mill an item Scavenger then offers.
// Assertions read real state (deck/dead/gameOver), never toasts alone (arc-C lesson).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz } from './helpers';
import { resolveActionEffects } from '../store/gameStore';
import { resolveStartOfTurn } from '../engine';
import { CATALOG, REQUIEM_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';
import type { SlotId } from '../engine';

const rc = (name: string): Card => {
  const c = REQUIEM_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`Requiem card missing: ${name}`);
  return c;
};

const czCards = CATALOG.slice(20, 25);
const czFor = (cls: string) => czCards.map((c, i) => mkCz(c, cls, `cz-${i}`));

function seedP1(over: { hand?: Card[]; board?: Record<string, ReturnType<typeof mkComp>>; dead?: Card[]; deck?: Card[] }) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: over.board ?? { b3: mkPc('pc-1') },
      dead: over.dead ?? [], deck: over.deck ?? [], classZone: czFor('Necromancer'), willpower: 5 },
    p2: { ...s.game.p2, board: { b2: mkPc('pc-2') } },
  } }));
}
const g = () => gs.getState().game;
const place = (card: Card, slot: SlotId) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};
// Known deck fodder: an ITEM card first (the Scavenger-collision prop), then filler.
const itemCard = CATALOG.find(c => c.type === 'Item')!;
const filler = CATALOG.filter(c => c.type === 'Companion' && !c.dev).slice(0, 6);

describe('ENTOMB N — self-mill on enter (Gravegnaw Rat, single-unit inline path)', () => {
  it('mills exactly N from the top, in order, into the OWN Dead Zone; the deck shrinks; the companion still enters', () => {
    const [A, B, C] = filler;
    seedP1({ deck: [A, B, C] });
    place(rc('Gravegnaw Rat'), 'b1');
    expect(g().p1.board.b1?.name, 'the Rat entered').toBe('Gravegnaw Rat');
    expect(g().p1.deck.map(c => c.id), 'top card left the deck').toEqual([B.id, C.id]);
    expect(g().p1.dead.map(c => c.id), 'the milled card is in the Dead Zone').toEqual([A.id]);
    expect(g().p2.dead, "the opponent's Dead Zone is untouched").toEqual([]);
    expect(g().gameOver, 'milling never ends the game').toBeNull();
  });

  it('empty deck: Entomb fires and no-ops (R4) — mills nothing, loses nothing, the companion enters', () => {
    seedP1({ deck: [] });
    place(rc('Gravegnaw Rat'), 'b1');
    expect(g().p1.board.b1?.name).toBe('Gravegnaw Rat');
    expect(g().p1.dead).toEqual([]);
    expect(g().gameOver, 'milling an empty deck is NOT a loss — only draws lose').toBeNull();
  });

  it('partial mill: Entomb 2 with 1 card left mills that 1 (Marrowlight Lich — its Entomb half is live, its Haunt half stays flagged)', () => {
    const [A] = filler;
    seedP1({ deck: [A] });
    place(rc('Marrowlight Lich'), 'b1');
    expect(g().p1.board.b1?.name).toBe('Marrowlight Lich');
    expect(g().p1.deck).toEqual([]);
    expect(g().p1.dead.map(c => c.id)).toEqual([A.id]);
    expect(g().gameOver).toBeNull();
  });
});

describe('Palegrove Gravekeeper — Entomb 2 + Scavenger share the enter window (Arc G: owner-ordered, evaluated fresh)', () => {
  // enterUnitsOf pushes ['scavenger', 'entomb'] for this card; the owner's blind
  // picks decide the order; picked-first resolves FIRST (queued last, LIFO).
  it('arms the owner ordering prompt with both units', () => {
    seedP1({ deck: [itemCard, ...filler.slice(0, 2)] });
    place(rc('Palegrove Gravekeeper'), 'b1');
    const po = g().pendingTriggerOrder;
    expect(po?.lp, 'the OWNER orders their own simultaneous triggers (2026-07-22)').toBe('p1');
    expect(po?.items.map(i => i.kind === 'enterUnit' ? i.unit : i.kind).sort()).toEqual(['entomb', 'scavenger']);
  });

  it('Entomb FIRST: the mill puts an Item into the Dead Zone, and Scavenger — evaluated fresh — offers that very item', () => {
    seedP1({ deck: [itemCard, filler[0], filler[1]] });
    place(rc('Palegrove Gravekeeper'), 'b1');
    const po = g().pendingTriggerOrder!;
    const entombIdx = po.items.findIndex(i => i.kind === 'enterUnit' && i.unit === 'entomb');
    gs.getState().resolveTriggerOrder(entombIdx); // picked first → resolves first
    expect(g().p1.dead.some(c => c.id === itemCard.id), 'the item was milled').toBe(true);
    const pick = g().pendingDeadPick;
    expect(pick?.source, 'Scavenger armed AFTER the mill').toBe('Palegrove Gravekeeper');
    expect(pick?.options.some(o => o.card.id === itemCard.id),
      'per-event evaluation: the just-milled item IS offered').toBe(true);
  });

  it('Scavenger FIRST (empty Dead Zone): it fizzles — then Entomb mills; the item stays in the Dead Zone unclaimed', () => {
    seedP1({ deck: [itemCard, filler[0], filler[1]] });
    place(rc('Palegrove Gravekeeper'), 'b1');
    const po = g().pendingTriggerOrder!;
    const scavIdx = po.items.findIndex(i => i.kind === 'enterUnit' && i.unit === 'scavenger');
    gs.getState().resolveTriggerOrder(scavIdx); // Scavenger resolves first — nothing to reclaim
    expect(g().pendingDeadPick ?? null, 'no pick: the Dead Zone was empty when Scavenger resolved').toBeFalsy();
    expect(g().p1.dead.map(c => c.id), 'Entomb then milled item + one filler').toEqual([itemCard.id, filler[0].id]);
    expect(g().p1.deck.map(c => c.id)).toEqual([filler[1].id]);
  });
});

describe('Tomb Chanter — start-of-turn self-mill (the mill op from a startOfTurn trigger)', () => {
  it('mills the controller for 1 at the start of their turn', () => {
    const [A, B] = filler;
    seedP1({ board: { b3: mkPc('pc-1'), f1: mkComp('tc', 'Tomb Chanter') }, deck: [A, B] });
    const r = resolveStartOfTurn(g(), 'p1');
    expect(r.game.p1.deck.map(c => c.id)).toEqual([B.id]);
    expect(r.game.p1.dead.map(c => c.id)).toEqual([A.id]);
    expect(r.game.gameOver, 'the engine that digs its own grave still is not a LOSS — the Draw Phase draw is').toBeNull();
  });
});

describe('Grave Whispers — mill 2 + draw 1 (the authored action)', () => {
  const effects = () => (rc('Grave Whispers').effects ?? []).flatMap(c => c.effects);

  it('mills the top 2 into the Dead Zone, then draws the (new) top card', () => {
    const [A, B, C, D] = filler;
    seedP1({ deck: [A, B, C, D] });
    const r = resolveActionEffects(g(), 'p1', 'Grave Whispers', effects());
    expect(r.game.p1.dead.map(c => c.id), 'A and B milled in order').toEqual([A.id, B.id]);
    expect(r.game.p1.hand.map(c => c.id), 'C drawn').toEqual([C.id]);
    expect(r.game.p1.deck.map(c => c.id)).toEqual([D.id]);
    expect(r.game.gameOver).toBeNull();
  });

  it('DECK-OUT BY YOUR OWN SPELL: with exactly 2 cards left, the mill empties the deck and the mandatory draw LOSES the game', () => {
    const [A, B] = filler;
    seedP1({ deck: [A, B] });
    const r = resolveActionEffects(g(), 'p1', 'Grave Whispers', effects());
    expect(r.game.p1.dead.map(c => c.id)).toEqual([A.id, B.id]);
    expect(r.game.gameOver, 'any mandatory draw from an empty deck loses (owner-ruled 2026-08-25)').toBe('p2');
    expect(r.msgs.join(' | ')).toMatch(/empty deck/i);
  });
});

describe('the deck-out loss (owner-ruled 2026-08-25: ANY mandatory draw)', () => {
  it('Draw Phase: drawing from an empty deck sets gameOver to the opponent', () => {
    seedP1({ deck: [] });
    gs.getState().drawCard('p1');
    expect(g().gameOver).toBe('p2');
  });

  it('Draw Phase with cards left: behavior-identical to the old path (no loss, card drawn)', () => {
    const [A, B] = filler;
    seedP1({ deck: [A, B] });
    gs.getState().drawCard('p1');
    expect(g().p1.hand.map(c => c.id)).toEqual([A.id]);
    expect(g().p1.deck.map(c => c.id)).toEqual([B.id]);
    expect(g().gameOver).toBeNull();
  });

  it('effect draw, partial-first: "draw 2" with 1 card left draws that card, THEN the second attempt loses', () => {
    const [A] = filler;
    seedP1({ deck: [A] });
    const r = resolveActionEffects(g(), 'p1', 'test-draw-2', [{ op: 'draw', count: 2 }]);
    expect(r.game.p1.hand.map(c => c.id), 'the partial draw happened first').toEqual([A.id]);
    expect(r.game.gameOver).toBe('p2');
  });

  it('mill past empty is NOT a loss: milling only what exists, game continues', () => {
    const [A, B] = filler;
    seedP1({ deck: [A, B] });
    const r = resolveActionEffects(g(), 'p1', 'test-mill-5', [{ op: 'mill', count: 5, target: 'self' }]);
    expect(r.game.p1.dead.map(c => c.id)).toEqual([A.id, B.id]);
    expect(r.game.gameOver, 'no loss from milling').toBeNull();
  });

  it('after the loss, the store refuses further actions (gameIsOver guard)', () => {
    seedP1({ deck: [] });
    gs.getState().drawCard('p1');
    expect(g().gameOver).toBe('p2');
    const before = g();
    gs.getState().drawCard('p2'); // p2 has a seeded default deck — but the game is over
    expect(g(), 'no state advances after gameOver').toBe(before);
  });
});
