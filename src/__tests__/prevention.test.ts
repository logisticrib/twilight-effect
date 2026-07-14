// Damage prevention (capability arc 2, owner-ratified 2026-07-14) — Reflecting Pool.
// Canon, verbatim: "When a Wizard companion you control would take damage, prevent 1
// of that damage." Rulings pinned here:
//   R1 — deal-side modifiers form the dealt amount BEFORE receipt-side prevention
//        (a doubled 2-damage hit against prevent-1 resolves 4 − 1 = 3, never (2−1)×2).
//   R2 — fully prevented damage is NO damage: no Poison application, no
//        "when damaged"-style triggers (generalizes the armor-blocked-hit behavior).
//   R3 — when >1 prevention effect could apply to one damage instance, the AFFECTED
//        character's controller orders them (each armor piece is its own orderable
//        item; armor reached at 0 remaining never engages — no counter).
// Scope: exactly what the card names — 'ownCompanions' + where.cls 'Wizard' never
// covers the PC, non-Wizard companions, or opposing characters. Applies per damage
// instance (each Cleave splash hit separately), to combat and effect damage alike
// (including arc-1 reactive-trigger/trap damage). Duplicates stack.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem, mkPc, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];
const pool = (id: string) => mkConstruct(id, 'Reflecting Pool', 2, { subtype: 'Incantation' });
const wiz = (id: string, over: Parameters<typeof mkComp>[2] = {}) =>
  mkComp(id, compCard2.name, { cls: 'Wizard', hp: 5, ...over });

/** p1 attacker vs p2 board, attack armed (the tier1_combat rig). */
const arm = (att: ReturnType<typeof mkComp>, defs: Record<string, ReturnType<typeof mkComp>>) =>
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: { f1: att } },
    p2: { ...s.game.p2, board: defs },
  }, pending: { action: 'attack', charId: att.id } }));

describe('Reflecting Pool — single prevention applies silently with a toast (no prompt)', () => {
  it('prevents 1 of a combat hit on an own Wizard companion; state stays prevention-free-shaped when done', () => {
    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 3 }),
        { f1: wiz('pv-wiz'), f2: pool('pv-pool') });
    gs.getState().resolveAttack('pv-wiz');
    const g = gs.getState().game;
    expect(g.pendingPreventOrder ?? undefined, 'exactly one prevention → no prompt').toBeUndefined();
    expect(g.pendingArmor, 'no armor prompt either').toBeNull();
    expect(g.p2.board.f1?.hp, '3 dealt − 1 prevented = 2 taken').toBe(3);
    expect(g.preventOrderQueue ?? undefined, 'no deferral queued (hash-neutral shape)').toBeUndefined();
  });

  it('R1: Bane doubles FIRST, prevention second — 2 attack doubled to 4, minus 1 = 3 taken (never (2−1)×2)', () => {
    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 2, keywords: ["Goblin's Bane"] }),
        { f1: wiz('pv-wiz', { hp: 8, subtype: 'Goblin' }), f2: pool('pv-pool') });
    gs.getState().resolveAttack('pv-wiz');
    expect(gs.getState().game.p2.board.f1?.hp, '8 − (2×2 − 1)').toBe(5);
  });

  it('R2: a prevented-to-zero hit is NO damage — no Poison applied, no onDealDamage trigger fires', () => {
    freshGame();
    // Burning Heir (catalog): onDealDamage vs an enemy companion → 1 damage to the
    // damaged side's PC. With the whole hit prevented there is no damage event, so
    // neither the Poison counter nor the Burning Heir ping may land.
    arm(mkComp('pv-att', 'Burning Heir', { atk: 1, keywords: ['Poison'] }),
        { f1: wiz('pv-wiz'), f2: pool('pv-pool'), b1: mkPc('pv-pc') });
    gs.getState().resolveAttack('pv-wiz');
    const g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'hit fully prevented').toBe(5);
    expect(g.p2.board.f1?.poison ?? 0, 'no Poison counter on a no-damage hit').toBe(0);
    expect(g.p2.board.f1?.exhausted, 'not Poison-exhausted').toBe(false);
    expect(g.p2.board.b1?.hp, 'Burning Heir onDealDamage never fired (no damage event)').toBe(20);
  });
});

describe('R3 — the affected controller orders prevention effects (armor is part of the family)', () => {
  const armored = () => wiz('pv-wiz', { loadout: { weapon: null, gear: [mkItem('pv-ar', 'Guard Plate', { armor: 3, counters: 0 }), null] } });

  it('1-damage hit, pool + armor: combat pauses for the DEFENDER; pool-first zeroes the damage and armor never engages (no counter)', () => {
    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 1 }), { f1: armored(), f2: pool('pv-pool') });
    gs.getState().resolveAttack('pv-wiz');
    let g = gs.getState().game;
    expect(g.pendingPreventOrder, 'paused on the ordering').toBeTruthy();
    expect(g.pendingPreventOrder?.chooser, "the AFFECTED character's controller chooses").toBe('p2');
    expect(g.pendingPreventOrder?.dmg, 'formed dealt amount carried').toBe(1);
    expect(g.p2.board.f1?.hp, 'no damage applied while paused').toBe(5);
    // The turn cannot pass over an open ordering.
    gs.getState().endTurn();
    expect(gs.getState().game.activePlayer, 'endTurn refused while ordering is open').toBe('p1');

    const poolIdx = g.pendingPreventOrder!.items.findIndex(i => i.kind === 'prevent');
    gs.getState().resolvePreventOrder(poolIdx); // 2 items → one pick completes the order
    g = gs.getState().game;
    expect(g.pendingPreventOrder ?? undefined, 'ordering resolved').toBeUndefined();
    expect(g.p2.board.f1?.hp, 'fully prevented').toBe(5);
    expect(g.p2.board.f1?.loadout?.gear[0]?.counters, 'armor never engaged — NO counter spent').toBe(0);
  });

  it('same hit, armor-first: the whole hit is prevented by armor and the counter IS spent; the pool prevents nothing', () => {
    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 1 }), { f1: armored(), f2: pool('pv-pool') });
    gs.getState().resolveAttack('pv-wiz');
    let g = gs.getState().game;
    const armorIdx = g.pendingPreventOrder!.items.findIndex(i => i.kind === 'armor');
    gs.getState().resolvePreventOrder(armorIdx);
    g = gs.getState().game;
    expect(g.pendingPreventOrder ?? undefined, 'ordering resolved').toBeUndefined();
    expect(g.p2.board.f1?.hp, 'fully prevented').toBe(5);
    expect(g.p2.board.f1?.loadout?.gear[0]?.counters, 'the chosen armor took its counter').toBe(1);
  });

  it('duplicate preventions stack: two pools prevent 2 total (ordered via the prompt, result order-independent)', () => {
    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 3 }),
        { f1: wiz('pv-wiz'), f2: pool('pv-p1'), f3: pool('pv-p2') });
    gs.getState().resolveAttack('pv-wiz');
    let g = gs.getState().game;
    expect(g.pendingPreventOrder?.items.length, 'both pools offered for ordering').toBe(2);
    gs.getState().resolvePreventOrder(0);
    g = gs.getState().game;
    expect(g.pendingPreventOrder ?? undefined).toBeUndefined();
    expect(g.p2.board.f1?.hp, '3 dealt − 2 prevented = 1 taken').toBe(4);
  });
});

describe('per-instance application and scope', () => {
  it('Cleave: each splash hit is its own damage instance — one pool prevents 1 on EVERY covered hit', () => {
    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 2, keywords: ['Cleave'] }),
        { f1: wiz('pv-w1'), f2: wiz('pv-w2'), b1: pool('pv-pool') });
    gs.getState().resolveAttack('pv-w1');
    const g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'primary: 2 − 1 = 1 taken').toBe(4);
    expect(g.p2.board.f2?.hp, 'splash: 2 − 1 = 1 taken (separate instance)').toBe(4);
  });

  it('scope is exactly what the card names: a non-Wizard companion and the PC are NOT covered', () => {
    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 3 }),
        { f1: mkComp('pv-rog', compCard2.name, { cls: 'Rogue', hp: 5 }), f2: pool('pv-pool') });
    gs.getState().resolveAttack('pv-rog');
    expect(gs.getState().game.p2.board.f1?.hp, 'non-Wizard companion takes the full 3').toBe(2);

    freshGame();
    arm(mkComp('pv-att', compCard.name, { atk: 3 }),
        { f1: mkPc('pv-pc', { cls: 'Wizard' }), f2: pool('pv-pool') });
    gs.getState().resolveAttack('pv-pc');
    expect(gs.getState().game.p2.board.f1?.hp, '"companion" never covers the PC, even a Wizard PC').toBe(17);
  });
});

describe('arc-1 interop — reactive-trigger (trap) damage is prevented like any other', () => {
  const czCards = CATALOG.slice(20, 25);
  const mkHandComp = (id: string, name: string, hp: number): Card => ({
    id, name, level: 1, type: 'Companion', subtype: '', rarity: 'Common', class1: 'Wizard',
    class2: '', attack: 2, hp, anchor: null, actionSub: '', actionPM: '', itemKind: '',
    keywords: [], text: '', flavor: '',
  } as unknown as Card);

  it("Tripwire Snare's 1 damage to an entering own-side Wizard is prevented by the enterer's own Reflecting Pool", () => {
    freshGame();
    const card = mkHandComp('pv-hc', 'Sturdy Recruit', 3);
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, hand: [card], deck: CATALOG.slice(30, 33),
        board: { f2: pool('pv-pool') },
        classZone: czCards.map((c, i) => mkCz(c, 'Wizard', `cz-${i}`)), willpower: 5 },
      p2: { ...s.game.p2, board: { f1: mkConstruct('tw-1', 'Tripwire Snare', 2, { subtype: 'Trap' }) }, hand: [] },
    } }));
    gs.getState().beginPlay(card.id);
    gs.getState().placeCard('b1');
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'trap damage fully prevented (cls Wizard, own pool)').toBe(3);
    expect(g.p2.board.f1, 'Tripwire still sacrificed itself (mandatory trigger resolved)').toBeUndefined();
    expect(g.triggerStack ?? undefined, 'stack drained (fixture-hash invariant)').toBeUndefined();
    expect(g.preventOrderQueue ?? undefined, 'single prevention → applied inline, nothing deferred').toBeUndefined();
  });

  it('non-combat ordering defers (armorSink discipline): trap damage on an armored, pool-covered Wizard arms the ordering AFTER the stack drains; pool-first spends no counter', () => {
    freshGame();
    // Iron Spikes (p2's trap) damages p1's ATTACKING Wizard — a non-combat damage
    // instance — while p1 controls both a Reflecting Pool and armor on the attacker:
    // pool + armor both apply → the ordering defers and arms at the resolution boundary.
    const spikes = mkConstruct('is-1', 'Iron Spikes', 2, { subtype: 'Trap' });
    const attacker = wiz('pv-atk', { atk: 2, hp: 5, loadout: { weapon: null, gear: [mkItem('pv-ar2', 'Guard Plate', { armor: 3, counters: 0 }), null] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: attacker, f2: pool('pv-pl') } },
      p2: { ...s.game.p2, board: { f1: mkComp('pv-def', compCard2.name, { hp: 9 }), f3: spikes } },
    }, pending: { action: 'attack', charId: 'pv-atk' } }));
    gs.getState().resolveAttack('pv-def');
    let g = gs.getState().game;
    // Iron Spikes (declaration window) dealt 1 to the attacker — a NON-COMBAT damage
    // instance with pool + armor applicable: HP outcome (full prevention) landed at
    // damage time; the counter decision deferred and armed as an ordering prompt.
    expect(g.p1.board.f1?.hp, 'spike damage fully prevented at damage time').toBe(5);
    expect(g.pendingPreventOrder, 'deferred ordering armed after the resolution').toBeTruthy();
    expect(g.pendingPreventOrder?.chooser, "the affected character's controller (p1) chooses").toBe('p1');
    expect(g.pendingPreventOrder?.ctx ?? undefined, 'deferred (no paused combat ctx)').toBeUndefined();
    const poolIdx = g.pendingPreventOrder!.items.findIndex(i => i.kind === 'prevent');
    gs.getState().resolvePreventOrder(poolIdx);
    g = gs.getState().game;
    expect(g.pendingPreventOrder ?? undefined, 'ordering drained').toBeUndefined();
    expect(g.preventOrderQueue ?? undefined, 'queue field back to undefined (hash-neutral)').toBeUndefined();
    expect(g.p1.board.f1?.loadout?.gear[0]?.counters, 'pool-first: armor never engaged, no counter').toBe(0);
  });
});
