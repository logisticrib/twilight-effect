// SWORN WILD — ARC A: the destroy primitive (2026-08-19).
//
// OWNER RULING: DESTROY IS DISTINCT FROM SACRIFICE. Canon already makes sacrifice a
// specific event with its own listeners (Siegeworks: "when one of your Physical
// Constructs is sacrificed, draw"); destruction must NOT fire them. Both are "leaves the
// encounter" for generic leave/death triggers, and both send the card to its OWNER's
// Dead Zone — same destination, different event.
//
// Sub-rulings pinned here: "up to N" is castable with >=1 legal target and refuses at
// zero (universal pre-cost refusal); "destroy all Gear" is SYMMETRIC; unqualified
// "target Gear" reaches EITHER side's Gear.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { CATALOG, SWORN_WILD_DEV_CARDS } from '../data/catalog';
import { gearItemsOf } from '../engine/entities';
import type { Card } from '../types/card';

const sw = (name: string): Card => SWORN_WILD_DEV_CARDS.find(c => c.name === name)!;
const czFor = (cls: string) => CATALOG.slice(20, 25).map((c, i) => mkCz(c, cls, `cz-${i}`));

/** p1 holds `card` and can pay for it; p2 is the opposing board. */
function seed(card: Card, cls: string, p1board: Record<string, ReturnType<typeof mkComp>> = {},
              p2board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
    p1: { ...s.game.p1, hand: [card], classZone: czFor(cls), willpower: 5, dead: [],
          board: { b3: mkPc('pc-1', { cls, hp: 10, maxHp: 20 }), ...p1board } },
    p2: { ...s.game.p2, dead: [], board: p2board },
  } }));
}
const g = () => gs.getState().game;
const gear = (id: string, name = 'Guard Plate') => mkItem(id, name, { armor: 2, sub: 'Armor' });

describe('destroy vs sacrifice — the ruling', () => {
  it('destroying a Physical Construct does NOT fire on-sacrifice listeners (Siegeworks stays silent)', () => {
    const card = sw('The Ground Reclaims'); // destroy target Physical Construct, draw a card
    seed(card, 'Druid', {}, {
      f1: mkConstruct('trap-1', 'Tripwire Snare', 3, { subtype: 'Trap' }),
      f2: mkConstruct('siege', 'Siegeworks', 3, { subtype: 'Fortification' }),
    });
    const p2HandBefore = g().p2.hand.length;
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('trap-1');
    expect(g().p2.board.f1, 'the trap is destroyed').toBeFalsy();
    expect(g().p2.hand.length, 'Siegeworks did NOT draw — destroy is not a sacrifice').toBe(p2HandBefore);
  });

  it('a SACRIFICE of the same construct DOES fire it — proving the probe works', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, board: {
        f1: mkConstruct('trap-1', 'Tripwire Snare', 3, { subtype: 'Trap' }),
        f2: mkConstruct('siege', 'Siegeworks', 3, { subtype: 'Fortification' }),
      } },
    } }));
    const before = g().p2.hand.length;
    gs.getState().sacrificeEntity('trap-1');
    expect(g().p2.hand.length, 'sacrifice DOES fire the listener (control)').toBe(before + 1);
  });

  it('the destroyed card lands in its OWNER’s Dead Zone (recoverable)', () => {
    const card = sw('The Ground Reclaims');
    seed(card, 'Druid', {}, { f1: mkConstruct('trap-1', 'Tripwire Snare', 3, { subtype: 'Trap' }) });
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('trap-1');
    expect(g().p2.dead.map(c => c.name), 'to the OWNER, not the caster').toContain('Tripwire Snare');
  });

  it('the rider resolves after the destroy, in the same resolution', () => {
    const card = sw('The Ground Reclaims');
    seed(card, 'Druid', {}, { f1: mkConstruct('trap-1', 'Tripwire Snare', 3, { subtype: 'Trap' }) });
    const before = g().p1.hand.length;
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('trap-1');
    expect(g().p1.hand.length, 'played 1, drew 1').toBe(before - 1 + 1);
  });
});

describe('destroying equipped Gear', () => {
  it('strips it from the bearer’s loadout and buries the CARD', () => {
    const card = sw('Rust and Root'); // destroy target Gear
    const bearer = mkComp('wearer', 'Enemy A', { hp: 5, loadout: { weapon: null, gear: [gear('g-1', 'Mailed Hauberk'), null] } });
    seed(card, 'Druid', {}, { f1: bearer });
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('g-1');   // an ITEM id, not an entity id
    expect(g().p2.board.f1?.loadout?.gear[0], 'slot cleared').toBeNull();
    expect(g().p2.board.f1, 'the BEARER survives — only the Gear died').toBeTruthy();
    expect(g().p2.dead.map(c => c.name)).toContain('Mailed Hauberk');
  });

  it('unqualified "target Gear" reaches EITHER side’s Gear', () => {
    const card = sw('Rust and Root');
    seed(card, 'Druid',
      { f1: mkComp('mine', 'Ally', { hp: 5, loadout: { weapon: null, gear: [gear('g-mine'), null] } }) },
      { f1: mkComp('theirs', 'Enemy A', { hp: 5, loadout: { weapon: null, gear: [gear('g-theirs'), null] } }) });
    gs.getState().playAction(card.id);
    const eligible = gs.getState().pendingActionTarget!.eligibleIds;
    expect(eligible.sort(), 'both sides offered — canon adds no controller qualifier').toEqual(['g-mine', 'g-theirs']);
  });

  it('gearItemsOf offers a HEAVY piece once, though it fills both slots', () => {
    const heavy = mkItem('hv', 'Plate of the Standing Wall', { armor: 4, sub: 'Heavy Armor' });
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, board: { f1: mkComp('hw', 'Enemy A', { hp: 5, loadout: { weapon: null, gear: [heavy, heavy] } }) } },
    } }));
    expect(gearItemsOf(g()).filter(x => x.itemId === 'hv').length, 'one item, one offer').toBe(1);
  });
});

describe('union, mass, and "up to N"', () => {
  it('the union spec offers Gear AND Physical Constructs together', () => {
    const card = sw('Unmake the Works');
    seed(card, 'Druid', {}, {
      f1: mkComp('wearer', 'Enemy A', { hp: 5, loadout: { weapon: null, gear: [gear('g-1'), null] } }),
      f2: mkConstruct('trap-1', 'Tripwire Snare', 3, { subtype: 'Trap' }),
    });
    gs.getState().playAction(card.id);
    expect(gs.getState().pendingActionTarget!.eligibleIds.sort()).toEqual(['g-1', 'trap-1']);
  });

  it('"Destroy all Gear" is SYMMETRIC, and the draw counts what it actually destroyed', () => {
    const card = sw('Let the Wild In');
    seed(card, 'Druid',
      { f1: mkComp('mine', 'Ally', { hp: 5, loadout: { weapon: null, gear: [gear('g-a'), gear('g-b')] } }) },
      { f1: mkComp('theirs', 'Enemy A', { hp: 5, loadout: { weapon: null, gear: [gear('g-c'), null] } }) });
    const before = g().p1.hand.length;
    gs.getState().playAction(card.id);           // no pick — auto-scoped
    expect(gs.getState().pendingActionTarget ?? null, 'mass destroy takes no target').toBeNull();
    expect(gearItemsOf(g()).length, 'every Gear on BOTH boards is gone').toBe(0);
    expect(g().p1.hand.length, 'played 1, drew 3 (one per Gear destroyed)').toBe(before - 1 + 3);
  });

  it('"up to two": both picks destroy', () => {
    const card = sw('Break the Siegeworks');
    seed(card, 'Paladin', {}, {
      f1: mkConstruct('t1', 'Tripwire Snare', 3, { subtype: 'Trap' }),
      f2: mkConstruct('t2', 'Pit Trap', 3, { subtype: 'Trap' }),
    });
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('t1');
    expect(gs.getState().pendingActionTarget, 'armed for the optional second').toBeTruthy();
    gs.getState().resolveActionTarget('t2');
    expect(gs.getState().pendingActionTarget ?? null, 'resolved').toBeNull();
    expect(g().p2.board.f1, 'first destroyed').toBeFalsy();
    expect(g().p2.board.f2, 'second destroyed').toBeFalsy();
  });

  it('"up to two": stopping after one KEEPS the first destroy and buries the card (never a rollback)', () => {
    const card = sw('Break the Siegeworks');
    seed(card, 'Paladin', {}, {
      f1: mkConstruct('t1', 'Tripwire Snare', 3, { subtype: 'Trap' }),
      f2: mkConstruct('t2', 'Pit Trap', 3, { subtype: 'Trap' }),
    });
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('t1');
    gs.getState().cancelActionTarget();          // "Skip" = stop at one
    expect(g().p2.board.f1, 'the first destroy STANDS').toBeFalsy();
    expect(g().p2.board.f2, 'the second was declined').toBeTruthy();
    expect(g().p1.hand.map(c => c.name), 'the Action is spent, not refunded').not.toContain(card.name);
    expect(g().p1.dead.map(c => c.name)).toContain(card.name);
  });

  // FLAGGED FOR RATIFICATION (2026-08-19): the owner ruled dd000096 "refuses at zero,
  // per the universal pre-cost refusal". The SHIPPED behaviour for a targeted ACTION
  // with no legal target is to FIZZLE — the card is spent to the Dead Zone (gameStore
  // "fizzles — no legal target", the path every targeted Action has always taken). The
  // pre-cost refusal precedent (Fence's Ledger, the Quill) governs ACTIVATED abilities,
  // where a cost would otherwise be paid for nothing. This pin records what the engine
  // ACTUALLY does; changing it for one card would make dd000096 the only Action in the
  // game that returns to hand, so it needs an explicit ruling first.
  it('"up to two" with ZERO legal targets does not arm, and fizzles (shipped Action behaviour)', () => {
    const card = sw('Break the Siegeworks');
    seed(card, 'Paladin', {}, { f1: mkComp('just-a-guy', 'Enemy A', { hp: 5 }) }); // no constructs
    gs.getState().playAction(card.id);
    expect(gs.getState().pendingActionTarget ?? null, 'nothing armed — no legal target').toBeNull();
    expect(g().p2.board.f1, 'nothing was destroyed').toBeTruthy();
    expect(g().p1.dead.map(c => c.name), 'shipped Actions fizzle to the Dead Zone').toContain(card.name);
  });
});

describe('Sanctify — a destroy with a separately chosen rider target', () => {
  it('destroys the picked Gear, then heals the separately picked character', () => {
    const card = sw('Sanctify');
    seed(card, 'Paladin', {}, { f1: mkComp('wearer', 'Enemy A', { hp: 5, loadout: { weapon: null, gear: [gear('g-1'), null] } }) });
    gs.getState().playAction(card.id);
    gs.getState().resolveActionTarget('g-1');    // step 1: the Gear
    expect(gs.getState().pendingActionTarget, 'step 2 armed for the heal').toBeTruthy();
    gs.getState().resolveActionTarget('pc-1');   // step 2: the heal target
    expect(gs.getState().pendingActionTarget ?? null).toBeNull();
    expect(g().p2.board.f1?.loadout?.gear[0], 'Gear destroyed').toBeNull();
    expect(g().p1.board.b3?.hp, 'and the chosen character healed 2 (10 -> 12)').toBe(12);
  });
});

describe('Consecrate the Ground — an ENTERS trigger carrying a destroy', () => {
  it('arms its destroy target when the construct enters', () => {
    const card = sw('Consecrate the Ground');
    seed(card, 'Paladin', {}, { f1: mkConstruct('trap-1', 'Tripwire Snare', 3, { subtype: 'Trap' }) });
    gs.getState().beginPlay(card.id);
    gs.getState().placeCard('b1');
    expect(gs.getState().pendingActionTarget?.eligibleIds, 'targeted at resolution, the shipped enters-trigger convention')
      .toContain('trap-1');
    gs.getState().resolveActionTarget('trap-1');
    expect(g().p2.board.f1, 'destroyed by the entering construct').toBeFalsy();
  });
});
