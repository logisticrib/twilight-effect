// DEV deck — Arc H (forced sacrifice on attack, skip-refresh, companion bounce),
// 2026-08-04; The Final Word REWORKED 2026-08-11 per the owner's rewording.
// Three cards convert from DEV NOT-IMPLEMENTED to live, three independent mechanisms:
// The Final Word (21 — owner-reworded text "Whenever an opposing companion attacks,
// they must sacrifice a permanent", LITERAL: a TRIGGERED mandatory cost riding the
// declaration window ('oppCompanionAttacks', any target incl. the PC), NOT the
// original pay-to-break gate — no decline exists, the only escape is not attacking;
// self-sacrifice is legal and resolves via the stock Glass Cannon precedent
// (declared → fizzles at the damage step, declaration triggers HAVING fired);
// per-copy: each source's trigger demands its own sacrifice), Whispered
// Accusation (27, exhaust + 'doesNotReady' window riding the Arc B buff anchors —
// NEW anchor kind 'controllersNextTurnStart': dormancy + turnEnd expiry, NO
// activeDuring, because runReadyPhase runs BEFORE endTurn flips activePlayer), and
// Shade Puppeteer (13, on-enter bounce with the hpAtMost CURRENT-hp gate — filtered
// at arm time AND re-checked at resolution).
// Iron Spikes is the declaration observable throughout: it fires IFF the attack
// was declared (and it always is, under the reworded text).
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

// ─── The Final Word (21) — forced sacrifice on attack (owner rewording 2026-08-11,
// supersedes the same-session pay-to-break gate + its pins) ──────────────────────
describe('The Final Word (21) — "Whenever an opposing companion attacks, they must sacrifice a permanent" (literal: triggered mandatory cost, declaration window)', () => {
  const finalWord = () => mkConstruct('tfw', 'The Final Word', 5, { subtype: 'Utterance' });
  const seedCombat = (p1extra: Record<string, ReturnType<typeof mkComp>> = {}, p2extra: Record<string, ReturnType<typeof mkComp>> = {}) => {
    seedP1({ board: { f1: mkComp('att', 'Attacker', { fresh: false, atk: 3 }), ...p1extra } },
      { board: { f2: finalWord(), f1: mkComp('def', 'Defender', { hp: 9, maxHp: 9 }), ...p2extra } });
  };

  it('the demand fires ON declaration: the attack is legal to declare, the sacrifice is then OWED — a real sacrifice event (listeners fire) while the attack waits on the stack, then it proceeds', () => {
    seedCombat(
      { b1: mkConstruct('pay', 'Watch Post', 3, { subtype: 'Fortification' }), b2: mkConstruct('sw', 'Siegeworks', 3, { subtype: 'Fortification' }) },
      {});
    armAttack('att');
    gs.getState().resolveAttack('def');
    const pfs = g().pendingForcedSacrifice;
    expect(pfs?.lp, "the ATTACKING companion's controller pays").toBe('p1');
    expect(pfs?.sourceName).toBe('The Final Word');
    expect(g().triggerStack?.some(e => e.kind === 'attackDamage'), 'the declared attack WAITS beneath the pause').toBe(true);
    expect(g().p2.board.f1?.hp, 'no damage yet').toBe(9);
    expect(reactiveHold(g(), 'p2'), 'the opponent waits while the payer chooses').toMatch(/The Final Word \(forced sacrifice\)/);
    expect(reactiveHold(g(), 'p1'), 'the payer is never held by their own prompt').toBeNull();
    gs.getState().endTurn();
    expect(g().activePlayer, 'endTurn refused while the sacrifice is owed').toBe('p1');
    roundTrips();
    const handBefore = g().p1.hand.length;
    gs.getState().resolveForcedSacrifice('pay');
    // Synthetic name — assert board exit, never burial (the arc-C lesson); the
    // Siegeworks draw below is the proof the sacrifice EVENT was real.
    expect(g().p1.board.b1, 'the sacrifice left the board').toBeUndefined();
    expect(g().p1.hand.length, "Siegeworks heard its owner's sacrifice (listener resolved inside the pause)").toBe(handBefore + 1);
    expect(g().p2.board.f1?.hp, 'the stack resumed — the attack landed').toBe(6);
    expect(g().p1.board.f1?.exhausted, 'the attacker spent its attack').toBe(true);
    expect(g().pendingForcedSacrifice ?? null, 'prompt cleared').toBeFalsy();
    expect(g().triggerStack ?? null, 'stack drained').toBeFalsy();
  });

  it('MANDATORY — no decline exists: invalid picks (the PC, an opposing permanent) leave the prompt armed and the attack waiting', () => {
    seedP1({ board: { f1: mkComp('att', 'Attacker', { fresh: false, atk: 3 }), b3: mkPc('pc-1') } },
      { board: { f2: finalWord(), f1: mkComp('def', 'Defender', { hp: 9, maxHp: 9 }) } });
    armAttack('att');
    gs.getState().resolveAttack('def');
    expect(g().pendingForcedSacrifice).toBeTruthy();
    gs.getState().resolveForcedSacrifice('pc-1');   // the PC is never a legal sacrifice (2026-07-24 chokepoint)
    expect(g().pendingForcedSacrifice, 'PC refused — still owed').toBeTruthy();
    gs.getState().resolveForcedSacrifice('def');    // not the payer's permanent
    expect(g().pendingForcedSacrifice, "opponent's permanent refused — still owed").toBeTruthy();
    expect(g().triggerStack?.some(e => e.kind === 'attackDamage'), 'the attack still waits').toBe(true);
    expect(g().p2.board.f1?.hp).toBe(9);
    // The only way through is a real payment — here, the attacker itself.
    gs.getState().resolveForcedSacrifice('att');
    expect(g().pendingForcedSacrifice ?? null).toBeFalsy();
  });

  it('self-sacrifice is the literal reading and rides the STOCK Glass Cannon precedent: declared (Iron Spikes fires first), attacker sacrificed, damage step fizzles', () => {
    seedCombat({}, { b2: mkConstruct('spikes', 'Iron Spikes', 2, { subtype: 'Trap' }) });
    armAttack('att');
    gs.getState().resolveAttack('def');
    // Two defender-side declaration triggers → their OWNER orders (2026-07-22).
    const po = g().pendingTriggerOrder;
    expect(po?.lp, 'the defender orders their simultaneous declaration triggers').toBe('p2');
    const spikesIdx = po!.items.findIndex(it => it.kind === 'reactive' && it.sourceName === 'Iron Spikes');
    gs.getState().resolveTriggerOrder(spikesIdx); // Spikes first, The Final Word after
    expect(g().p1.board.f1?.hp, 'Iron Spikes fired — the attack WAS declared').toBe(4);
    expect(g().pendingForcedSacrifice?.lp, 'then the demand arms').toBe('p1');
    gs.getState().resolveForcedSacrifice('att');  // pay with the attacker itself
    expect(g().p1.board.f1, 'the attacker sacrificed itself').toBeUndefined();
    expect(g().p2.board.f1?.hp, 'no damage — the attack fizzled at the damage step').toBe(9);
    expect(lastToasts()).toMatch(/fizzles — it left the encounter before dealing damage/i);
    expect(g().triggerStack ?? null, 'stack drained through the fizzle').toBeFalsy();
  });

  it('any target counts — an attack on the PC also triggers the demand (the reworded text carries no target scope)', () => {
    seedP1({ board: { f1: mkComp('att', 'Attacker', { fresh: false, atk: 2 }) } },
      { board: { f2: finalWord(), b3: mkPc('pc-2') } });
    armAttack('att');
    gs.getState().resolveAttack('pc-2');
    expect(g().pendingForcedSacrifice?.lp, 'attacking the PC still owes the sacrifice').toBe('p1');
    gs.getState().resolveForcedSacrifice('att'); // only permanent — pay with the attacker; the PC hit fizzles
    expect(g().p2.board.b3?.hp, 'the fizzled attack never reached the PC').toBe(20);
  });

  it('PER-COPY (the literal "whenever"): two Final Words demand two sacrifices for one attack', () => {
    seedCombat(
      { b1: mkConstruct('payA', 'Watch Post', 3, { subtype: 'Fortification' }), b2: mkConstruct('payB', 'Signal Tower', 3, { subtype: 'Fortification' }) },
      { b1: mkConstruct('tfw2', 'The Final Word', 5, { subtype: 'Utterance' }) });
    armAttack('att');
    gs.getState().resolveAttack('def');
    // Two identical demands — still actively ordered by their owner (2026-07-13).
    expect(g().pendingTriggerOrder?.lp).toBe('p2');
    gs.getState().resolveTriggerOrder(0);
    expect(g().pendingForcedSacrifice, 'first demand').toBeTruthy();
    gs.getState().resolveForcedSacrifice('payA');
    expect(g().pendingForcedSacrifice, 'second demand arms after the first resolves (serialized on the stack)').toBeTruthy();
    gs.getState().resolveForcedSacrifice('payB');
    expect(g().p1.board.b1 ?? g().p1.board.b2, 'both payments gone').toBeUndefined();
    expect(g().p2.board.f1?.hp, 'then the attack landed once').toBe(6);
    expect(g().triggerStack ?? null).toBeFalsy();
  });

  it('R4 — the mandatory demand fires even with nothing left to pay: a glass-cannon attacker dies to Iron Spikes first, the demand no-ops LOUDLY, the attack fizzles', () => {
    seedP1({ board: { f1: mkComp('att', 'Glass Attacker', { fresh: false, atk: 3, hp: 1, maxHp: 1 }), b3: mkPc('pc-1') } },
      { board: { f2: finalWord(), f1: mkComp('def', 'Defender', { hp: 9, maxHp: 9 }), b2: mkConstruct('spikes', 'Iron Spikes', 2, { subtype: 'Trap' }) } });
    armAttack('att');
    gs.getState().resolveAttack('def');
    const po = g().pendingTriggerOrder;
    const spikesIdx = po!.items.findIndex(it => it.kind === 'reactive' && it.sourceName === 'Iron Spikes');
    gs.getState().resolveTriggerOrder(spikesIdx); // Spikes first: the 1-hp attacker dies pre-demand
    expect(g().p1.board.f1, 'the attacker died to the declaration trap').toBeUndefined();
    expect(g().pendingForcedSacrifice ?? null, 'nothing sacrificeable remains (PC never counts) — the mandatory demand no-ops').toBeFalsy();
    expect(lastToasts()).toMatch(/nothing left to sacrifice/i);
    expect(g().p2.board.f1?.hp, 'and the attack fizzled (Glass Cannon)').toBe(9);
    expect(g().triggerStack ?? null).toBeFalsy();
  });

  it("the construct itself does not fight (not attackable), the demand dies with it, and the controller's OWN companions attack freely", () => {
    seedCombat();
    armAttack('att');
    gs.getState().resolveAttack('tfw');
    expect(lastToasts()).toMatch(/Constructs cannot be attacked/i);
    expect(g().pendingForcedSacrifice ?? null, 'a refused declaration owes nothing').toBeFalsy();
    // Remove The Final Word — the same attack now commits promptless.
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { ...s.game.p2.board, f2: undefined } } } }));
    armAttack('att');
    gs.getState().resolveAttack('def');
    expect(g().pendingForcedSacrifice ?? null, 'no source — no demand').toBeFalsy();
    expect(g().p2.board.f1?.hp, 'attack landed directly').toBe(6);
    // Own side: the Final Word's controller attacks toll-free (opposing scope).
    seedP1({ board: { f1: mkComp('mine', 'P1 Defender', { hp: 8, maxHp: 8 }) } },
      { board: { f2: finalWord(), f1: mkComp('p2att', 'P2 Attacker', { fresh: false, atk: 2 }) } });
    gs.setState(s => ({ localPlayer: 'p2' as const,
      pending: { action: 'attack', charId: 'p2att' },
      game: { ...s.game, activePlayer: 'p2' as const, currentPhase: 'action' as const } }));
    gs.getState().resolveAttack('mine');
    expect(g().pendingForcedSacrifice ?? null, "the Final Word's own side owes nothing").toBeFalsy();
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
