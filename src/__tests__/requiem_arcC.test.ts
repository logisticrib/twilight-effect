// REQUIEM deck — Arc C (HAUNT + Memory counters), 2026-08-25. Five cards convert:
// Barrowlight Ghoul, Sallow Revenant (keyword-only), Marrowlight Lich (Haunt half —
// the return re-fires Entomb 2), Conductor of the Unquiet (count-derived attack),
// Crown of the Unquiet King (item grant via ITEM_GRANTED_KEYWORDS).
//
// RULES UNDER TEST (MKL HAUNT, reworked 2026-08-25):
// - "When this companion dies, if it had no Memory counters on it, return it from
//   your Dead Zone to an empty Command Zone slot you control, exhausted, with a
//   Memory counter on it."
// - The death fully happens FIRST (card touches the Dead Zone; listeners fire).
// - A FLEE is a death and haunts (self-balancing). PER-STINT: counters cease on
//   zone change, outside reanimation resets Haunt. Full board = no return AND no
//   counter (Haunt retained — supersedes 'spent'). The return is an ENTER (enter
//   windows re-fire; Paranoia does NOT — a return is not a play).
// - MEMORY COUNTERS ARE GENERAL (owner flag): no provenance, any placer gates Haunt.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz, mkItem } from './helpers';
import { effectiveAttack } from '../store/gameStore';
import { destroyEntity, applyReadyRemovals, armNextItemTransfer } from '../engine';
import { CATALOG, REQUIEM_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';

const rc = (name: string): Card => {
  const c = REQUIEM_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`Requiem card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);

function seed(p1board: Record<string, ReturnType<typeof mkComp>>,
              over: { dead?: Card[]; deck?: Card[]; willpower?: number } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: [], board: p1board, dead: over.dead ?? [],
      deck: over.deck ?? s.game.p1.deck,
      classZone: czCards.map((c, i) => mkCz(c, 'Necromancer', `cz-${i}`)),
      willpower: over.willpower ?? 5 },
    p2: { ...s.game.p2, board: { b2: mkPc('pc-2') } },
  } }));
}
const g = () => gs.getState().game;
const filler = CATALOG.filter(c => c.type === 'Companion' && !c.dev).slice(0, 6);
/** A board entity seeded FROM its printed card — keywords/level/stats real (the
 *  mkComp default of keywords: [] hides printed keywords, which Haunt reads). */
const fromCard = (id: string, name: string, over: Record<string, unknown> = {}) => {
  const c = rc(name);
  return mkComp(id, name, { level: c.level, atk: c.attack ?? undefined,
    hp: c.hp ?? 1, maxHp: c.hp ?? 1, keywords: c.keywords, ...over });
};
const ghoul = (id = 'ghoul', over: Record<string, unknown> = {}) => fromCard(id, 'Barrowlight Ghoul', over);

/** Kill an entity through the REAL death chokepoint, then drive the arming. */
function kill(entityId: string, cause: 'damage' | 'sacrifice' | 'destroy' = 'damage') {
  gs.setState(s => {
    const d = destroyEntity(s.game, entityId, [], [], cause);
    // The real flow arms/evaporates Item Transfer windows before anything else —
    // armHaunt deliberately waits for them ("the death fully happens first").
    return { game: armNextItemTransfer(d.game) };
  });
  gs.getState().armHaunt();
}

describe('HAUNT — the death fully happens, then the return', () => {
  it('dies → touches the Dead Zone → returns exhausted with ONE Memory counter (auto-place when one slot opens up... here the owner picks: >1 open)', () => {
    seed({ b3: mkPc('pc-1'), f1: ghoul() });
    kill('ghoul');
    // Death fully happened first: the card reached the Dead Zone before any return —
    // and with >1 open slots, the OWNER's slot pick is armed rather than auto-placed.
    const ph = g().pendingHauntReturn;
    expect(ph?.cardName).toBe('Barrowlight Ghoul');
    expect(ph?.lp, 'routed to the OWNER').toBe('p1');
    expect(g().p1.dead.some(c => c.name === 'Barrowlight Ghoul'), 'still in the Dead Zone while the pick is up').toBe(true);
    // The owner picks a FRONT slot — the ratified wording carries no line restriction.
    expect(ph!.eligibleSlots).toContain('f2');
    gs.getState().resolveHauntSlot('f2');
    const back = g().p1.board.f2;
    expect(back?.name).toBe('Barrowlight Ghoul');
    expect(back?.exhausted, 'returns exhausted').toBe(true);
    expect(back?.memoryCounters, 'wearing exactly one Memory counter').toBe(1);
    expect(back?.fresh, 'the return is an ENTER — the willpower gate applies').toBe(true);
    expect(g().p1.dead.some(c => c.name === 'Barrowlight Ghoul'), 'no longer dead').toBe(false);
  });

  it('dies CARRYING a Memory counter → stays dead (the per-stint gate; provenance-blind)', () => {
    seed({ b3: mkPc('pc-1'), f1: ghoul('ghoul', { memoryCounters: 1 }) });
    kill('ghoul');
    expect(g().pendingHauntReturn ?? null).toBeFalsy();
    expect(g().pendingHauntQueue ?? null, 'nothing even queued').toBeFalsy();
    expect(g().p1.dead.some(c => c.name === 'Barrowlight Ghoul'), 'it stays down').toBe(true);
  });

  it('full board at return time → stays dead, NO counter, and a LATER death haunts again (Haunt retained)', () => {
    // The dying companion vacates its OWN slot, so a genuinely full board at RETURN
    // time needs that slot refilled between the death and the arming — exactly what
    // the deferred-return design allows (the death resolves first; the return arms
    // later, against the board as it stands THEN).
    const full: Record<string, ReturnType<typeof mkComp>> = { b3: mkPc('pc-1'), f1: ghoul() };
    let i = 0;
    for (const sl of ['f2', 'f3', 'b1', 'b2'] as const) full[sl] = mkComp(`x${i}`, filler[i++ % filler.length].name);
    seed(full);
    gs.setState(s => ({ game: destroyEntity(s.game, 'ghoul', [], [], 'damage').game }));
    // Something claims the vacated slot before the return arms.
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      board: { ...s.game.p1.board, f1: mkComp('squatter', filler[4].name) } } } }));
    gs.getState().armHaunt();
    expect(g().pendingHauntReturn ?? null, 'no pick — no room').toBeFalsy();
    expect(g().p1.dead.some(c => c.name === 'Barrowlight Ghoul')).toBe(true);
    // Outside recursion brings it back (seeded directly, clean — per-stint), a slot is
    // open now, and it dies AGAIN: Haunt was never spent, so it returns this time.
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      dead: s.game.p1.dead.filter(c => c.name !== 'Barrowlight Ghoul'),
      board: { b3: s.game.p1.board.b3!, f1: ghoul('ghoul-2') } } } }));
    kill('ghoul-2');
    expect(g().pendingHauntReturn?.cardName, 'the retained Haunt fires on the second death').toBe('Barrowlight Ghoul');
  });
});

describe('HAUNT — a FLEE is a death (self-balancing)', () => {
  it('flees at the ready phase → queued → returns exhausted with the counter', () => {
    // Ghoul is level 2; willpower 1 → it flees.
    seed({ b3: mkPc('pc-1'), f1: ghoul() }, { willpower: 1 });
    gs.setState(s => {
      const r = applyReadyRemovals(s.game, 'p1', 'Your');
      return { game: r.game };
    });
    expect(g().p1.dead.some(c => c.name === 'Barrowlight Ghoul'), 'fled to the Dead Zone').toBe(true);
    expect(g().pendingHauntQueue?.length, 'the owed return queued from the flee exit').toBe(1);
    gs.getState().armHaunt();
    // Board has plenty of room (>1 slots) → the owner picks; take one.
    gs.getState().resolveHauntSlot(g().pendingHauntReturn!.eligibleSlots[0] as never);
    const returned = Object.values(g().p1.board).find(e => e?.name === 'Barrowlight Ghoul');
    expect(returned?.memoryCounters).toBe(1);
    // Willpower is still 1 < level 2: the NEXT check flees it again — and this time
    // it carries the counter, so it stays down. Self-balancing, end to end.
    gs.setState(s => ({ game: applyReadyRemovals(s.game, 'p1', 'Your').game }));
    gs.getState().armHaunt();
    expect(g().pendingHauntReturn ?? null, 'second flee: the counter gates the return').toBeFalsy();
    expect(g().p1.dead.some(c => c.name === 'Barrowlight Ghoul')).toBe(true);
  });
});

describe('the return is an ENTER', () => {
  it('Marrowlight Lich re-fires ENTOMB 2 on his own Haunt return (the pinned collision)', () => {
    const [A, B, C] = filler;
    seed({ b3: mkPc('pc-1'), f1: fromCard('lich', 'Marrowlight Lich') }, { deck: [A, B, C] });
    kill('lich');
    gs.getState().resolveHauntSlot(g().pendingHauntReturn!.eligibleSlots[0] as never);
    expect(Object.values(g().p1.board).some(e => e?.name === 'Marrowlight Lich'), 'returned').toBe(true);
    // The enter window fired: Entomb 2 milled the top two on the RETURN.
    expect(g().p1.deck.map(c => c.id)).toEqual([C.id]);
    expect(g().p1.dead.filter(c => [A.id, B.id].includes(c.id)).length, 'the return mills again').toBe(2);
  });

  it('an opposing enter-trap hears the return; Paranoia does NOT (a return is not a play)', () => {
    // Paranoia carrier on p2: a PLAY window — must stay silent on a Haunt return.
    seed({ b3: mkPc('pc-1'), f1: ghoul() });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2,
      board: { ...s.game.p2.board, f1: mkComp('par', 'Watcher', { keywords: ['Paranoia'] }) } } } }));
    kill('ghoul');
    gs.getState().resolveHauntSlot(g().pendingHauntReturn!.eligibleSlots[0] as never);
    expect(g().pendingPeek ?? null, 'no Paranoia peek — returns are enters, not plays').toBeFalsy();
    expect(Object.values(g().p1.board).some(e => e?.name === 'Barrowlight Ghoul'), 'the return completed').toBe(true);
  });
});

describe('Crown of the Unquiet King — the item grant', () => {
  it('a plain companion wearing the Crown haunts; the returned body is BARE but marked — a second death stays down', () => {
    const bearer = mkComp('bear', filler[0].name, { hp: 3,
      loadout: { weapon: null, gear: [mkItem('crown', 'Crown of the Unquiet King')] } });
    // The PC is exhausted, so the death's Item Transfer window has no eligible
    // rescuer and evaporates — the Crown rests in the Dead Zone and the Haunt
    // return can arm (the death fully happened).
    seed({ b3: mkPc('pc-1', { exhausted: true, tapped: 'major' }), f1: bearer });
    kill('bear');
    expect(g().pendingHauntReturn?.cardName, 'the granted Haunt fired').toBe(filler[0].name);
    gs.getState().resolveHauntSlot(g().pendingHauntReturn!.eligibleSlots[0] as never);
    const back = Object.values(g().p1.board).find(e => e?.name === filler[0].name)!;
    expect(back.loadout ?? null, 'the body returns bare — the Crown went to the Dead Zone').toBeFalsy();
    expect(back.memoryCounters).toBe(1);
    // It dies again WITHOUT the Crown: the counter (not the item) is the tracker.
    kill(back.id);
    expect(g().pendingHauntReturn ?? null, 'stays down — marked').toBeFalsy();
    expect(g().pendingHauntQueue ?? null).toBeFalsy();
  });
});

describe('Conductor of the Unquiet — the count-derived attack', () => {
  it('effectiveAttack = printed 2 + own Dead-Zone companion census, tracked LIVE in both directions', () => {
    const deadComps = [filler[0], filler[1], filler[2]];
    const deadItem = CATALOG.find(c => c.type === 'Item')!;
    seed({ b3: mkPc('pc-1'), f1: mkComp('cond', 'Conductor of the Unquiet', { atk: 2, hp: 6 }) },
      { dead: [...deadComps, deadItem] });
    expect(effectiveAttack(g().p1.board.f1!, g()), '2 + 3 companions (the item never counts)').toBe(5);
    // A mill raises it the moment it happens…
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, dead: [...s.game.p1.dead, filler[3]] } } }));
    expect(effectiveAttack(g().p1.board.f1!, g())).toBe(6);
    // …and recursion lowers it (derive-on-read, nothing stamped).
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, dead: s.game.p1.dead.slice(0, 1) } } }));
    expect(effectiveAttack(g().p1.board.f1!, g())).toBe(3);
  });

  it("the OPPONENT's Dead Zone never counts", () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('cond', 'Conductor of the Unquiet', { atk: 2, hp: 6 }) });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, dead: [filler[0], filler[1]] } } }));
    expect(effectiveAttack(g().p1.board.f1!, g()), 'printed 2 only').toBe(2);
  });
});
