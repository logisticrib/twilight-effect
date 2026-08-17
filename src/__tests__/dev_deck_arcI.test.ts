// DEV deck — Arc I (control theft), 2026-08-11 — the LAST Phase 2 card.
// Command the Broken (26): "Gain control of target opposing companion with 2 or
// less HP until end of turn. It gains ZEALOUS until end of turn."
//
// OWNER RULINGS (locked, session brief 2026-08-11): control is REAL relocation —
// board membership, not an overlay (ruling 2; every "your companions" read follows
// free); relocation is NOT a replay and NOT an enter (ruling 3 — no placeCard, no
// onEnter/Paranoia/Scavenger re-fires); OWNERSHIP never changes — deaths/bounces
// route to the owner's zones via BoardEntity.stolenFrom (ruling 4); one clock —
// control and the Zealous grant expire at the same endTurn boundary (ruling 5);
// reversion placement is the OWNER's choice of ANY open slot, Front or Back (the
// ratified GENERAL rule for effect-placement without passing through hand,
// ruling 6), and a full board sacrifices to the owner's Dead Zone (the flee
// OUTCOME, never the flee trigger).
//
// TIMING FINDING (B, diagnosed): endTurn runs runReadyPhase for the NEXT player
// BEFORE flipping activePlayer — so reversion is the FIRST substantive endTurn
// step (before the buff boundary and the ready phase), pausing the turn on the
// owner's slot pick. A late reversion would miss the owner's entire ready step;
// the exhausted-steals-home-then-readies pin below is the proof.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz } from './helpers';
import { reactiveHold, resolveActionEffects } from '../store/gameStore';
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
const realComp = CATALOG.find(c => c.type === 'Companion')!; // burial/hand membership is name-keyed (the arc-C lesson)

function seedP1(over: { board?: Record<string, ReturnType<typeof mkComp>>; hand?: Card[]; dead?: Card[] },
                p2over: { board?: Record<string, ReturnType<typeof mkComp>>; hand?: Card[]; dead?: Card[] } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: over.hand ?? [], board: over.board ?? {}, dead: over.dead ?? [],
      classZone: czFor('Doom-Whisperer'), willpower: 5 },
    p2: { ...s.game.p2, board: p2over.board ?? {}, hand: p2over.hand ?? [], dead: p2over.dead ?? [] },
  } }));
}
const g = () => gs.getState().game;
const playAs = (actorId: string, card: Card) => {
  gs.setState(s => ({ game: { ...s.game, selected: actorId, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
};
const lastToasts = () => gs.getState().toasts.map(t => t.msg).join(' || ');
const roundTrips = () => expect(JSON.parse(JSON.stringify(g()))).toEqual(g());

/** Cast + steal `vicId` onto the caster's `slot`. Assumes seedP1 put a PC at b3. */
const steal = (vicId: string, slot: SlotId) => {
  playAs('pc-1', dc('Command the Broken'));
  const pa = gs.getState().pendingActionTarget;
  expect(pa?.twoStep, 'two-step steal armed').toBe('gainControl');
  gs.getState().resolveActionTarget(vicId);
  expect(gs.getState().pendingActionTarget?.eligibleSlots?.length, 'step 2: slot pick armed').toBeGreaterThan(0);
  gs.getState().resolveActionSlot(slot);
};

describe('Command the Broken (26) — the steal: real relocation, hp gate, Zealous, no re-enter', () => {
  it('steals a ≤2-hp opposing companion onto ANY chosen slot (front included): board membership moves, stolenFrom marks ownership, fresh+Zealous per ruling 2', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('vic', 'Victim', { hp: 2, maxHp: 2, atk: 2, fresh: false }),
      f2: mkComp('tank', 'Tough One', { hp: 5 }),
    } });
    playAs('pc-1', dc('Command the Broken'));
    const pa = gs.getState().pendingActionTarget;
    expect(pa?.eligibleIds, 'CURRENT-hp gate: only the 2-hp companion is stealable').toEqual(['vic']);
    gs.getState().resolveActionTarget('vic');
    const slots = gs.getState().pendingActionTarget?.eligibleSlots ?? [];
    expect(slots.includes('f1' as SlotId), 'FRONT slots offered — "any available slot" (ruling 2)').toBe(true);
    gs.getState().resolveActionSlot('f1');
    const stolen = g().p1.board.f1;
    expect(stolen?.id, 'the SAME entity, relocated (not a copy)').toBe('vic');
    expect(g().p2.board.f1, 'gone from the owner\'s board — control IS membership').toBeUndefined();
    expect(stolen?.stolenFrom, 'ownership marker').toBe('p2');
    expect(stolen?.fresh, 'relocation is an entry for the Major-Action check (ruling 2)').toBe(true);
    const kws = gs.getState().game.p1.board.f1;
    expect(kws?.buffs?.some(b => b.grant?.includes('Zealous') && b.until === 'endOfTurn'), 'the Zealous grant, same clock').toBe(true);
    expect(g().p1.dead.some(c => c.name === 'Command the Broken'), 'the action buried itself').toBe(true);
    expect(g().pendingReversion ?? null).toBeFalsy();
  });

  it('the stolen companion attacks its former allies the SAME turn — Zealous bypasses the fresh gate (the card\'s own rationale)', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('vic', 'Victim', { hp: 2, maxHp: 2, atk: 3, fresh: false }),
      f2: mkComp('ally', 'Former Ally', { hp: 9, maxHp: 9 }),
    } });
    steal('vic', 'f1');
    gs.getState().beginAttack('vic');
    expect(gs.getState().pending?.action, 'the fresh gate passes via granted Zealous').toBe('attack');
    gs.getState().resolveAttack('ally');
    expect(g().p2.board.f2?.hp, 'the betrayal lands').toBe(6);
    expect(g().p1.board.f1?.exhausted, 'a normal activation').toBe(true);
  });

  it('pre-cost refusal (ruling 1): no ≤2-hp target → the card CANNOT be played — it stays in hand and nothing is paid', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: { f1: mkComp('tank', 'Tough One', { hp: 5 }) } });
    playAs('pc-1', dc('Command the Broken'));
    expect(lastToasts()).toMatch(/no legal target within the HP limit/i);
    expect(g().p1.hand.some(c => c.name === 'Command the Broken'), 'card still in hand').toBe(true);
    expect(g().p1.dead.length, 'not buried').toBe(0);
    expect(g().p1.classZone.every(c => !c.faceDown), 'no Class Zone card flipped — nothing paid').toBe(true);
    expect(gs.getState().pendingActionTarget ?? null).toBeFalsy();
  });

  it('pre-cost refusal: a full caster board also refuses (nowhere to place the steal)', () => {
    const full: Record<string, ReturnType<typeof mkComp>> = { b3: mkPc('pc-1') };
    (['f1', 'f2', 'f3', 'b1', 'b2'] as const).forEach((sl, i) => { full[sl] = mkComp(`own${i}`, `Own ${i}`); });
    seedP1({ board: full }, { board: { f1: mkComp('vic', 'Victim', { hp: 2 }) } });
    playAs('pc-1', dc('Command the Broken'));
    expect(lastToasts()).toMatch(/no available slot/i);
    expect(g().p1.hand.some(c => c.name === 'Command the Broken'), 'card still in hand').toBe(true);
  });

  it('ruling 3 — relocation is NOT a play and NOT an enter: no Echo-Keeper peek, no Scavenger re-fire, no dead pick', () => {
    seedP1({ board: { b3: mkPc('pc-1'), f2: mkComp('ek', 'Echo-Keeper') } }, {
      board: { f1: mkComp('crow', 'Carrion Crow', { hp: 2, maxHp: 2, keywords: ['Scavenger'] }) },
      dead: [CATALOG.find(c => c.type === 'Item')!],
    });
    steal('crow', 'b1');
    expect(g().p1.board.b1?.name, 'the Scavenger companion relocated').toBe('Carrion Crow');
    expect(g().pendingPeek ?? null, 'no companion was PLAYED — Echo-Keeper silent').toBeFalsy();
    expect(g().pendingDeadPick ?? null, 'no ENTER happened — Scavenger silent').toBeFalsy();
    expect(g().triggerStack ?? null, 'no play/enter window ever opened').toBeFalsy();
  });
});

describe('Command the Broken (26) — the reversion: before the owner\'s ready phase, owner-chosen slot, one clock', () => {
  const stealSetup = (p2extra: Record<string, ReturnType<typeof mkComp>> = {}) => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('vic', realComp.name, { hp: 2, maxHp: 2, atk: 2, fresh: false }),
      b3: mkPc('pc-2'), ...p2extra,
    } });
    steal('vic', 'f1');
  };

  it('>1 open slot: endTurn PAUSES on the OWNER\'s pick (turn not ended, caster held); a FRONT slot is legal (ruling 6); the exhausted steal comes home and is READIED by their ready phase (the timing finding)', () => {
    stealSetup();
    // Exhaust the stolen companion under the caster's control first.
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { ...s.game.p1.board,
      f1: { ...s.game.p1.board.f1!, exhausted: true, tapped: 'major' } } } } }));
    gs.getState().endTurn();
    const pr = g().pendingReversion;
    expect(pr?.lp, 'the OWNER chooses the slot').toBe('p2');
    expect(pr?.entId).toBe('vic');
    expect(g().activePlayer, 'the turn has NOT ended — reversion precedes the ready phase').toBe('p1');
    expect(reactiveHold(g(), 'p1'), 'the caster waits for the owner').toMatch(/returning to its owner/);
    expect(reactiveHold(g(), 'p2'), 'the owner is never held by their own pick').toBeNull();
    roundTrips();
    gs.getState().resolveReversionSlot('f2'); // FRONT — the ratified any-line exception
    const home = g().p2.board.f2;
    expect(home?.id, 'home, in the owner-chosen FRONT slot').toBe('vic');
    expect(home?.stolenFrom, 'ownership marker consumed').toBeUndefined();
    expect(home?.buffs?.some(b => b.grant?.includes('Zealous')), 'the Zealous grant died with the control — ONE clock (ruling 5)').toBeFalsy();
    expect(g().activePlayer, 'the paused turn then completed').toBe('p2');
    expect(home?.exhausted, 'READIED by its owner\'s ready phase — reversion ran first (finding B)').toBe(false);
    expect(g().pendingReversion ?? null).toBeFalsy();
  });

  it('exactly one open slot: auto-placed, no prompt, the turn flows through', () => {
    const p2extra: Record<string, ReturnType<typeof mkComp>> = {};
    (['f2', 'f3', 'b1'] as const).forEach((sl, i) => { p2extra[sl] = mkComp(`o${i}`, `Occ ${i}`); });
    stealSetup(p2extra); // p2 board: f2,f3,b1 occupied + pc b3 → after the steal, only f1 and b2 open… fill f1:
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { ...s.game.p2.board,
      f1: mkComp('o9', 'Occ 9') } } } }));
    gs.getState().endTurn();
    expect(g().pendingReversion ?? null, 'singleton — no choice content, no prompt').toBeFalsy();
    expect(g().p2.board.b2?.id, 'auto-placed in the only open slot').toBe('vic');
    expect(g().activePlayer, 'turn completed in one pass').toBe('p2');
  });

  it('FULL owner board: sacrificed to the OWNER\'s Dead Zone (recoverable) — the flee OUTCOME, never the flee trigger (Dread Chorister silent)', () => {
    const p2extra: Record<string, ReturnType<typeof mkComp>> = {};
    (['f2', 'f3', 'b1', 'b2'] as const).forEach((sl, i) => { p2extra[sl] = mkComp(`o${i}`, `Occ ${i}`); });
    stealSetup(p2extra); // p2: f2,f3,b1,b2 + pc b3 occupied; f1 vacated by the steal → fill it:
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { ...s.game.p1.board, f2: mkComp('chor', 'Dread Chorister') } },
      p2: { ...s.game.p2, board: { ...s.game.p2.board, f1: mkComp('o9', 'Occ 9') } } } }));
    const p1Hand = g().p1.hand.length;
    gs.getState().endTurn();
    expect(g().pendingReversion ?? null, 'no slot to offer — no prompt').toBeFalsy();
    expect(Object.values(g().p1.board).some(e => e?.id === 'vic'), 'off the caster\'s board').toBe(false);
    expect(Object.values(g().p2.board).some(e => e?.id === 'vic'), 'not on the owner\'s either').toBe(false);
    expect(g().p2.dead.some(c => c.name === realComp.name), 'sacrificed to the OWNER\'s Dead Zone (ruling 4)').toBe(true);
    expect(g().p1.hand.length, 'Dread Chorister heard NO flee — a sacrifice outcome, not the flee trigger (ruling 6)').toBe(p1Hand);
    expect(lastToasts()).toMatch(/nowhere to return/i);
  });
});

describe('Command the Broken (26) — ownership routes zones while stolen (ruling 4)', () => {
  it('dies under stolen control → the card goes to the ORIGINAL OWNER\'s Dead Zone', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('vic', realComp.name, { hp: 2, maxHp: 2, fresh: false }), b3: mkPc('pc-2') } });
    steal('vic', 'f1');
    const r = resolveActionEffects(g(), 'p2', 'Test Bolt', [{ op: 'damage', amount: 5, target: 'enemyCompanion' }], 'vic');
    gs.setState(() => ({ game: r.game }));
    expect(Object.values(g().p1.board).some(e => e?.id === 'vic'), 'dead on the caster\'s board').toBe(false);
    expect(g().p2.dead.some(c => c.name === realComp.name), 'buried in the OWNER\'s Dead Zone').toBe(true);
    expect(g().p1.dead.some(c => c.name === realComp.name), 'not the controller\'s').toBe(false);
  });

  it('bounced while stolen → the card returns to the ORIGINAL OWNER\'s hand', () => {
    seedP1({ board: { b3: mkPc('pc-1') } }, { board: {
      f1: mkComp('vic', realComp.name, { hp: 2, maxHp: 2, fresh: false }), b3: mkPc('pc-2') } });
    steal('vic', 'f1');
    const r = resolveActionEffects(g(), 'p2', 'Test Gust', [{ op: 'bounce', target: 'enemyCompanion' }], 'vic');
    gs.setState(() => ({ game: r.game }));
    expect(g().p2.hand.some(c => c.name === realComp.name), 'home to the OWNER\'s hand').toBe(true);
    expect(g().p1.hand.some(c => c.name === realComp.name), 'never the controller\'s').toBe(false);
  });
});
