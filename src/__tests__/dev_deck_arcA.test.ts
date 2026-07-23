// DEV deck — Arc A (discard / hand-reveal / deck-peek family) + the 2026-07-22
// Fence's Ledger ruling. Six cards convert from DEV NOT-IMPLEMENTED to live:
// Words That Rot (23, discard action), The Unraveling Whisper (16, onDealDamage
// discard), Tripline of Bells (45, trap discard — PAUSES the stack so the trap's
// resolution completes before the enterer's own triggers), Mark the Pockets (50,
// hand reveal + pick-to-bottom), Recite the Ledger (24, opponent-deck reorder
// peek), Herald of Despair (5, own-deck reorder peek). Voice of the Bargain (3)
// stays flagged: revealHand EXISTS but Coercion claims the single-pending enter
// window — same-owner enter-trigger ordering is Arc G-adjacent debt, and the order
// is information-relevant (no auto-order may be guessed). Pinned below as CURRENT
// behavior; retire + rewrite dated when that arc lands.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { reactiveHold } from '../store/gameStore';
import { CATALOG, DW_ROGUE_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';
import type { SlotId } from '../engine';

const dc = (name: string): Card => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`dev card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);
const czFor = (cls: string, n = 5) => czCards.slice(0, n).map((c, i) => mkCz(c, cls, `cz-${i}`));

function seedP1(over: { hand?: Card[]; board?: Record<string, ReturnType<typeof mkComp>>; dead?: Card[]; cls?: string },
                p2over: { board?: Record<string, ReturnType<typeof mkComp>>; hand?: Card[]; deck?: Card[] } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: over.board ?? {}, dead: over.dead ?? [],
      classZone: czFor(over.cls ?? 'Doom-Whisperer'), willpower: 5 },
    p2: { ...s.game.p2, board: p2over.board ?? {}, hand: p2over.hand ?? [CATALOG[5], CATALOG[6]],
      deck: p2over.deck ?? s.game.p2.deck },
  } }));
}
const g = () => gs.getState().game;
const place = (card: Card, slot: SlotId) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};
const playAs = (actorId: string, card: Card) => {
  gs.setState(s => ({ game: { ...s.game, selected: actorId, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
};
const lastToasts = () => gs.getState().toasts.map(t => t.msg).join(' || ');

describe("RULING 2026-07-22 — Fence's Ledger refuses BEFORE paying (universal pre-cost refusal, the Quill precedent)", () => {
  it('no Weapon in the Dead Zone → refusal, exhaust cost UNPAID', () => {
    freshGame();
    const trinket = CATALOG.find(c => c.itemKind === 'Trinket' && c.name !== "Fence's Ledger")!;
    const bearer = mkComp('lb', 'Ledger Bearer', { fresh: false,
      loadout: { weapon: null, gear: [mkItem('fl', "Fence's Ledger"), null] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: bearer }, dead: [trinket, CATALOG.find(c => c.type === 'Companion')!] },
    } }));
    const toastsBefore = gs.getState().toasts.length;
    gs.getState().activateAbility('lb', 0);
    expect(gs.getState().toasts.length, 'refused loudly').toBeGreaterThan(toastsBefore);
    expect(lastToasts()).toMatch(/would affect nothing/i);
    expect(g().p1.board.f1?.loadout?.gear[0]?.exhausted, 'cost NOT paid — ledger still ready').toBeFalsy();
    expect(g().pendingDeadPick, 'no pick armed').toBeFalsy();
  });
});

describe('Words That Rot (23) — the discard op, chosen by the DISCARDING player', () => {
  it('play arms pendingDiscard for the opponent; the forcing player is held; resolution discards', () => {
    seedP1({ board: { f1: mkComp('actor', 'Caster', { fresh: false }) } });
    playAs('actor', dc('Words That Rot'));
    const pd = g().pendingDiscard;
    expect(pd?.victim, 'the opponent chooses').toBe('p2');
    expect(pd?.source).toBe('Words That Rot');
    expect(reactiveHold(g(), 'p1'), 'the forcing player is held').toMatch(/Words That Rot/);
    expect(reactiveHold(g(), 'p2'), 'the victim is not held').toBeNull();
    expect(g().p1.dead.some(c => c.name === 'Words That Rot'), 'the action buried itself').toBe(true);
    const victim = g().p2.hand[0];
    gs.getState().resolveDiscard(victim.id);
    expect(g().pendingDiscard, 'prompt cleared').toBeFalsy();
    expect(g().p2.dead.some(c => c.id === victim.id), 'chosen card in the Dead Zone').toBe(true);
    expect(g().p2.hand.some(c => c.id === victim.id), 'and out of hand').toBe(false);
  });

  it('an empty opposing hand fizzles loudly — no prompt', () => {
    seedP1({ board: { f1: mkComp('actor', 'Caster', { fresh: false }) } }, { hand: [] });
    playAs('actor', dc('Words That Rot'));
    expect(g().pendingDiscard, 'nothing to discard — no prompt').toBeFalsy();
    expect(lastToasts()).toMatch(/no cards to discard/i);
  });
});

describe('The Unraveling Whisper (16) — onDealDamage: the damaged controller discards', () => {
  it('a damaging hit arms the discard after the attack completes (drain-then-arm)', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('uw', 'The Unraveling Whisper', { keywords: ['Evasive'], atk: 3 }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('vic', 'Victim', { hp: 5 }) }, hand: [CATALOG[5], CATALOG[6]] },
    }, pending: { action: 'attack', charId: 'uw' } }));
    gs.getState().resolveAttack('vic');
    expect(g().p2.board.f1?.hp, 'damage landed first').toBe(2);
    const pd = g().pendingDiscard;
    expect(pd?.victim, "the damaged character's controller").toBe('p2');
    expect(pd?.source).toBe('The Unraveling Whisper');
    const card = g().p2.hand[0];
    gs.getState().resolveDiscard(card.id);
    expect(g().p2.dead.some(c => c.id === card.id)).toBe(true);
    expect(g().pendingDiscard).toBeFalsy();
  });
});

describe('Tripline of Bells (45) — trap discard PAUSES the stack (the collision handled, not dodged)', () => {
  it("the trap's discard resolves BEFORE the enterer's own Scavenger pick (LIFO), then the stack resumes", () => {
    const itemCard = CATALOG.find(c => c.type === 'Item')!;
    seedP1({ cls: 'Rogue', board: { b3: mkPc('pc-1') }, dead: [itemCard] },
      { board: { b2: mkConstruct('tb', 'Tripline of Bells', 2, { subtype: 'Trap' }) }, hand: [] });
    // p1 keeps a second hand card so the trap has something to take.
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [CATALOG[10]] } } }));
    place(dc('Carrion Crow'), 'b1');
    const pd = g().pendingDiscard;
    expect(pd?.victim, 'the ENTERING player discards').toBe('p1');
    expect(pd?.source).toBe('Tripline of Bells');
    // The stack is PAUSED: the companion's own enter has not run yet.
    expect(g().triggerStack?.some(e => e.kind === 'ownEnter'), 'ownEnter still queued behind the pause').toBe(true);
    expect(g().pendingDeadPick, 'Scavenger pick NOT yet armed').toBeFalsy();
    // Resolve the discard → the stack resumes → the Scavenger attach pick arms.
    gs.getState().resolveDiscard(g().p1.hand[0].id);
    expect(g().pendingDiscard).toBeFalsy();
    expect(g().triggerStack, 'stack drained').toBeFalsy();
    expect(g().pendingDeadPick?.attachTo?.name, 'Scavenger pick armed AFTER the trap fully resolved').toBe('Carrion Crow');
  });

  it('an empty-handed enterer fizzles the discard and the stack continues un-paused', () => {
    seedP1({ cls: 'Rogue', board: { b3: mkPc('pc-1') } },
      { board: { b2: mkConstruct('tb', 'Tripline of Bells', 2, { subtype: 'Trap' }) }, hand: [] });
    place(dc('Alley Cutpurse'), 'b1'); // placing consumes p1's only hand card
    expect(g().pendingDiscard, 'no cards to take — no prompt').toBeFalsy();
    expect(g().triggerStack, 'stack drained straight through').toBeFalsy();
    expect(Object.values(g().p1.board).some(e => e?.name === 'Alley Cutpurse'), 'the companion entered').toBe(true);
    expect(lastToasts()).toMatch(/no cards to discard/i);
  });
});

describe('Mark the Pockets (50) — hand reveal with pick-to-bottom', () => {
  const setup = () => {
    seedP1({ cls: 'Rogue', board: { f1: mkComp('actor', 'Rogue Actor', { fresh: false }) } },
      { hand: [CATALOG[5], CATALOG[6]], deck: [CATALOG[30], CATALOG[31], CATALOG[32]] });
    playAs('actor', dc('Mark the Pockets'));
  };
  it('arms the looker-owned reveal; the hand owner is held; picking bottoms the card and they draw', () => {
    setup();
    const hr = g().pendingHandReveal;
    expect(hr?.lp, 'the LOOKER owns the prompt').toBe('p1');
    expect(hr?.handSide).toBe('p2');
    expect(hr?.pick).toBe('toBottomDraw');
    expect(reactiveHold(g(), 'p2'), "the hand's owner is held").toMatch(/Mark the Pockets/);
    expect(reactiveHold(g(), 'p1'), 'the looker is not held').toBeNull();
    const chosen = g().p2.hand[1];
    const topBefore = g().p2.deck[0];
    const handBefore = g().p2.hand.length;
    gs.getState().resolveHandReveal(chosen.id);
    expect(g().pendingHandReveal).toBeFalsy();
    expect(g().p2.deck[g().p2.deck.length - 1]?.id, 'chosen card on the BOTTOM of their deck').toBe(chosen.id);
    expect(g().p2.hand.some(c => c.id === topBefore.id), 'they drew their top card').toBe(true);
    expect(g().p2.hand.length, 'hand size net unchanged').toBe(handBefore);
  });
  it('"you may" — choosing none moves nothing', () => {
    setup();
    const before = JSON.stringify({ hand: g().p2.hand, deck: g().p2.deck });
    gs.getState().resolveHandReveal(null);
    expect(g().pendingHandReveal).toBeFalsy();
    expect(JSON.stringify({ hand: g().p2.hand, deck: g().p2.deck }), 'opponent zones untouched').toBe(before);
  });
});

describe('Voice of the Bargain (3) — DEBT PIN: Coercion claims the single-pending enter window', () => {
  // ⚠ CURRENT behavior (flagged on the card, Arc G-adjacent): the revealHand
  // machinery exists, but runOnEnter's structured-onEnter branch is guarded by
  // !pendingCoercion — the authored reveal clause is DROPPED. The order of the two
  // same-owner enter triggers is information-relevant (hand seen pre- vs
  // post-coercion), so no auto-order may be guessed. RETIRE this pin and rewrite it
  // dated when same-owner enter-trigger ordering lands.
  it('CURRENT: Coercion arms, the reveal does not', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { hand: [CATALOG[5]] });
    place(dc('Voice of the Bargain'), 'b1');
    expect(g().pendingCoercion?.victim, 'Coercion claimed the enter').toBe('p2');
    expect(g().pendingHandReveal, 'the reveal clause is dropped (flagged debt)').toBeFalsy();
  });
});

describe('Recite the Ledger (24) — opponent-deck look-3 reorder', () => {
  const cast = () => {
    seedP1({ board: { b3: mkPc('pc-1') } },
      { deck: [CATALOG[40], CATALOG[41], CATALOG[42], CATALOG[43], CATALOG[44]] });
    playAs('pc-1', dc('Recite the Ledger'));
  };
  it('arms a reorder peek over the OPPONENT deck; the permutation is applied verbatim', () => {
    cast();
    const pk = g().pendingPeek;
    expect(pk?.reorder, 'reorder mode').toBe(true);
    expect(pk?.deckSide, "the opponent's deck").toBe('p2');
    expect(pk?.lp, 'looker owns it').toBe('p1');
    expect(pk?.cards.length).toBe(3);
    expect(reactiveHold(g(), 'p2'), 'the deck owner is held').toMatch(/Recite the Ledger/);
    const [c0, c1, c2] = pk!.cards;
    gs.getState().resolvePeekOrder([2, 0, 1]);
    expect(g().pendingPeek).toBeFalsy();
    expect(g().p2.deck.slice(0, 3).map(c => c.id), 'new top order = chosen order').toEqual([c2.id, c0.id, c1.id]);
    expect(g().p2.deck.length, 'nothing gained or lost').toBe(5);
  });
  it('a non-permutation is refused (prompt stays armed)', () => {
    cast();
    gs.getState().resolvePeekOrder([0, 0, 1]);
    expect(g().pendingPeek, 'still armed').toBeTruthy();
    gs.getState().resolvePeekOrder([0, 1]);
    expect(g().pendingPeek, 'wrong length refused too').toBeTruthy();
  });
});

describe('Herald of Despair (5) — own-deck look-2 reorder on enter', () => {
  it('placing it arms the reorder peek; the chosen order lands on top of OWN deck', () => {
    seedP1({ board: { b3: mkPc('pc-1') } });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, deck: [CATALOG[45], CATALOG[46], CATALOG[47]] } } }));
    place(dc('Herald of Despair'), 'b1');
    const pk = g().pendingPeek;
    expect(pk?.reorder).toBe(true);
    expect(pk?.deckSide, 'own deck').toBe('p1');
    expect(pk?.cards.length).toBe(2);
    const [c0, c1] = pk!.cards;
    gs.getState().resolvePeekOrder([1, 0]);
    expect(g().p1.deck.slice(0, 2).map(c => c.id), 'swapped').toEqual([c1.id, c0.id]);
  });
});
