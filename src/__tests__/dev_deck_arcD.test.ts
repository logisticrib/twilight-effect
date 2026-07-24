// DEV deck — Arc D: Poison paths + item-granted keywords (2026-07-23).
// WHITELIST: 'Poison' added to ITEM_GRANTED_KEYWORDS; "[NAME]'s Bane" passes via
// the ONE prefix allowance (isItemGrantedKeyword) with the full string preserved
// through effectiveKeywords → parseBanes → isBaneTarget. Both combat hooks were
// ALREADY granted-inclusive (they read effectiveKeywords — the single view), so
// the whitelist was the only blocker; no divergence class exists.
// applyPoison op (Poisoned Caltrops): applies poisonHitPatch — the SAME patch as
// the combat keyword — per the SETTLED provenance canon (2026-07-22: counters are
// counters; the ready check reads count, never origin). Choiceless, no prompt.
// Poison ready-roll MP discipline VERIFIED, not rebuilt: the roll happens only on
// the affected player's client (pendingPoison-gated modal, recorded rng boundary);
// only {id, cleansed} outcomes commit via resolvePoison and sync wholesale.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem } from './helpers';
import { effectiveKeywords, POISONED_STATUS } from '../store/keywords';
import { DW_ROGUE_DEV_CARDS } from '../data/catalog';

const dc = (name: string) => {
  const c = DW_ROGUE_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`dev card missing: ${name}`);
  return c;
};
void dc; // items resolve by NAME through the CATALOG (real dev card names below)

const g = () => gs.getState().game;
const entById = (id: string) =>
  [...Object.values(g().p1.board), ...Object.values(g().p2.board)].find(e => e?.id === id)!;
const attack = (charId: string, targetId: string) => {
  gs.setState(() => ({ pending: { action: 'attack', charId } }));
  gs.getState().resolveAttack(targetId);
};

describe('Venom-Slicked Dagger (36) — item-granted POISON, identical to printed', () => {
  it('a dagger hit and a printed Fang-Adder hit produce the same poison shape', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: {
        f1: mkComp('db', 'Dagger Bearer', { atk: 2, loadout: { weapon: mkItem('vd', 'Venom-Slicked Dagger'), gear: [] } }),
        f2: mkComp('fa', 'Fang-Adder', { keywords: ['Poison'], atk: 1 }),
      } },
      p2: { ...s.game.p2, board: { f1: mkComp('v1', 'Victim One', { hp: 5 }), f2: mkComp('v2', 'Victim Two', { hp: 5 }) } },
    } }));
    expect(effectiveKeywords(g().p1.board.f1!, g()), 'the grant reaches effectiveKeywords').toContain('Poison');
    attack('db', 'v1');
    attack('fa', 'v2');
    const [v1, v2] = [entById('v1'), entById('v2')];
    expect(v1.hp, 'dagger damage incl. its +1').toBe(2);
    expect(v2.hp).toBe(4);
    // Identical poison shape — item-granted vs printed (the provenance canon).
    for (const v of [v1, v2]) {
      expect(v.poison, `${v.name}: one counter`).toBe(1);
      expect(v.exhausted, `${v.name}: exhausted`).toBe(true);
      expect(v.statuses, `${v.name}: POISONED status`).toContain(POISONED_STATUS);
    }
  });
});

describe("Wolfsbane Knife (44) — item-granted DRUID'S BANE (class-keyed, name preserved)", () => {
  const fight = (defCls: string) => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('kb', 'Knife Bearer', { atk: 2, loadout: { weapon: mkItem('wk', 'Wolfsbane Knife'), gear: [] } }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('def', 'Defender', { cls: defCls, hp: 9, maxHp: 9 }) } },
    } }));
    attack('kb', 'def');
    return g().p2.board.f1!.hp;
  };
  it('doubles against a Druid-class companion; normal otherwise', () => {
    expect(fight('Druid'), '(2+1) × 2 = 6 → 9−6').toBe(3);
    expect(fight('Warrior'), 'normal 3 → 9−3').toBe(6);
  });
});

describe('Poisoned Caltrops (46) — effect-applied counters, the SAME poison system', () => {
  /** p1's companion moves into its front line past p2's Caltrops. */
  const trip = () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b1: mkComp('mv', 'Mover', { hp: 5 }), b3: mkPc('pc-1') } },
      p2: { ...s.game.p2, board: { b2: mkConstruct('cal', 'Poisoned Caltrops', 2, { subtype: 'Trap' }) } },
    } }));
    gs.getState().beginMove('mv');
    gs.getState().resolveMove('f1');
  };

  it('a move into the front line exhausts the mover and applies a counter; the trap persists', () => {
    trip();
    const mv = entById('mv');
    expect(mv.poison, 'one counter').toBe(1);
    expect(mv.exhausted, 'exhausted — canon Poison always exhausts with the counter').toBe(true);
    expect(mv.statuses).toContain(POISONED_STATUS);
    expect(g().p2.board.b2?.anchors, 'Caltrops persists (no self-sacrifice)').toBe(2);
  });

  it("a Caltrops counter drives the IDENTICAL ready-phase check — failure damages the controller", () => {
    trip();
    gs.getState().endTurn(); // p2's turn
    expect(g().pendingPoison, "not p2's problem").not.toBe('p2');
    gs.getState().endTurn(); // p1's turn starts — the check arms for the poisoned side
    expect(g().pendingPoison, 'the ready check arms exactly like a combat counter').toBe('p1');
    const pcHp = g().p1.hp;
    gs.getState().resolvePoison('p1', [{ id: 'mv', cleansed: false }]);
    expect(g().p1.hp, '1 damage per counter to the controller').toBe(pcHp - 1);
    expect(entById('mv').poison, 'counters stay on a failed roll').toBe(1);
    expect(entById('mv').exhausted, 'stays exhausted').toBe(true);
  });

  it('…and a cleanse clears counters and readies — same as combat-applied', () => {
    trip();
    expect(entById('mv').poison, 'pre-assert: the counter is really there (no vacuous pass)').toBe(1);
    gs.getState().endTurn();
    gs.getState().endTurn();
    gs.getState().resolvePoison('p1', [{ id: 'mv', cleansed: true }]);
    const mv = entById('mv');
    expect(mv.poison ?? 0, 'all counters removed').toBe(0);
    expect(mv.exhausted, 'readied').toBe(false);
  });

  it('stacking across sources: Caltrops counter + printed-Poison hit = 2 counters, one check, 2 damage', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b1: mkComp('mv', 'Mover', { hp: 9 }), b3: mkPc('pc-1') } },
      p2: { ...s.game.p2, board: {
        b2: mkConstruct('cal', 'Poisoned Caltrops', 2, { subtype: 'Trap' }),
        f1: mkComp('fa', 'Fang-Adder', { keywords: ['Poison'], atk: 1 }),
      } },
    } }));
    gs.getState().beginMove('mv');
    gs.getState().resolveMove('f1'); // Caltrops: counter 1
    gs.getState().endTurn();         // p2's turn
    gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' as const } }));
    attack('fa', 'mv');              // printed Poison: counter 2
    expect(entById('mv').poison, 'counters accumulate across entry points').toBe(2);
    gs.getState().endTurn();         // p1's turn — ONE check for the one poisoned unit
    expect(g().pendingPoison).toBe('p1');
    const pcHp = g().p1.hp;
    gs.getState().resolvePoison('p1', [{ id: 'mv', cleansed: false }]); // one roll, one outcome
    expect(g().p1.hp, 'failure damage = 1 per counter TOTAL (2)').toBe(pcHp - 2);
  });

  it('counters live on the companion, not the item: dagger unequipped, the roll still comes', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('db', 'Dagger Bearer', { atk: 2, loadout: { weapon: mkItem('vd', 'Venom-Slicked Dagger'), gear: [] } }) } },
      p2: { ...s.game.p2, board: { f1: mkComp('vic', 'Victim', { hp: 5 }), b3: mkPc('pc-2') } },
    } }));
    attack('db', 'vic');
    expect(entById('vic').poison).toBe(1);
    // The dagger leaves the attacker — the victim's counters are unaffected.
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { ...s.game.p1.board,
        f1: { ...s.game.p1.board.f1!, loadout: { weapon: null, gear: [] } } } },
    } }));
    gs.getState().endTurn(); // p2's turn starts — their poisoned unit checks
    expect(g().pendingPoison, 'the check still arms').toBe('p2');
    const pcHp = g().p2.hp;
    gs.getState().resolvePoison('p2', [{ id: 'vic', cleansed: false }]);
    expect(g().p2.hp, 'failure damage lands').toBe(pcHp - 1);
  });
});
