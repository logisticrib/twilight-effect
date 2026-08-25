// REQUIEM deck — Arc D (the reanimation family), 2026-08-25. Six cards convert:
// Duskveil Wraith (death-trigger hand-return excluding itself), Gravemarsh
// Reanimator (enter-reanimate ≤3), Raise the Marrow (≤1), Echoes of the Departed
// (any), The Great Unrest ("up to three" ≤2), Requiem of the Hollow Bell (destroy +
// level-coupled return).
//
// RULES UNDER TEST:
// - returnFromDead to:'encounter' — the picked companion RE-ENTERS: a real ENTER
//   (windows re-fire: a reanimated Entomb carrier mills again; Paranoia stays
//   silent — a return is not a play), exhausted + fresh (the willpower gate).
// - "Up to N": sequential pick→slot→enter rounds, options evaluated FRESH each
//   round; declining stops the loop; the pre-cost gate needs one eligible + one
//   open slot (the dd000096 precedent).
// - levelFromDestroyed: the cap is the level of the companion THIS resolution
//   destroyed. excludeSelf: 'another' — the trigger's own card is barred.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz } from './helpers';
import { destroyEntity, armNextItemTransfer, armPrompts } from '../engine';
import { CATALOG, REQUIEM_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';

const rc = (name: string): Card => {
  const c = REQUIEM_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`Requiem card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);

function seed(p1board: Record<string, ReturnType<typeof mkComp>>,
              over: { dead?: Card[]; deck?: Card[] } = {},
              p2board: Record<string, ReturnType<typeof mkComp>> = { b2: mkPc('pc-2') }) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: [], board: p1board, dead: over.dead ?? [],
      deck: over.deck ?? s.game.p1.deck,
      classZone: czCards.map((c, i) => mkCz(c, 'Necromancer', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2board },
  } }));
}
const g = () => gs.getState().game;
const play = (card: Card) => {
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1', p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
};
const filler = CATALOG.filter(c => c.type === 'Companion' && !c.dev).slice(0, 6);
const byLevel = (lvl: number) => {
  const c = CATALOG.find(x => x.type === 'Companion' && !x.dev && x.level === lvl);
  if (!c) throw new Error(`no shipped companion at level ${lvl}`);
  return c;
};
const pickByName = (name: string) => {
  const dp = g().pendingDeadPick!;
  const opt = dp.options.find(o => o.card.name === name)!;
  gs.getState().resolveDeadPick(opt.idx);
};
const takeSlot = () => {
  const pdr = g().pendingDeadReturn;
  if (pdr) gs.getState().resolveReturnSlot(pdr.eligibleSlots[0] as never);
};

describe('Echoes of the Departed — the base reanimation', () => {
  it('play → dead pick → slot pick → enters EXHAUSTED + fresh; the enter window re-fires (a reanimated Entomb carrier MILLS AGAIN)', () => {
    const rat = rc('Gravegnaw Rat');
    const [A, B] = filler;
    seed({ b3: mkPc('pc-1') }, { dead: [rat], deck: [A, B] });
    play(rc('Echoes of the Departed'));
    expect(g().pendingDeadPick?.source).toBe('Echoes of the Departed');
    pickByName('Gravegnaw Rat');
    takeSlot();
    const ent = Object.values(g().p1.board).find(e => e?.name === 'Gravegnaw Rat')!;
    expect(ent.exhausted, 'enters exhausted').toBe(true);
    expect(ent.fresh, 'a real enter — the willpower gate applies').toBe(true);
    expect(ent.memoryCounters ?? 0, 'a PLAIN reanimation places NO Memory counter').toBe(0);
    expect(g().p1.deck.map(c => c.id), 'Entomb 1 re-fired on the reanimated entry').toEqual([B.id]);
    expect(g().p1.dead.some(c => c.id === A.id), 'the milled card').toBe(true);
  });

  it('Paranoia stays silent on a reanimated entry (not a play)', () => {
    seed({ b3: mkPc('pc-1') }, { dead: [filler[0]] },
      { b2: mkPc('pc-2'), f1: mkComp('par', 'Watcher', { keywords: ['Paranoia'] }) });
    play(rc('Echoes of the Departed'));
    pickByName(filler[0].name);
    takeSlot();
    expect(g().pendingPeek ?? null, 'no Paranoia peek').toBeFalsy();
    expect(Object.values(g().p1.board).some(e => e?.name === filler[0].name)).toBe(true);
  });
});

describe('level caps', () => {
  it('Raise the Marrow (≤1): a level-2 dead companion is NOT offered; level 1 is (boundary)', () => {
    const l1 = byLevel(1), l2 = byLevel(2);
    seed({ b3: mkPc('pc-1') }, { dead: [l1, l2] });
    play(rc('Raise the Marrow'));
    const names = g().pendingDeadPick!.options.map(o => o.card.name);
    expect(names).toContain(l1.name);
    expect(names, 'level 2 > cap 1').not.toContain(l2.name);
  });

  it('Gravemarsh Reanimator (≤3, on-enter): a level-4 dead companion is excluded; decline keeps the card dead', () => {
    const l2 = byLevel(2), l4 = byLevel(4);
    seed({ b3: mkPc('pc-1') }, { dead: [l2, l4] });
    // Place the Reanimator through the real play path (Back Line).
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [rc('Gravemarsh Reanimator')] } } }));
    gs.getState().beginPlay(rc('Gravemarsh Reanimator').id);
    gs.getState().placeCard('b1');
    const dp = g().pendingDeadPick;
    expect(dp?.source).toBe('Gravemarsh Reanimator');
    expect(dp?.optional, 'you MAY return').toBe(true);
    const names = dp!.options.map(o => o.card.name);
    expect(names).toContain(l2.name);
    expect(names, 'level 4 > cap 3').not.toContain(l4.name);
    gs.getState().cancelDeadPick();
    expect(g().p1.dead.length, 'declined — both stay dead').toBe(2);
  });
});

describe('The Great Unrest — up to three, evaluated fresh each round', () => {
  it('three rounds of pick→slot→enter; the loop is optional (declining stops it)', () => {
    const dead3 = [byLevel(1), byLevel(2), filler.find(c => c.level <= 2 && c.name !== byLevel(1).name && c.name !== byLevel(2).name) ?? byLevel(1)];
    // Use three DISTINCT low-level shipped companions.
    const lows = CATALOG.filter(c => c.type === 'Companion' && !c.dev && c.level <= 2).slice(0, 3);
    seed({ b3: mkPc('pc-1') }, { dead: lows });
    play(rc('The Great Unrest'));
    // Round 1
    pickByName(lows[0].name); takeSlot();
    expect(Object.values(g().p1.board).filter(e => e?.exhausted && e.kind === 'companion').length).toBe(1);
    // Round 2 re-armed with remaining options
    const dp2 = g().pendingDeadPick;
    expect(dp2?.source).toBe('The Great Unrest');
    expect(dp2!.options.map(o => o.card.name)).not.toContain(lows[0].name);
    pickByName(lows[1].name); takeSlot();
    // Round 3
    pickByName(lows[2].name); takeSlot();
    const returned = Object.values(g().p1.board).filter(e => e && e.kind === 'companion');
    expect(returned.length, 'all three returned').toBe(3);
    expect(g().pendingDeadPick ?? null, 'the loop is spent').toBeFalsy();
    expect(g().p1.dead.filter(c => c.type === 'Companion').length, 'no companions left dead (the spent ACTION card is there)').toBe(0);
  });

  it('"up to": declining round 2 stops the loop with one returned', () => {
    const lows = CATALOG.filter(c => c.type === 'Companion' && !c.dev && c.level <= 2).slice(0, 3);
    seed({ b3: mkPc('pc-1') }, { dead: lows });
    play(rc('The Great Unrest'));
    pickByName(lows[0].name); takeSlot();
    gs.getState().cancelDeadPick();
    expect(Object.values(g().p1.board).filter(e => e?.kind === 'companion').length).toBe(1);
    expect(g().p1.dead.filter(c => c.type === 'Companion').length, 'the other two stay dead').toBe(2);
    expect(g().pendingDeadPick ?? null).toBeFalsy();
  });

  it('pre-cost: castable at ONE eligible; unplayable at zero (fizzles to the Dead Zone with a refusal path)', () => {
    seed({ b3: mkPc('pc-1') }, { dead: [byLevel(4)] }); // only a level-4 — over the cap
    const before = g().p1.dead.length;
    play(rc('The Great Unrest'));
    // No eligible target: the action fizzles (the targeted-action rule) — no pick arms.
    expect(g().pendingDeadPick ?? null).toBeFalsy();
    expect(g().p1.dead.length, 'the action card itself landed in the Dead Zone').toBeGreaterThan(before);
  });
});

describe('Requiem of the Hollow Bell — destroy + level-coupled return', () => {
  it('destroying a level-3 target offers ≤3 returns only; the return is optional', () => {
    const l2 = byLevel(2), l4 = byLevel(4), l3 = byLevel(3);
    seed({ b3: mkPc('pc-1') }, { dead: [l2, l4] },
      { b2: mkPc('pc-2'), f1: mkComp('vic', l3.name, { level: 3, hp: 3 }) });
    play(rc('Requiem of the Hollow Bell'));
    // Targeted action: the destroy target pick arms store-side.
    gs.getState().resolveActionTarget('vic');
    expect(g().p2.board.f1 ?? null, 'destroyed').toBeFalsy();
    const names = g().pendingDeadPick!.options.map(o => o.card.name);
    expect(names).toContain(l2.name);
    expect(names, 'level 4 > the destroyed level 3').not.toContain(l4.name);
    gs.getState().cancelDeadPick();
    expect(g().p1.dead.some(c => c.name === l2.name), 'optional — declined').toBe(true);
  });

  it('destroying a level-1 target offers ≤1 only', () => {
    const l1 = byLevel(1), l2 = byLevel(2);
    seed({ b3: mkPc('pc-1') }, { dead: [l1, l2] },
      { b2: mkPc('pc-2'), f1: mkComp('vic', byLevel(1).name, { level: 1, hp: 1 }) });
    play(rc('Requiem of the Hollow Bell'));
    gs.getState().resolveActionTarget('vic');
    const names = g().pendingDeadPick!.options.map(o => o.card.name);
    expect(names).toContain(l1.name);
    expect(names).not.toContain(l2.name);
  });
});

describe('Duskveil Wraith — "another" (excludeSelf)', () => {
  it("its death pick excludes ITSELF (it is in the Dead Zone at resolution) but offers another dead companion, to HAND", () => {
    const other = filler[0];
    seed({ b3: mkPc('pc-1'), f1: mkComp('wraith', 'Duskveil Wraith', { hp: 4, keywords: [] }) },
      { dead: [other] });
    gs.setState(s => {
      const sink: Parameters<typeof armPrompts>[1] = [];
      const d = destroyEntity(s.game, 'wraith', sink, [], 'damage');
      // The real reducers route the sink through armPrompts — mirror that.
      return { game: armNextItemTransfer(armPrompts(d.game, sink, [])) };
    });
    // The onDeath trigger pushed its pick through the sink → arm it like the real flow.
    // destroyEntity's sink threads through armPrompts in real reducers; here the pick
    // lands via the store path when a reducer runs — emulate by checking the armed pick.
    const dp = g().pendingDeadPick;
    expect(dp?.source).toBe('Duskveil Wraith');
    const names = dp!.options.map(o => o.card.name);
    expect(names, 'itself is barred').not.toContain('Duskveil Wraith');
    expect(names).toContain(other.name);
    pickByName(other.name);
    expect(g().p1.hand.some(c => c.name === other.name), 'to HAND — the Wraith family returns to hand').toBe(true);
  });
});
