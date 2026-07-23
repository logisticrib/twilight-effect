// DEV deck — Arc C: conditional & cause-threaded triggers (2026-07-23).
// CAUSE TAXONOMY: destroyEntity's cause is REQUIRED — 'damage' (the applyDamage
// destroy branch, combat AND effect damage) or 'sacrifice' (every cost/effect/
// ready-phase exit). resolveRemovalTriggers gates "if it died to damage" (Cult
// Fanatic) against it — never via conditionMet, whose default-true covers
// board-state kinds. FLEE LISTENER (Dread Chorister): the NARROW, text-literal
// 'oppCompanionFlees' event — flee-is-a-sacrifice canon does NOT widen it to all
// sacrifices (owner may widen; recorded in the session report). AoE (Names of the
// Lost): 'allEnemyCompanions' damage respects Acrobatics (the Cleave-splash gate,
// isImmuneToSplash, reused for ALL untargeted interpreter damage) and the
// prevention family (the tick is ordinary damage). Plus the 2026-07-23 attack-
// floor ruling pin: sum-then-clamp (GRU §Core Mechanics, Attack Modifiers).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct } from './helpers';
import { effectiveAttack } from '../store/keywords';
import { CATALOG, DW_ROGUE_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';

const dc = (name: string): Card => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`dev card missing: ${name}`);
  return c;
};
void dc; // real card names below resolve effects via CATALOG lookups

function seed(p1: Record<string, ReturnType<typeof mkComp>>, p2: Record<string, ReturnType<typeof mkComp>>,
              over: { p1dead?: Card[]; p2dead?: Card[]; p2cz?: boolean; active?: 'p1' | 'p2' } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    activePlayer: over.active ?? 'p1',
    p1: { ...s.game.p1, board: p1, dead: over.p1dead ?? [] },
    p2: { ...s.game.p2, board: p2, dead: over.p2dead ?? [],
      ...(over.p2cz === false ? { classZone: [], willpower: 0 } : {}) },
  } }));
}
const g = () => gs.getState().game;

describe('RULING 2026-07-23 — attack modifiers SUM, then CLAMP (no stat-level floor)', () => {
  it('a raw −1 given +1 later reads 0 attack and deals 0 combat damage', () => {
    freshGame();
    const att = mkComp('att', 'Debtor', { atk: 1, buffs: [
      { atk: -2, until: 'endOfTurn', source: 'Test Debuff' },
      { atk: 1, until: 'endOfTurn', source: 'Test Buff' },
    ] });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: mkComp('def', 'Defender', { hp: 5 }) } },
    }, pending: { action: 'attack', charId: 'att' } }));
    expect(effectiveAttack(g().p1.board.f1!, g()), 'raw sum = −1+1+1 = 0... clamped read').toBe(0);
    gs.getState().resolveAttack('def');
    expect(g().p1.board.f1?.exhausted, 'the attack resolved').toBe(true);
    expect(g().p2.board.f1?.hp, '0 damage dealt').toBe(5);
  });
});

describe('Cult Fanatic (11) — "if it died to DAMAGE" (cause-threaded death trigger)', () => {
  const deadCard = () => CATALOG.find(c => c.type === 'Item')!;

  it('combat kill → the recovery pick arms for its controller (cause: damage)', () => {
    seed({ f1: mkComp('att', 'Killer', { atk: 3 }) },
      { f1: mkComp('cf', 'Cult Fanatic', { keywords: ['Reckless'], atk: 2, hp: 1 }) },
      { p2dead: [deadCard()] });
    gs.setState(() => ({ pending: { action: 'attack', charId: 'att' } }));
    gs.getState().resolveAttack('cf');
    const dp = g().pendingDeadPick;
    expect(dp, 'pick armed').toBeTruthy();
    expect(dp?.lp, "the Fanatic's controller chooses").toBe('p2');
    expect(dp?.optional, '"return target card" — forced').toBe(false);
    expect(dp?.options.some(o => o.card.name === 'Cult Fanatic'), 'its own card is a legal pick (text-literal: the Dead Zone at resolution)').toBe(true);
    gs.getState().resolveDeadPick(dp!.options[0].idx);
    expect(g().p2.hand.some(c => c.id === dp!.options[0].card.id), 'chosen card returned to hand').toBe(true);
  });

  it('its OWN Reckless recoil killing it at 1 HP → pick arms (the on-theme case)', () => {
    seed({ f1: mkComp('cf', 'Cult Fanatic', { keywords: ['Reckless'], atk: 2, hp: 1 }) },
      { f1: mkComp('def', 'Tough Defender', { hp: 5 }) },
      { p1dead: [deadCard()] });
    gs.setState(() => ({ pending: { action: 'attack', charId: 'cf' } }));
    gs.getState().resolveAttack('def');
    expect(g().p2.board.f1?.hp, 'its attack landed first').toBe(3);
    expect(g().p1.board.f1, 'the recoil killed it').toBeFalsy();
    const dp = g().pendingDeadPick;
    expect(dp?.lp, 'recoil is DAMAGE — the trigger fires for its controller').toBe('p1');
  });

  it('FLEE (a sacrifice, not damage) → NO pick', () => {
    seed({ b3: mkPc('pc-1') },
      { f1: mkComp('cf', 'Cult Fanatic', { keywords: ['Reckless'], atk: 2, hp: 1, level: 9 }) },
      { p2dead: [deadCard()], p2cz: false });
    gs.getState().endTurn(); // p2 readies — Level 9 > Willpower 0 → flees
    expect(g().p2.dead.some(c => c.name === 'Cult Fanatic'), 'it fled to the Dead Zone').toBe(true);
    expect(g().pendingDeadPick, 'no recovery — it did not die to damage').toBeFalsy();
  });

  it('a plain sacrifice → NO pick', () => {
    seed({}, { f1: mkComp('cf', 'Cult Fanatic', { keywords: ['Reckless'], atk: 2, hp: 1 }) },
      { p2dead: [deadCard()] });
    gs.getState().sacrificeEntity('cf');
    expect(g().p2.board.f1, 'sacrificed off the board').toBeFalsy();
    expect(g().pendingDeadPick, 'no recovery — sacrifice is not damage').toBeFalsy();
  });
});

describe('Dread Chorister (15) — the NARROW flee listener ("flees", not "is sacrificed")', () => {
  it('each opposing flee draws a card (two flees = two draws)', () => {
    seed({ f1: mkComp('dch', 'Dread Chorister', { keywords: ['Dismay'] }) },
      { f1: mkComp('r1', 'Runner One', { level: 9 }), b1: mkComp('r2', 'Runner Two', { level: 9 }), b3: mkPc('pc-2') },
      { p2cz: false });
    const hand0 = g().p1.hand.length;
    const deck0 = g().p1.deck.length;
    gs.getState().endTurn(); // p2 readies — both runners flee
    // (Synthetic names have no CATALOG card, so burial is asserted as board exit —
    // flee burial itself is pinned in flee_sacrifice.test.ts with real cards.)
    expect(g().p2.board.f1 ?? g().p2.board.b1, 'both fled the board').toBeFalsy();
    expect(g().p1.hand.length, 'one draw per flee').toBe(hand0 + 2);
    expect(g().p1.deck.length).toBe(deck0 - 2);
  });

  it('an opposing NON-flee sacrifice draws nothing (narrow reading pinned)', () => {
    seed({ f1: mkComp('dch', 'Dread Chorister', { keywords: ['Dismay'] }) },
      { f1: mkComp('vic', 'Victim', {}) });
    const hand0 = g().p1.hand.length;
    gs.getState().sacrificeEntity('vic');
    expect(g().p2.board.f1, 'sacrificed').toBeFalsy();
    expect(g().p1.hand.length, 'no draw — it did not FLEE').toBe(hand0);
  });

  it('an opposing ready-phase DECAY sacrifice (a companion with Anchors) draws nothing', () => {
    // A Manifest-shaped companion on its last Anchor: it is SACRIFICED at the ready
    // — a companion exit that is NOT a flee. The narrow listener stays silent.
    seed({ f1: mkComp('dch', 'Dread Chorister', { keywords: ['Dismay'] }) },
      { f1: mkComp('mani', 'Fading Manifest', { anchors: 1, anchorsStart: 3, level: 1 }), b3: mkPc('pc-2') });
    const hand0 = g().p1.hand.length;
    gs.getState().endTurn(); // p2 readies — last Anchor decays, the companion is sacrificed
    expect(g().p2.board.f1, 'decayed off the board (synthetic card — board exit asserted)').toBeFalsy();
    expect(g().p1.hand.length, 'no draw — decay is not a flee').toBe(hand0);
  });
});

describe('The Names of the Lost (20) — start-of-turn AoE vs Acrobatics, decay, prevention', () => {
  it('ticks each opposing COMPANION; Sewer Rat (Acrobatics) untouched; the PC untouched', () => {
    seed({ f2: mkConstruct('notl', 'The Names of the Lost', 3, { subtype: 'Utterance' }) },
      { f1: mkComp('rat', 'Sewer Rat', { keywords: ['Acrobatics'], hp: 2 }),
        f2: mkComp('plain', 'Plain Grunt', { hp: 3 }), b3: mkPc('pc-2') },
      { active: 'p2' });
    gs.getState().endTurn(); // p1's turn starts — the Utterance ticks
    expect(g().p2.board.f2?.hp, 'the plain companion takes 1').toBe(2);
    expect(g().p2.board.f1?.hp, 'Acrobatics: untargeted damage cannot touch it').toBe(2);
    expect(g().p2.board.b3?.hp, 'the PC is not a companion').toBe(20);
  });

  it('LAST GASP: at 1 Anchor the tick still fires, then the Utterance crumbles', () => {
    seed({ f2: mkConstruct('notl', 'The Names of the Lost', 1, { subtype: 'Utterance' }) },
      { f1: mkComp('plain', 'Plain Grunt', { hp: 3 }), b3: mkPc('pc-2') },
      { active: 'p2' });
    gs.getState().endTurn();
    expect(g().p2.board.f1?.hp, 'the last tick fired before decay').toBe(2);
    expect(g().p1.board.f2, 'then it crumbled').toBeFalsy();
    expect(g().p1.dead.some(c => c.name === 'The Names of the Lost'), 'buried').toBe(true);
  });

  it("the tick is ordinary damage — Reflecting Pool prevents it for the defender's Wizard companions", () => {
    seed({ f2: mkConstruct('notl', 'The Names of the Lost', 3, { subtype: 'Utterance' }) },
      { f1: mkComp('wiz', 'Pool Ward', { cls: 'Wizard', hp: 3 }),
        f3: mkComp('warr', 'Unwarded', { cls: 'Warrior', hp: 3 }),
        b2: mkConstruct('pool', 'Reflecting Pool', 2, { subtype: 'Incantation' }), b3: mkPc('pc-2') },
      { active: 'p2' });
    gs.getState().endTurn();
    expect(g().p2.board.f1?.hp, 'Wizard companion: 1 dealt − 1 prevented = untouched').toBe(3);
    expect(g().p2.board.f3?.hp, 'non-Wizard neighbor takes the tick').toBe(2);
  });
});
