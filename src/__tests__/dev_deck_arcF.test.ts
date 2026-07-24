// DEV deck — Arc F: Siege Rations, the symmetric cross-owner forced choice
// (2026-07-24). CHOREOGRAPHY: serialized prompts riding the SHARED pendingCoercion
// machinery (modal, resolvers, hold clause) — the NON-ACTIVE player's chosen
// resolution first, then the caster's, per the 2026-07-22 structural queue
// (Note-supported reading; the Note speaks of triggers/state events, so "one
// action, both players choose" is FLAGGED to the owner in HANDOFF — implemented,
// pinned, not treated as settled). No dual-hold machinery: the chain (`then`)
// arms the second prompt when the first resolves, halves evaluated FRESH at that
// moment (per-event state, 2026-07-21).
// NEW GENERAL RULE pinned both sides (owner-ruled 2026-07-24, promotes the
// Coercion note): the PC can NEVER be chosen as a sacrifice — canBeSacrificed is
// the chokepoint, Coercion now routes through it (its shipped pins are the
// behavior oracle).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkCz } from './helpers';
import { reactiveHold, canBeSacrificed } from '../store/gameStore';
import { CATALOG, DW_ROGUE_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';
import type { SlotId } from '../engine';

const dc = (name: string): Card => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`dev card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);
const g = () => gs.getState().game;

function seed(p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>>,
              p2over: { hand?: Card[] } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: [], board: p1Board,
      classZone: czCards.map((c, i) => mkCz(c, 'Doom-Whisperer', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: p2over.hand ?? [CATALOG[5], CATALOG[6]] },
  } }));
}
const castRations = (actorId: string) => {
  const card = dc('Siege Rations');
  gs.setState(s => ({ game: { ...s.game, selected: actorId, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
};

describe('RULING 2026-07-24 — the PC can NEVER be chosen as a sacrifice (general chokepoint)', () => {
  it('canBeSacrificed refuses the PC and passes companions/constructs', () => {
    expect(canBeSacrificed(mkPc('pc-x'))).toBe(false);
    expect(canBeSacrificed(mkComp('c-x', 'Anyone', {}))).toBe(true);
    expect(canBeSacrificed(mkConstruct('k-x', 'Anything', 2))).toBe(true);
  });
});

describe('Siege Rations (31) — serialized symmetric choice, non-active player first', () => {
  it('opponent chooses FIRST (structural queue); holds flip as the chain advances; PC never legal on either side', () => {
    seed({ f1: mkComp('actor', 'Caster', { fresh: false }), f2: mkComp('mine', 'My Grunt', {}), b3: mkPc('pc-1') },
      { f1: mkComp('theirs', 'Their Grunt', {}), b3: mkPc('pc-2') });
    castRations('actor');
    const co1 = g().pendingCoercion;
    expect(co1?.victim, 'the NON-ACTIVE player resolves first').toBe('p2');
    expect(co1?.generic, 'action-sourced (neutral copy, labeled hold)').toBe(true);
    expect(co1?.then, 'the caster chains second').toBe('p1');
    expect(reactiveHold(g(), 'p1'), 'the caster is held while the opponent chooses').toMatch(/Siege Rations \(forced choice\)/);
    expect(reactiveHold(g(), 'p2'), 'the chooser is never held by their own prompt').toBeNull();
    // PC never legal (their side): the direct probe is refused, the prompt stays.
    gs.getState().resolveCoercionSacrifice('pc-2');
    expect(g().pendingCoercion?.victim, 'PC pick refused — prompt unchanged').toBe('p2');
    // The opponent sacrifices their grunt → the chain arms the CASTER's prompt.
    gs.getState().resolveCoercionSacrifice('theirs');
    const co2 = g().pendingCoercion;
    expect(co2?.victim, 'now the caster chooses').toBe('p1');
    expect(co2?.then, 'no further chain').toBeUndefined();
    expect(reactiveHold(g(), 'p2'), 'holds flipped').toMatch(/Siege Rations/);
    expect(reactiveHold(g(), 'p1')).toBeNull();
    // PC never legal (caster's side) either.
    gs.getState().resolveCoercionSacrifice('pc-1');
    expect(g().pendingCoercion?.victim, 'PC pick refused — prompt unchanged').toBe('p1');
    gs.getState().resolveCoercionSacrifice('mine');
    expect(g().pendingCoercion, 'both halves resolved').toBeNull();
    expect(reactiveHold(g(), 'p1')).toBeNull();
    expect(reactiveHold(g(), 'p2')).toBeNull();
    expect(g().p1.dead.some(c => c.name === 'Siege Rations'), 'the action buried itself').toBe(true);
  });

  it('a NEITHER-half opponent is unaffected (loud toast, no prompt) — the caster is prompted directly', () => {
    seed({ f1: mkComp('actor', 'Caster', { fresh: false }), b3: mkPc('pc-1') },
      { b3: mkPc('pc-2') }, { hand: [] }); // p2: empty hand, only the PC (never sacrifice-legal)
    castRations('actor');
    expect(g().pendingCoercion?.victim, 'skipped straight to the caster').toBe('p1');
    expect(gs.getState().toasts.map(t => t.msg).join(' | ')).toMatch(/unaffected — nothing to discard or sacrifice/);
  });

  it('a one-half player is forced into that half: no legal sacrifice → the discard section is the choice', () => {
    seed({ f1: mkComp('actor', 'Caster', { fresh: false }), b3: mkPc('pc-1') },
      { b3: mkPc('pc-2') }); // p2 has hand cards but ONLY the PC on board
    castRations('actor');
    expect(g().pendingCoercion?.victim).toBe('p2');
    expect(gs.getState().toasts.map(t => t.msg).join(' | '), 'the forced half is loud').toMatch(/must discard a card \(no permanent to sacrifice\)/);
    // The which-card pick stays with the player (owner agency, Coercion's handling).
    const pick = g().p2.hand[1];
    gs.getState().resolveCoercionDiscard(pick.id);
    expect(g().p2.dead.some(c => c.id === pick.id), 'their chosen card discarded').toBe(true);
    expect(g().pendingCoercion?.victim, 'chain advanced to the caster').toBe('p1');
  });

  it('BOTH players unaffected: two loud toasts, no prompt, the card still buries itself', () => {
    seed({ b3: mkPc('pc-1') }, { b3: mkPc('pc-2') }, { hand: [] });
    // The caster is the PC itself — Major Magic needs an actor with a Major:
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [] } } }));
    const toastsBefore = gs.getState().toasts.length;
    castRations('pc-1');
    expect(g().pendingCoercion, 'nobody prompted').toBeNull();
    const toasts = gs.getState().toasts.slice(toastsBefore).map(t => t.msg).join(' | ');
    expect(toasts.match(/unaffected — nothing to discard or sacrifice/g)?.length, 'both sides toasted').toBe(2);
    expect(g().p1.dead.some(c => c.name === 'Siege Rations')).toBe(true);
  });

  it('on-sacrifice listeners hear each side normally (Siegeworks; per-event, own-scope)', () => {
    const constrCard = CATALOG.find(c => c.type === 'Construct')!;
    seed({ f1: mkComp('actor', 'Caster', { fresh: false }), f2: mkConstruct('minePhys', constrCard.name, 2, { subtype: 'Fortification' }), b3: mkPc('pc-1') },
      { f1: mkConstruct('sw', 'Siegeworks', 4, { subtype: 'Fortification' }), f2: mkConstruct('pb', constrCard.name, 2, { subtype: 'Fortification' }), b3: mkPc('pc-2') });
    castRations('actor');
    const p2hand0 = g().p2.hand.length;
    const p2deck0 = g().p2.deck.length;
    gs.getState().resolveCoercionSacrifice('pb'); // p2 sacrifices their Physical Construct
    expect(g().p2.hand.length, "their OWN Siegeworks heard it — draw").toBe(p2hand0 + 1);
    expect(g().p2.deck.length).toBe(p2deck0 - 1);
    // The caster's turn of the chain: sacrificing p1's construct is OUTSIDE
    // Siegeworks' own-side scope — no second draw.
    expect(g().pendingCoercion?.victim).toBe('p1');
    gs.getState().resolveCoercionSacrifice('minePhys');
    expect(g().p2.hand.length, "opposing sacrifice not in Siegeworks' scope").toBe(p2hand0 + 1);
    expect(g().pendingCoercion).toBeNull();
  });

  it('Coercion regression: the keyword arms WITHOUT chain/generic fields (shipped shape, shipped pins are the oracle)', () => {
    seed({ b3: mkPc('pc-1') }, { f1: mkComp('vic', 'Victim', {}) });
    const acolyte = dc('Whispering Acolyte');
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [acolyte] } } }));
    gs.getState().beginPlay(acolyte.id);
    gs.getState().placeCard('b1' as SlotId);
    const co = g().pendingCoercion;
    expect(co?.victim).toBe('p2');
    expect(co?.then, 'no chain on keyword Coercion').toBeUndefined();
    expect(co?.generic, 'no generic flag on keyword Coercion').toBeUndefined();
  });
});
