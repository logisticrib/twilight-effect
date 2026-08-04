// DEV deck — Arc G (mixed-owner batches + the multi-pending enter window),
// 2026-08-04. Three cards convert from DEV NOT-IMPLEMENTED to live:
// Echo-Keeper (14, own-companion-play listener — the first MIXED-owner play
// window vs opposing Paranoia), Voice of the Bargain (3, Coercion + enter-reveal)
// and Gutter Fence (39, Scavenger + enter-return) — the same-owner multi-pending
// enter window (the Phase-1 collision finding).
//
// STRUCTURAL RULE UNDER TEST (Rules Note 2026-07-22, implemented this arc): each
// player orders their OWN simultaneous triggers; across owners the queue is
// structural — the ACTIVE player's triggers queue onto the stack first, the
// non-active player's above them, so theirs resolve first (LIFO). Consistent with
// R3 2026-07-12: the Paranoia peek resolves before the placer's own listeners and
// before the enter. Per-owner ordering prompts are SERIALIZED
// (PendingTriggerOrder.next), never dual-hold (the Arc F discipline).
//
// The batchOrderer fail-loudly guard pin (trigger_stack_traps) was RETIRED +
// REWRITTEN 2026-08-04: the structural segmentation is pinned there
// (segmentBatch), and the end-to-end resolution order is pinned HERE through
// observable deck state (the arc-C lesson: assert real state, never toasts alone).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkCz } from './helpers';
import { reactiveHold, resolveActionEffects } from '../store/gameStore';
import { CATALOG, DW_ROGUE_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';
import type { SlotId } from '../engine';

const dc = (name: string): Card => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`dev card missing: ${name}`);
  return c;
};
// The play-event vehicle. Shade Puppeteer went LIVE in Arc H (2026-08-04: on-enter
// bounce of an opposing companion with ≤2 CURRENT hp) — every board seeded in this
// file uses the mkComp default of 5 hp (mkPc 20), so its enter fizzles silently
// ("no legal target") in each scenario and these pins keep reading exactly as
// written. If a seed here ever drops an opposing companion to ≤2 hp, the bounce
// pick will arm — pick a different vehicle then.
const plain = (): Card => dc('Shade Puppeteer');
const czCards = CATALOG.slice(20, 25);
const czFor = (cls: string, n = 5) => czCards.slice(0, n).map((c, i) => mkCz(c, cls, `cz-${i}`));

function seedP1(over: { hand?: Card[]; board?: Record<string, ReturnType<typeof mkComp>>; dead?: Card[]; deck?: Card[]; cls?: string },
                p2over: { board?: Record<string, ReturnType<typeof mkComp>>; hand?: Card[] } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: over.board ?? {}, dead: over.dead ?? [],
      deck: over.deck ?? s.game.p1.deck, classZone: czFor(over.cls ?? 'Doom-Whisperer'), willpower: 5 },
    p2: { ...s.game.p2, board: p2over.board ?? {}, hand: p2over.hand ?? [CATALOG[5], CATALOG[6]] },
  } }));
}
const g = () => gs.getState().game;
const place = (card: Card, slot: SlotId) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};
const lastToasts = () => gs.getState().toasts.map(t => t.msg).join(' || ');
/** The wire carries game state wholesale — a lossless JSON round-trip at every
 *  pause IS the byte-parity contract (the arc-B precedent; the 2026-07-21 MP pass
 *  verified the sync layer itself). */
const roundTrips = () => expect(JSON.parse(JSON.stringify(g()))).toEqual(g());
const deck5 = CATALOG.slice(40, 45); // A B C D E

describe('MIXED play window — opposing Paranoia resolves BEFORE the placer\'s Echo-Keeper (structural queue; the retired batchOrderer guard pin, rewritten dated 2026-08-04)', () => {
  it('1 Paranoia + 1 Echo-Keeper: no ordering prompt (singleton segments); peeks resolve opponent-first; the deck order proves it; the companion enters last', () => {
    seedP1({ board: { b3: mkPc('pc-1'), f1: mkComp('ek', 'Echo-Keeper') }, deck: deck5.slice(0, 4) },
      { board: { f1: mkComp('par', 'Watcher', { keywords: ['Paranoia'] }) } });
    const [A, B, C, D] = deck5.slice(0, 4);
    place(plain(), 'b1');
    // Singleton segments — the window needs no ordering prompt at all.
    expect(g().pendingTriggerOrder ?? null, 'no prompt: nothing to order within either segment').toBeFalsy();
    // Paranoia (non-active owner, queued ABOVE) resolves first.
    let pk = g().pendingPeek;
    expect(pk?.lp, "Paranoia's controller peeks FIRST").toBe('p2');
    expect(pk?.deckSide, "…at the PLACER's deck").toBe('p1');
    expect(pk?.cards.map(c => c.id)).toEqual([A.id]);
    expect(reactiveHold(g(), 'p1'), 'the placer is held while the opponent decides').toMatch(/Watcher/);
    expect(reactiveHold(g(), 'p2'), 'the peeking owner is never held by their own prompt').toBeNull();
    expect(Object.values(g().p1.board).some(e => e?.name === 'Shade Puppeteer'),
      'the played companion has NOT entered yet (plays and enters are distinct)').toBe(false);
    roundTrips();
    gs.getState().resolvePeek(['bottom']); // Paranoia bottoms A
    // Echo-Keeper (the placer's own listener) resolves second — sees the NEW top.
    pk = g().pendingPeek;
    expect(pk?.lp, "Echo-Keeper's controller (the placer) peeks SECOND").toBe('p1');
    expect(pk?.deckSide).toBe('p1');
    expect(pk?.cards.map(c => c.id), 'fresh per-event: the post-Paranoia top card').toEqual([B.id]);
    expect(pk?.dests, 'canon dests: top or bottom').toEqual(['top', 'bottom']);
    expect(reactiveHold(g(), 'p2'), 'holds FLIP — serialized prompts, never dual-hold').toMatch(/Echo-Keeper/);
    expect(reactiveHold(g(), 'p1')).toBeNull();
    expect(Object.values(g().p1.board).some(e => e?.name === 'Shade Puppeteer'), 'still not entered').toBe(false);
    roundTrips();
    gs.getState().resolvePeek(['bottom']); // Echo-Keeper bottoms B
    expect(g().triggerStack ?? null, 'stack drained').toBeFalsy();
    expect(g().p1.deck.map(c => c.id), 'OBSERVABLE proof of the order: both bottomed, Paranoia\'s first').toEqual([C.id, D.id, A.id, B.id]);
    expect(g().p1.board.b1?.name, 'the companion entered AFTER the whole window').toBe('Shade Puppeteer');
  });

  it('2 Echo-Keepers + 2 Paranoias: serialized per-owner ordering prompts (placer\'s segment ordered first, resolved last) — all four fire, opponent\'s pair first', () => {
    seedP1({ board: { b3: mkPc('pc-1'), f1: mkComp('ek1', 'Echo-Keeper'), f2: mkComp('ek2', 'Echo-Keeper') }, deck: deck5 },
      { board: { f1: mkComp('parA', 'Watcher', { keywords: ['Paranoia'] }), f2: mkComp('parB', 'Watcher B', { keywords: ['Paranoia'] }) } });
    const [A, B, C, D, E] = deck5;
    place(plain(), 'b1');
    // Prompt 1: the PLACER orders their own pair (their segment queues first).
    let po = g().pendingTriggerOrder;
    expect(po?.lp, 'the active player orders THEIR segment first').toBe('p1');
    expect(po?.items.length).toBe(2);
    expect(po?.next?.lp, "the opponent's segment is chained, not dual-prompted").toBe('p2');
    expect(reactiveHold(g(), 'p2'), 'the other player waits').toMatch(/trigger ordering/);
    expect(reactiveHold(g(), 'p1')).toBeNull();
    gs.getState().resolveTriggerOrder(0);
    // Prompt 2: the Paranoia controller orders theirs — the hold has FLIPPED.
    po = g().pendingTriggerOrder;
    expect(po?.lp, 'then the non-active player orders theirs').toBe('p2');
    expect(po?.items.length).toBe(2);
    expect(po?.next, 'no further segment').toBeFalsy();
    expect(reactiveHold(g(), 'p1'), 'holds flipped with the chooser').toMatch(/trigger ordering/);
    expect(reactiveHold(g(), 'p2')).toBeNull();
    roundTrips();
    gs.getState().resolveTriggerOrder(0);
    // Four peeks, strictly serialized: the opponent's two FIRST (structural queue),
    // then the placer's two. Bottom every seen card — the deck records the order.
    const owners: string[] = [];
    for (let i = 0; i < 4; i++) {
      const pk = g().pendingPeek;
      expect(pk, `peek #${i + 1} armed`).toBeTruthy();
      owners.push(pk!.lp);
      gs.getState().resolvePeek(['bottom']);
    }
    expect(owners, 'opponent-first resolution, pair by pair').toEqual(['p2', 'p2', 'p1', 'p1']);
    expect(g().pendingPeek ?? null).toBeFalsy();
    expect(g().p1.deck.map(c => c.id), 'A,B (Paranoias) then C,D (Echo-Keepers) bottomed in resolution order').toEqual([E.id, A.id, B.id, C.id, D.id]);
    expect(g().p1.board.b1?.name).toBe('Shade Puppeteer');
  });
});

describe('Echo-Keeper (14) — the own-companion-play listener\'s SCOPE (play = from hand, 2026-07-15 canon; per-event evaluation, 2026-07-21)', () => {
  it('fires on the controller\'s own companion play, resolving BEFORE the companion enters', () => {
    seedP1({ board: { b3: mkPc('pc-1'), f1: mkComp('ek', 'Echo-Keeper') }, deck: deck5.slice(0, 2) });
    place(plain(), 'b1');
    const pk = g().pendingPeek;
    expect(pk?.lp).toBe('p1');
    expect(pk?.cards.length).toBe(1);
    expect(Object.values(g().p1.board).some(e => e?.name === 'Shade Puppeteer'), 'listener resolves pre-enter').toBe(false);
    gs.getState().resolvePeek(['top']);
    expect(g().p1.board.b1?.name).toBe('Shade Puppeteer');
  });

  it('does NOT hear ITSELF: playing Echo-Keeper fires nothing; the NEXT companion play fires it (per-event board — the listener must be on the board as of the play)', () => {
    seedP1({ board: { b3: mkPc('pc-1') }, deck: deck5.slice(0, 2) });
    place(dc('Echo-Keeper'), 'b1');
    expect(g().pendingPeek ?? null, 'its own play fires NOTHING').toBeFalsy();
    expect(g().triggerStack ?? null, 'no pause — straight in').toBeFalsy();
    expect(g().p1.board.b1?.name).toBe('Echo-Keeper');
    place(plain(), 'b2');
    expect(g().pendingPeek?.lp, 'the very next companion play DOES fire it').toBe('p1');
  });

  it("does NOT fire on the OPPONENT's companion play (own-side listener)", () => {
    seedP1({ board: { f1: mkComp('ek', 'Echo-Keeper') } });
    // Hand the seat to p2 and give them a playable setup.
    const card = plain();
    gs.setState(s => ({ localPlayer: 'p2' as const, game: { ...s.game, activePlayer: 'p2' as const,
      p2: { ...s.game.p2, board: { b3: mkPc('pc-2') }, hand: [card], classZone: czFor('Rogue'), willpower: 5 } } }));
    gs.getState().beginPlay(card.id);
    gs.getState().placeCard('b1');
    expect(g().p2.board.b1?.name, 'the opponent\'s companion entered').toBe('Shade Puppeteer');
    expect(g().pendingPeek ?? null, "p1's Echo-Keeper stayed silent").toBeFalsy();
    expect(g().triggerStack ?? null).toBeFalsy();
  });

  it('does NOT fire on the PC PLACEMENT (a placement, not a play)', () => {
    seedP1({ board: { f1: mkComp('ek', 'Echo-Keeper') } });
    gs.setState(s => ({ game: { ...s.game, setupQueue: ['place-pc:p1'], currentPhase: 'cz' as const,
      p1: { ...s.game.p1, _pc: mkPc('pc-new') } } }));
    gs.getState().placePc('b2');
    expect(g().p1.board.b2?.kind, 'the PC was placed').toBe('pc');
    expect(g().pendingPeek ?? null, 'no play event — no peek').toBeFalsy();
    expect(g().triggerStack ?? null).toBeFalsy();
  });

  it('does NOT fire on an Animate Magic conversion (a companion appears — but nothing was played)', () => {
    seedP1({ board: { b3: mkPc('pc-1'), f1: mkComp('ek', 'Echo-Keeper'),
      f2: mkConstruct('inc', 'Sigil Lattice', 2, { subtype: 'Incantation' }) } });
    const r = resolveActionEffects(g(), 'p1', 'Test Animator',
      [{ op: 'animate', atk: 2, hp: 2, target: 'magicalConstruct' }], 'inc');
    gs.setState(() => ({ game: r.game }));
    expect(g().p1.board.f2?.kind, 'the construct became a companion (Manifest)').toBe('companion');
    expect(g().p1.board.f2?.subtype).toBe('Manifest');
    expect(g().pendingPeek ?? null, 'no play event — no peek').toBeFalsy();
  });

  it('does NOT fire on a CONSTRUCT play (companion listener only)', () => {
    const constructCard = CATALOG.find(c => c.type === 'Construct' && !c.keywords.length && !(c.effects?.length))
      ?? CATALOG.find(c => c.type === 'Construct')!;
    seedP1({ board: { b3: mkPc('pc-1'), f1: mkComp('ek', 'Echo-Keeper') } });
    place(constructCard, 'f2');
    expect(Object.values(g().p1.board).some(e => e?.name === constructCard.name), 'construct entered').toBe(true);
    expect(g().pendingPeek ?? null, 'no companion play — no peek').toBeFalsy();
  });
});

describe('Gutter Fence (39) — the multi-pending enter window: same-owner ordering, FRESH per-unit evaluation, optionality chains', () => {
  const itemA = CATALOG.filter(c => c.type === 'Item')[0]!;
  const itemB = CATALOG.filter(c => c.type === 'Item')[1]!;
  const enterFence = (dead: Card[]) => {
    seedP1({ cls: 'Rogue', board: { b3: mkPc('pc-1') }, dead });
    place(dc('Gutter Fence'), 'b1');
  };
  const pickUnit = (unit: string) => {
    const po = g().pendingTriggerOrder!;
    const idx = po.items.findIndex(it => it.kind === 'enterUnit' && it.unit === unit);
    expect(idx, `unit ${unit} offered`).toBeGreaterThanOrEqual(0);
    gs.getState().resolveTriggerOrder(idx);
  };

  it('Scavenger-first: the attach resolves, then the return pick arms FRESH — the attached item is no longer an option', () => {
    enterFence([itemA, itemB, CATALOG.find(c => c.type === 'Companion')!]);
    const po = g().pendingTriggerOrder;
    expect(po?.lp, 'the OWNER orders their own enter triggers').toBe('p1');
    expect(po?.items.map(it => it.kind === 'enterUnit' ? it.unit : it.kind).sort()).toEqual(['scavenger', 'structured']);
    expect(g().pendingDeadPick ?? null, 'nothing arms until the order is chosen').toBeFalsy();
    pickUnit('scavenger');
    let dp = g().pendingDeadPick;
    expect(dp?.attachTo?.name, 'the Scavenger attach pick, first as ordered').toBe('Gutter Fence');
    expect(dp?.options.length).toBe(2);
    gs.getState().resolveDeadPick(dp!.options.find(o => o.card.id === itemA.id)!.idx);
    expect(g().p1.board.b1?.loadout?.weapon?.name ?? g().p1.board.b1?.loadout?.gear[0]?.name,
      'itemA attached to Gutter Fence').toBe(itemA.name);
    // The return unit evaluated AFTER the attach — itemA is gone from its options.
    dp = g().pendingDeadPick;
    expect(dp, 'the authored return pick arms next (nothing dropped)').toBeTruthy();
    expect(dp?.attachTo, 'plain to-hand pick, not an attach').toBeFalsy();
    expect(dp?.optional, '"you may"').toBe(true);
    expect(dp?.options.map(o => o.card.id), 'FRESH options: the attached item excluded').toEqual([itemB.id]);
    gs.getState().resolveDeadPick(dp!.options[0].idx);
    expect(g().p1.hand.some(c => c.id === itemB.id), 'itemB returned to hand').toBe(true);
    expect(g().triggerStack ?? null, 'window complete').toBeFalsy();
  });

  it('return-first: the returned item is gone from the Scavenger pick (the mirror order)', () => {
    enterFence([itemA, itemB]);
    pickUnit('structured');
    let dp = g().pendingDeadPick;
    expect(dp?.attachTo, 'the return pick first').toBeFalsy();
    gs.getState().resolveDeadPick(dp!.options.find(o => o.card.id === itemA.id)!.idx);
    expect(g().p1.hand.some(c => c.id === itemA.id), 'itemA in hand').toBe(true);
    dp = g().pendingDeadPick;
    expect(dp?.attachTo?.name, 'the Scavenger pick arms next').toBe('Gutter Fence');
    expect(dp?.options.map(o => o.card.id), 'FRESH: only itemB remains').toEqual([itemB.id]);
    gs.getState().resolveDeadPick(dp!.options[0].idx);
    expect(g().p1.board.b1?.loadout?.weapon?.name ?? g().p1.board.b1?.loadout?.gear[0]?.name).toBe(itemB.name);
    expect(g().triggerStack ?? null).toBeFalsy();
  });

  it('declining the Scavenger pick does NOT eat the return pick (optionality chain — both halves are "may")', () => {
    enterFence([itemA, itemB]);
    pickUnit('scavenger');
    expect(g().pendingDeadPick?.attachTo?.name).toBe('Gutter Fence');
    gs.getState().cancelDeadPick(); // decline the attach
    const dp = g().pendingDeadPick;
    expect(dp, 'the return pick still arms').toBeTruthy();
    expect(dp?.attachTo).toBeFalsy();
    expect(dp?.options.length, 'nothing was taken — both items offered').toBe(2);
    gs.getState().cancelDeadPick(); // decline the return too
    expect(g().pendingDeadPick ?? null).toBeFalsy();
    expect(g().triggerStack ?? null, 'window complete, nothing eaten, nothing stuck').toBeFalsy();
    expect(g().p1.dead.filter(c => c.type === 'Item').length, 'both items still dead').toBe(2);
  });

  it('the only item taken by Scavenger → the return unit fizzles LOUDLY (fresh evaluation finds an empty Dead Zone)', () => {
    enterFence([itemA]);
    pickUnit('scavenger');
    gs.getState().resolveDeadPick(g().pendingDeadPick!.options[0].idx);
    expect(g().pendingDeadPick ?? null, 'no second pick — nothing left to return').toBeFalsy();
    expect(g().triggerStack ?? null, 'stack drained through the fizzle').toBeFalsy();
    expect(lastToasts()).toMatch(/no eligible card/i);
  });
});

describe('Voice of the Bargain (3) — Coercion + enter-reveal: the information-relevant order is PROMPTED, never guessed (the Arc A STOP, closed)', () => {
  const enterVoice = (p2hand: Card[], p2board: Record<string, ReturnType<typeof mkComp>> = {}) => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { hand: p2hand, board: p2board });
    place(dc('Voice of the Bargain'), 'b1');
  };
  const pickUnit = (unit: string) => {
    const po = g().pendingTriggerOrder!;
    const idx = po.items.findIndex(it => it.kind === 'enterUnit' && it.unit === unit);
    expect(idx, `unit ${unit} offered`).toBeGreaterThanOrEqual(0);
    gs.getState().resolveTriggerOrder(idx);
  };

  it('Coercion-first: the victim resolves, THEN the reveal shows the post-discard hand; holds serialize across owners', () => {
    enterVoice([CATALOG[5], CATALOG[6]]);
    const po = g().pendingTriggerOrder;
    expect(po?.lp).toBe('p1');
    expect(po?.items.map(it => it.kind === 'enterUnit' ? it.unit : it.kind).sort()).toEqual(['coercion', 'structured']);
    pickUnit('coercion');
    expect(g().pendingCoercion?.victim, 'Coercion armed for the opponent').toBe('p2');
    expect(g().pendingHandReveal ?? null, 'the reveal WAITS (serialized, not dual)').toBeFalsy();
    expect(reactiveHold(g(), 'p1'), 'the placer waits for the victim').toMatch(/Voice of the Bargain \(Coercion\)/);
    expect(reactiveHold(g(), 'p2'), 'the victim acts — never held by their own forced choice').toBeNull();
    const discarded = g().p2.hand[0];
    gs.getState().resolveCoercionDiscard(discarded.id);
    const hr = g().pendingHandReveal;
    expect(hr?.lp, 'the reveal arms for the LOOKER after the coercion fully resolved').toBe('p1');
    expect(hr?.handSide).toBe('p2');
    expect(g().p2.hand.length, 'the looker sees the POST-discard hand — the order mattered').toBe(1);
    expect(reactiveHold(g(), 'p2'), "now the hand's owner waits").toMatch(/Voice of the Bargain/);
    expect(reactiveHold(g(), 'p1')).toBeNull();
    gs.getState().resolveHandReveal(null);
    expect(g().pendingHandReveal ?? null).toBeFalsy();
    expect(g().triggerStack ?? null, 'window complete').toBeFalsy();
    expect(g().p2.dead.some(c => c.id === discarded.id), 'the coerced discard landed').toBe(true);
  });

  it('reveal-first: the full hand is seen BEFORE the coercion resolves (the other information order)', () => {
    enterVoice([CATALOG[5], CATALOG[6]]);
    pickUnit('structured');
    const hr = g().pendingHandReveal;
    expect(hr?.lp, 'the reveal first, as ordered').toBe('p1');
    expect(g().p2.hand.length, 'PRE-coercion hand — both cards visible').toBe(2);
    expect(g().pendingCoercion ?? null, 'Coercion waits its turn').toBeFalsy();
    gs.getState().resolveHandReveal(null);
    expect(g().pendingCoercion?.victim, 'Coercion arms after the reveal closes').toBe('p2');
    const discarded = g().p2.hand[0];
    gs.getState().resolveCoercionDiscard(discarded.id);
    expect(g().triggerStack ?? null, 'window complete').toBeFalsy();
    expect(g().p2.dead.some(c => c.id === discarded.id)).toBe(true);
  });

  it('empty-handed opponent: the reveal unit fizzles LOUDLY and Coercion still arms on the sacrifice half (mandatory — no decline path exists)', () => {
    enterVoice([], { f1: mkComp('vic', 'Sacrificial Grunt') });
    pickUnit('structured'); // reveal first — nothing to see
    expect(g().pendingHandReveal ?? null, 'no hand to reveal — no prompt').toBeFalsy();
    expect(lastToasts()).toMatch(/no cards in hand/i);
    expect(g().pendingCoercion?.victim, 'the mandatory Coercion armed in the same pass').toBe('p2');
    gs.getState().resolveCoercionSacrifice('vic');
    expect(g().p2.board.f1, 'the sacrifice resolved').toBeUndefined();
    expect(g().pendingCoercion ?? null).toBeFalsy();
    expect(g().triggerStack ?? null, 'window complete').toBeFalsy();
  });
});
