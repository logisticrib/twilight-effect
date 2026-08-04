// DEV deck — Arc H (pay-to-break gate, skip-refresh, companion bounce), 2026-08-04.
// Three cards convert from DEV NOT-IMPLEMENTED to live, three independent mechanisms:
// The Final Word (21, attackToll — a conditional restriction with a payment escape:
// each attack DECLARATION by an opposing companion costs its controller one
// sacrifice, paid before the attack proceeds; cost precedes effect), Whispered
// Accusation (27, exhaust + 'doesNotReady' window riding the Arc B buff anchors —
// NEW anchor kind 'controllersNextTurnStart': dormancy + turnEnd expiry, NO
// activeDuring, because runReadyPhase runs BEFORE endTurn flips activePlayer), and
// Shade Puppeteer (13, on-enter bounce with the hpAtMost CURRENT-hp gate — filtered
// at arm time AND re-checked at resolution).
//
// OPEN QUESTION flagged for the owner (implemented text-literal, HANDOFF 2026-08-04):
// the toll's "a permanent" includes the ATTACKING companion itself — paying with it
// leaves the attack with no attacker, so the attack was never DECLARED (unlike the
// Glass Cannon fizzle, which is post-declaration): no declaration triggers fire.
// Iron Spikes is the observable: the attacker takes its 1 damage IFF declared.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkCz } from './helpers';
import { reactiveHold, POISONED_STATUS } from '../store/gameStore';
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
                p2over: { board?: Record<string, ReturnType<typeof mkComp>>; hand?: Card[] } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: over.board ?? {}, dead: over.dead ?? [],
      classZone: czFor(over.cls ?? 'Doom-Whisperer'), willpower: 5 },
    p2: { ...s.game.p2, board: p2over.board ?? {}, hand: p2over.hand ?? [CATALOG[5], CATALOG[6]] },
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
const armAttack = (charId: string) =>
  gs.setState(s => ({ pending: { action: 'attack', charId }, game: { ...s.game, currentPhase: 'action' as const } }));
/** endTurn opens the next turn in the CZ phase (the arc-B harness lesson) —
 *  fast-forward so later reducers pass the phase gate. */
const nextTurn = () => {
  gs.getState().endTurn();
  gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' as const } }));
};
const roundTrips = () => expect(JSON.parse(JSON.stringify(g()))).toEqual(g());

// ─── The Final Word (21) — the attack toll ──────────────────────────────────────
describe('The Final Word (21) — each opposing attack declaration costs a sacrifice (cost precedes effect)', () => {
  const finalWord = () => mkConstruct('tfw', 'The Final Word', 5, { subtype: 'Utterance' });
  const seedCombat = (p1extra: Record<string, ReturnType<typeof mkComp>> = {}, p2extra: Record<string, ReturnType<typeof mkComp>> = {}) => {
    seedP1({ board: { f1: mkComp('att', 'Attacker', { fresh: false, atk: 3 }), ...p1extra } },
      { board: { f2: finalWord(), f1: mkComp('def', 'Defender', { hp: 9, maxHp: 9 }), ...p2extra } });
  };

  it('payment: the sacrifice is a REAL sacrifice event — listeners fire BEFORE the attack proceeds, then the attack lands (declaration triggers included)', () => {
    seedCombat(
      { b1: mkConstruct('pay', 'Watch Post', 3, { subtype: 'Fortification' }), b2: mkConstruct('sw', 'Siegeworks', 3, { subtype: 'Fortification' }) },
      { b2: mkConstruct('spikes', 'Iron Spikes', 2, { subtype: 'Trap' }) });
    armAttack('att');
    gs.getState().resolveAttack('def');
    const pat = g().pendingAttackToll;
    expect(pat?.lp, "the ATTACKER's controller pays").toBe('p1');
    expect(pat?.sourceName).toBe('The Final Word');
    expect(g().p2.board.f1?.hp, 'nothing has happened yet — the toll gates the declaration').toBe(9);
    expect(reactiveHold(g(), 'p2'), 'the opponent waits while the payer chooses').toMatch(/The Final Word \(attack toll\)/);
    expect(reactiveHold(g(), 'p1'), 'the payer is never held by their own prompt').toBeNull();
    // The turn cannot end around an unpaid toll.
    gs.getState().endTurn();
    expect(g().activePlayer, 'endTurn refused while the toll is unpaid').toBe('p1');
    roundTrips();
    const handBefore = g().p1.hand.length;
    gs.getState().resolveAttackToll('pay');
    // Synthetic name — assert board exit, never burial (the arc-C lesson); the
    // Siegeworks draw below is the proof the sacrifice EVENT was real.
    expect(g().p1.board.b1, 'the payment left the board').toBeUndefined();
    expect(g().p1.hand.length, "Siegeworks heard its owner's sacrifice (listener fired before the attack)").toBe(handBefore + 1);
    expect(g().p2.board.f1?.hp, 'then the attack landed').toBe(6);
    expect(g().p1.board.f1?.hp, 'Iron Spikes fired — the attack WAS declared').toBe(4);
    expect(g().p1.board.f1?.exhausted, 'the attacker spent its attack').toBe(true);
    expect(g().pendingAttackToll ?? null, 'prompt cleared').toBeFalsy();
  });

  it('decline: no sacrifice, no attack, NO declaration triggers (Iron Spikes silent), no partial state — the attacker may try again', () => {
    seedCombat({ b1: mkConstruct('pay', 'Watch Post', 3, { subtype: 'Fortification' }) },
      { b2: mkConstruct('spikes', 'Iron Spikes', 2, { subtype: 'Trap' }) });
    armAttack('att');
    gs.getState().resolveAttack('def');
    expect(g().pendingAttackToll).toBeTruthy();
    gs.getState().resolveAttackToll(null);
    expect(g().pendingAttackToll ?? null, 'prompt cleared').toBeFalsy();
    expect(g().p1.board.b1?.name, 'nothing sacrificed').toBe('Watch Post');
    expect(g().p2.board.f1?.hp, 'no attack').toBe(9);
    expect(g().p1.board.f1?.hp, 'Iron Spikes never fired — the attack was never declared').toBe(5);
    expect(g().p1.board.f1?.exhausted, 'no activation consumed').toBe(false);
    expect(g().p1.board.f1?.acts.major).toBe(false);
    expect(lastToasts()).toMatch(/toll unpaid|called off/i);
    // The attack can simply be declared again (and pays this time).
    armAttack('att');
    gs.getState().resolveAttack('def');
    expect(g().pendingAttackToll, 'the toll re-arms on the next declaration').toBeTruthy();
  });

  it("text-literal self-payment (⚠ flagged for owner): the attacking companion is itself a legal payment — the attack then has no attacker, was never DECLARED, and fizzles", () => {
    // The attacker is p1's ONLY permanent — beginAttack must NOT refuse (the
    // attacker itself is always payable, so the cannot-pay refusal is unreachable
    // for companion attackers under the text-literal reading).
    seedP1({ board: { f1: mkComp('att', 'Attacker', { fresh: false, atk: 3 }), b3: mkPc('pc-1') } },
      { board: { f2: finalWord(), f1: mkComp('def', 'Defender', { hp: 9, maxHp: 9 }), b2: mkConstruct('spikes', 'Iron Spikes', 2, { subtype: 'Trap' }) } });
    gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' as const } }));
    gs.getState().beginAttack('att');
    expect(gs.getState().pending?.action, 'beginAttack proceeds — a payable toll is not a restriction').toBe('attack');
    gs.getState().resolveAttack('def');
    const before = g().p1.board.f1;
    expect(before, 'attacker still on board while the toll is unpaid').toBeTruthy();
    gs.getState().resolveAttackToll('att');
    expect(g().p1.board.f1, 'the attacker paid with itself').toBeUndefined();
    expect(g().p1.dead.some(c => c.name === 'Attacker'), 'a real sacrifice').toBe(false); // synthetic name — assert board exit, not burial (the arc-C lesson)
    expect(g().p2.board.f1?.hp, 'the attack never happened').toBe(9);
    expect(lastToasts()).toMatch(/fizzles.*attacker left before it was declared/i);
    expect(g().pendingAttackToll ?? null).toBeFalsy();
    expect(g().triggerStack ?? null, 'nothing queued — no declaration window ever opened').toBeFalsy();
  });

  it("the construct restricts but does not fight: it is not attackable, and the toll dies with it", () => {
    seedCombat();
    armAttack('att');
    gs.getState().resolveAttack('tfw');
    expect(lastToasts()).toMatch(/Constructs cannot be attacked/i);
    expect(g().pendingAttackToll ?? null, 'no toll armed by a refused declaration').toBeFalsy();
    // Remove The Final Word — the same attack now commits promptless.
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { ...s.game.p2.board, f2: undefined } } } }));
    armAttack('att');
    gs.getState().resolveAttack('def');
    expect(g().pendingAttackToll ?? null, 'no source — no toll').toBeFalsy();
    expect(g().p2.board.f1?.hp, 'attack landed directly').toBe(6);
  });

  it("the controller's OWN companions attack toll-free (scope: opposing companions only)", () => {
    seedP1({ board: { f1: mkComp('mine', 'P1 Defender', { hp: 8, maxHp: 8 }) } },
      { board: { f2: finalWord(), f1: mkComp('p2att', 'P2 Attacker', { fresh: false, atk: 2 }) } });
    gs.setState(s => ({ localPlayer: 'p2' as const,
      pending: { action: 'attack', charId: 'p2att' },
      game: { ...s.game, activePlayer: 'p2' as const, currentPhase: 'action' as const } }));
    gs.getState().resolveAttack('mine');
    expect(g().pendingAttackToll ?? null, "the Final Word's own side pays nothing").toBeFalsy();
    expect(g().p1.board.f1?.hp, 'attack landed').toBe(6);
  });
});

// ─── Whispered Accusation (27) — exhaust + skip the next ready ──────────────────
describe("Whispered Accusation (27) — exhaust now, and the target does not ready at the start of its controller's next turn", () => {
  const cast = (targetOver: Partial<ReturnType<typeof mkComp>> = {}) => {
    // A Special Action — the PC is the acting character (Rules Note 2026-07-15).
    seedP1({ board: { b3: mkPc('pc-1') } },
      { board: { f1: mkComp('vic', 'Victim', { fresh: false, ...targetOver }) } });
    playAs('pc-1', dc('Whispered Accusation'));
    const pa = gs.getState().pendingActionTarget;
    expect(pa, 'targeted cast — the pick arms').toBeTruthy();
    expect(pa?.eligibleIds).toEqual(['vic']);
    gs.getState().resolveActionTarget('vic');
  };

  it('exhausted this turn; still exhausted through their next ready; readies normally the turn after (the one-shot window expires)', () => {
    cast();
    const vic = () => g().p2.board.f1!;
    expect(vic().exhausted, 'exhausted immediately').toBe(true);
    const stamped = vic().buffs?.find(b => b.modifiers?.includes('doesNotReady'));
    expect(stamped, 'the skip window is stamped').toBeTruthy();
    expect(stamped?.pendingUntilTurnOf, 'DORMANT until their turn-start boundary (own-turn cast)').toBe('p2');
    expect(stamped?.source).toBe('Whispered Accusation');
    roundTrips();
    nextTurn(); // p1 → p2: the boundary arms the window; their ready step is SKIPPED
    expect(g().activePlayer).toBe('p2');
    expect(vic().exhausted, "did NOT ready at the start of its controller's next turn").toBe(true);
    expect(vic().buffs?.find(b => b.modifiers?.includes('doesNotReady'))?.pendingUntilTurnOf,
      'window armed (no longer dormant)').toBeUndefined();
    nextTurn(); // p2 → p1: the window expires at p2's turn end
    expect(vic().buffs?.some(b => b.modifiers?.includes('doesNotReady')), 'window stripped').toBeFalsy();
    nextTurn(); // p1 → p2: the following ready is NORMAL
    expect(vic().exhausted, 'readies normally the turn after').toBe(false);
  });

  it('vs Poison (the ruled ready-phase order): a successful cleanse clears the counters but must NOT ready the companion while the skip window holds', () => {
    cast({ poison: 1, statuses: [POISONED_STATUS], exhausted: true, tapped: 'major' });
    nextTurn(); // p2's turn: readyAndFlip leaves the poisoned unit for the check…
    expect(g().pendingPoison, "…which arms for the poisoned side").toBe('p2');
    gs.getState().resolvePoison('p2', [{ id: 'vic', cleansed: true }]);
    const vic = () => g().p2.board.f1!;
    expect(vic().poison ?? 0, 'the cleanse governs the counters (Poison canon)').toBe(0);
    expect(vic().statuses.includes(POISONED_STATUS)).toBe(false);
    expect(vic().exhausted, 'but the READY half is consumed by the skip window').toBe(true);
    nextTurn(); // p2 → p1 (window expires with p2's turn)
    nextTurn(); // p1 → p2: normal ready
    expect(vic().exhausted, 'readies normally the turn after').toBe(false);
  });
});

// ─── Shade Puppeteer (13) — HP-gated companion bounce ───────────────────────────
describe('Shade Puppeteer (13) — on enter, return target opposing companion with ≤2 CURRENT hp to its owner\'s hand', () => {
  const realComp = CATALOG.find(c => c.type === 'Companion')!; // real name — burial/hand membership is name-keyed (the arc-C lesson)
  const realItem = CATALOG.find(c => c.type === 'Item')!;

  it('the HP gate reads CURRENT hp: a healthy 3-hp companion is not offerable; a 5-max damaged-to-2 one is', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('healthy', 'Tough One', { hp: 3, maxHp: 3 }),
      f2: mkComp('hurt', realComp.name, { hp: 2, maxHp: 5 }),
    } });
    place(dc('Shade Puppeteer'), 'b1');
    const pa = gs.getState().pendingActionTarget;
    expect(pa, 'the bounce pick armed').toBeTruthy();
    expect(pa?.eligibleIds, 'ONLY the damaged-to-2 companion qualifies').toEqual(['hurt']);
    gs.getState().resolveActionTarget('hurt');
    expect(g().p2.board.f2, 'bounced off the board').toBeUndefined();
    expect(g().p2.hand.some(c => c.name === realComp.name), "the same unique card, back in its OWNER's hand").toBe(true);
  });

  it('state sheds on the bounce (zone change resets object state); equipped items go to the Dead Zone and open an Item Transfer window (all-exits ruling 2026-07-08)', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('hurt', realComp.name, { hp: 1, maxHp: 4, exhausted: true, poison: 1,
        statuses: [POISONED_STATUS], buffs: [{ atk: 2, until: 'endOfTurn', source: 'Synthetic Pump' }],
        loadout: { weapon: { id: 'it-1', name: realItem.name, sub: '', hands: 1, counters: 0, text: '' }, gear: [] } }),
      // A ready party member — the Item Transfer window needs an eligible rescuer
      // (canon: "exhaust a ready character in their party"; a rescuer-less window
      // is correctly dropped).
      b1: mkComp('rescuer', 'Rescuer', { fresh: false }),
    } });
    place(dc('Shade Puppeteer'), 'b1');
    gs.getState().resolveActionTarget('hurt');
    expect(g().p2.board.f1).toBeUndefined();
    const handCard = g().p2.hand.find(c => c.name === realComp.name);
    expect(handCard, 'the clean CARD is what returns — board state (buffs/counters/statuses) died with the entity').toBeTruthy();
    expect(g().p2.dead.some(c => c.name === realItem.name), 'the equipped item card fell to the Dead Zone').toBe(true);
    expect(g().pendingItemTransferQueue.length + (g().pendingItemTransfer ? 1 : 0),
      'an Item Transfer window opened for the exit').toBeGreaterThan(0);
  });

  it('replay works and the replay is a NEW enter — enter triggers fire again (Scavenger vehicle)', () => {
    // Bounce p2's Carrion Crow (a Scavenger companion), then p2 replays it with an
    // item in their Dead Zone: the Scavenger pick arms AGAIN on the second enter.
    const crow = dc('Carrion Crow');
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('crow', 'Carrion Crow', { hp: 2, maxHp: 2, keywords: ['Scavenger'] }),
    } });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, dead: [realItem], hand: [] } } }));
    place(dc('Shade Puppeteer'), 'b1');
    gs.getState().resolveActionTarget('crow');
    expect(g().p2.hand.some(c => c.name === 'Carrion Crow'), 'bounced to hand').toBe(true);
    // p2 replays it (seat handover — the arcG idiom).
    const handCrow = g().p2.hand.find(c => c.name === 'Carrion Crow')!;
    gs.setState(s => ({ localPlayer: 'p2' as const, game: { ...s.game, activePlayer: 'p2' as const, currentPhase: 'action' as const,
      p2: { ...s.game.p2, board: { ...s.game.p2.board, b3: mkPc('pc-2') }, classZone: czFor('Rogue'), willpower: 5 } } }));
    gs.getState().beginPlay(handCrow.id);
    gs.getState().placeCard('b1');
    expect(g().pendingDeadPick?.attachTo?.name, 'a NEW enter — Scavenger fires again on the replay').toBe('Carrion Crow');
    expect(handCrow.id, 'the same unique card was replayed').toBe(crow.id);
  });

  it('no companion at ≤2 hp → the enter fizzles and Shade Puppeteer still enters', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: { f1: mkComp('tank', 'Tough One', { hp: 5 }) } });
    place(dc('Shade Puppeteer'), 'b1');
    expect(gs.getState().pendingActionTarget, 'no eligible target — no pick').toBeFalsy();
    expect(g().p1.board.b1?.name, 'it still enters').toBe('Shade Puppeteer');
    expect(g().p2.board.f1?.name, 'nothing bounced').toBe('Tough One');
  });
});
