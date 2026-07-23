// DEV deck — Arc B: opposing-scope debuffs + cross-turn durations (2026-07-23).
// ONE mechanism, four consumers: ActiveBuff gained timed anchors (until
// {turnStart|turnEnd, of}) plus a dormancy flag (pendingUntilTurnOf) and a window
// gate (activeDuring) for Doubt's "during its controller's next turn". Pale
// Confessor is a standing HOSTILE aura (staticAuraStat's opponent scan), never
// stamped. cannotAttack is enforced in attackRestrictedBy — the single
// attacker-side gate beginAttack/resolveAttack/LoadoutPanel all consume.
// ATTACK-FLOOR OPEN QUESTION (not ruled): storage keeps raw negatives; the
// pre-existing effectiveAttack Math.max(0,…) clamps the VALUE for damage and
// display (sum-then-clamp) — see the owner question in the session report.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkCz } from './helpers';
import { effectiveAttack, attackRestrictedBy } from '../store/keywords';
import { CATALOG, DW_ROGUE_DEV_CARDS } from '../data/catalog';
import type { Card } from '../types/card';

const dc = (name: string): Card => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`dev card missing: ${name}`);
  return c;
};
const czCards = CATALOG.slice(20, 25);

function seed(p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>>) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: [], board: p1Board,
      classZone: czCards.map((c, i) => mkCz(c, 'Doom-Whisperer', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [] },
  } }));
}
const g = () => gs.getState().game;
/** endTurn + fast-forward past the new turn's CZ phase (freshGame's convention) —
 *  attacks are Action-Phase moves, and endTurn opens the next turn in 'cz'. */
const nextTurn = () => {
  gs.getState().endTurn();
  gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' as const } }));
};
const cast = (actorId: string, card: Card, targetId?: string) => {
  gs.setState(s => ({ game: { ...s.game, selected: actorId, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().playAction(card.id);
  if (targetId) gs.getState().resolveActionTarget(targetId);
};
const atkOf = (id: string) => {
  const ent = Object.values(g().p1.board).concat(Object.values(g().p2.board)).find(e => e?.id === id)!;
  return effectiveAttack(ent, g());
};
const gateFor = (id: string, side: 'p1' | 'p2') => {
  const [slot, ent] = Object.entries(g()[side].board).find(([, e]) => e?.id === id)!;
  return attackRestrictedBy(g(), ent!, side, slot as never);
};

describe('Pale Confessor (17) — standing hostile aura, positional and source-bound', () => {
  it('debuffs opposing FRONT-line companions only; sheds on move; dies with the source', () => {
    seed(
      { b1: mkComp('conf', 'Pale Confessor', { atk: 0, hp: 3 }), f2: mkComp('own', 'Own Grunt', { atk: 3 }) },
      { f1: mkComp('front', 'Front Def', { atk: 3 }), b2: mkComp('back', 'Back Def', { atk: 3 }) },
    );
    expect(atkOf('front'), "opponent's front line −1").toBe(2);
    expect(atkOf('back'), 'back line untouched').toBe(3);
    expect(atkOf('own'), "the controller's own companions untouched").toBe(3);
    // The debuffed companion moves to the back line — the aura sheds (positional, live).
    gs.setState(s => {
      const { f1: mover, ...rest } = s.game.p2.board;
      return { game: { ...s.game, p2: { ...s.game.p2, board: { ...rest, b3: mover } } } };
    });
    expect(atkOf('front'), 'moved out of the front line → debuff gone').toBe(3);
    // Back to the front — regained.
    gs.setState(s => {
      const { b3: mover, ...rest } = s.game.p2.board;
      return { game: { ...s.game, p2: { ...s.game.p2, board: { ...rest, f1: mover } } } };
    });
    expect(atkOf('front'), 'moved back in → debuff again').toBe(2);
    // The Confessor leaves — the aura ends with it.
    gs.setState(s => {
      const { b1: _gone, ...rest } = s.game.p1.board;
      return { game: { ...s.game, p1: { ...s.game.p1, board: rest } } };
    });
    expect(atkOf('front'), 'source gone → aura gone').toBe(3);
  });
});

describe("Whispers of the West (22) — targeted −2 until the start of the caster's next turn", () => {
  it("live through the opponent's intervening turn, gone at the caster's turn start", () => {
    seed({ b3: mkPc('pc-1') }, { f1: mkComp('vic', 'Victim', { atk: 3 }) });
    cast('pc-1', dc('Whispers of the West'), 'vic');
    expect(atkOf('vic'), 'debuffed on cast').toBe(1);
    nextTurn(); // opponent's turn begins
    expect(g().activePlayer).toBe('p2');
    expect(atkOf('vic'), "STILL debuffed during the opponent's turn").toBe(1);
    nextTurn(); // the caster's next turn starts — expiry boundary
    expect(g().activePlayer).toBe('p1');
    expect(atkOf('vic'), "gone at the caster's turn start").toBe(3);
  });

  it('floor: a 1-attack target reads 0 and deals 0 combat damage (raw −2 stored)', () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('def', 'Defender', { hp: 5 }) },
      { f1: mkComp('weak', 'Weakling', { atk: 1 }) });
    cast('pc-1', dc('Whispers of the West'), 'weak');
    expect(atkOf('weak'), 'clamped to 0 (raw −1 total in the sum)').toBe(0);
    const raw = Object.values(g().p2.board).find(e => e?.id === 'weak')!.buffs![0].atk;
    expect(raw, 'storage keeps the raw −2 entry').toBe(-2);
    nextTurn(); // opponent's turn — they attack with the 0-attack companion
    gs.setState(() => ({ pending: { action: 'attack', charId: 'weak' } }));
    gs.getState().resolveAttack('def');
    const weak = Object.values(g().p2.board).find(e => e?.id === 'weak')!;
    expect(weak.exhausted, 'the attack RESOLVED (not refused)').toBe(true);
    expect(g().p1.board.f1?.hp, '0 damage dealt — HP unchanged').toBe(5);
  });
});

describe("Doubt (25) — cannot attack during its controller's next turn (a WINDOW, not a delayed strip)", () => {
  it('opposing target: free this turn, locked on their next turn, free the turn after', () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('def', 'Defender', { hp: 9 }) },
      { f1: mkComp('vic', 'Victim', { atk: 2 }) });
    cast('pc-1', dc('Doubt'), 'vic');
    expect(gateFor('vic', 'p2'), 'CAN attack this turn (window dormant)').toBeNull();
    nextTurn(); // the controller's next turn — window live
    // Gate return LABELED 2026-07-23 (Arc C carried item): "<source> (cannot attack)".
    expect(gateFor('vic', 'p2'), 'locked during their turn').toBe('Doubt (cannot attack)');
    const toastsBefore = gs.getState().toasts.length;
    gs.getState().beginAttack('vic');
    expect(gs.getState().pending, 'beginAttack refused').toBeNull();
    const newToasts = gs.getState().toasts.slice(toastsBefore).map(t => t.msg).join(' | ');
    expect(newToasts, 'refused BY DOUBT, loudly').toMatch(/Doubt/);
    nextTurn(); // controller's turn ends — window strips
    nextTurn(); // controller's turn AFTER
    expect(g().activePlayer).toBe('p2');
    expect(gateFor('vic', 'p2'), 'free again the turn after').toBeNull();
    gs.getState().beginAttack('vic');
    expect(gs.getState().pending?.action, 'attack arms again').toBe('attack');
  });

  it("OWN target mid-own-turn: the window waits for the caster's NEXT turn (dormancy survives the cast turn's end)", () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('mine', 'My Grunt', { atk: 2 }) },
      { f1: mkComp('foe', 'Foe', { hp: 9 }) });
    cast('pc-1', dc('Doubt'), 'mine');
    expect(gateFor('mine', 'p1'), 'not locked on the cast turn').toBeNull();
    nextTurn(); // own turn ends — the still-pending entry must SURVIVE this strip
    nextTurn(); // the controller's next turn — window live
    expect(g().activePlayer).toBe('p1');
    expect(gateFor('mine', 'p1'), "locked during the controller's next turn").toBe('Doubt (cannot attack)');
    nextTurn(); // that turn ends — stripped
    nextTurn();
    expect(g().activePlayer).toBe('p1');
    expect(gateFor('mine', 'p1'), 'free the turn after').toBeNull();
  });
});

describe('Chorus of Doubt (28) — group debuff, STACKING entries', () => {
  it('two casts = −2 (entries stack; not the Dismayed non-stacking pattern); both expire together', () => {
    seed({ f1: mkComp('a1', 'Caster One', { fresh: false }), f2: mkComp('a2', 'Caster Two', { fresh: false }) },
      { f1: mkComp('e1', 'Enemy One', { atk: 3 }), b1: mkComp('e2', 'Enemy Two', { atk: 2 }) });
    cast('a1', dc('Chorus of Doubt'));
    cast('a2', { ...dc('Chorus of Doubt'), id: 'chorus-copy-2' } as Card);
    expect(atkOf('e1'), 'two −1 entries stack').toBe(1);
    expect(atkOf('e2')).toBe(0);
    expect(Object.values(g().p2.board).find(e => e?.id === 'e1')!.buffs!.length, 'two separate entries').toBe(2);
    nextTurn();
    expect(atkOf('e1'), "still stacked through the opponent's turn").toBe(1);
    nextTurn(); // caster's next turn start — both strip
    expect(atkOf('e1')).toBe(3);
    expect(atkOf('e2')).toBe(2);
  });
});

describe('debuffed combat damage flows through resolveAttack (not just the stat display)', () => {
  it('a Chorus-debuffed attacker deals base−1', () => {
    seed({ f1: mkComp('caster', 'Caster', { fresh: false }), f2: mkComp('def', 'Defender', { hp: 5 }) },
      { f1: mkComp('att', 'Attacker', { atk: 3 }) });
    cast('caster', dc('Chorus of Doubt'));
    nextTurn(); // attacker's turn — debuff live
    gs.setState(() => ({ pending: { action: 'attack', charId: 'att' } }));
    gs.getState().resolveAttack('def');
    expect(g().p1.board.f2?.hp, 'took 2, not 3').toBe(3);
  });
});

describe('timed entries serialize (MP byte parity rides plain JSON state sync)', () => {
  it('a game holding a dormant window entry and a timed debuff round-trips JSON exactly', () => {
    seed({ b3: mkPc('pc-1'), f1: mkComp('mine', 'My Grunt', { atk: 2 }) },
      { f1: mkComp('vic', 'Victim', { atk: 3 }) });
    cast('pc-1', dc('Doubt'), 'mine');
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1' } }));
    const w = dc('Whispers of the West');
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [w] } } }));
    gs.getState().playAction(w.id);
    gs.getState().resolveActionTarget('vic');
    const game = g();
    expect(JSON.parse(JSON.stringify(game))).toEqual(game);
  });
});
