// One "current Willpower" (owner ruling 2026-07-04): the Class-Zone count minus 1
// while Dismayed (floor 0), and EVERY reader uses it — the play-from-hand level gate
// (tier1_economy), the Poison roll (willpower_poison_modal.test.tsx), the fleeing
// check, and card conditions (willpowerAtLeast). These tests pin the unified readers,
// including the ruled-intended consequence: Dismay pressure alone can cause fleeing.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkCz } from './helpers';
import { currentWillpower } from '../store/keywords';
import type { PlayerState } from '../store/gameStore';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

describe('currentWillpower — the single accessor', () => {
  it('base minus Dismayed, floored at 0', () => {
    expect(currentWillpower({ willpower: 3, dismayed: false } as PlayerState)).toBe(3);
    expect(currentWillpower({ willpower: 3, dismayed: true } as PlayerState)).toBe(2);
    expect(currentWillpower({ willpower: 0, dismayed: true } as PlayerState)).toBe(0);
  });
});

describe('fleeing reads current Willpower — Dismay pressure can cause fleeing (intended)', () => {
  function endTurnInto(dismayed: boolean) {
    freshGame();
    // RE-BASED 2026-07-20 (last-gasp restructure): Dismay is DERIVED state — the
    // Ready Phase now recomputes statics BEFORE the flee check (so a start-of-turn
    // trigger that removes a Dismay source is honored), which correctly clears a
    // hand-seeded `dismayed` flag with no source behind it. Seed a REAL Dismay
    // source on the opponent's board instead (no shipped card carries Dismay, so a
    // synthetic entity keyword exercises the derivation path end-to-end). The
    // pinned ruling is unchanged: Dismay pressure alone can cause fleeing.
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: dismayed
        ? { f1: mkComp('dismay-src', compCard.name, { keywords: ['Dismay'] }) }
        : {} },
      p2: { ...s.game.p2, willpower: 3, dead: [],
        classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
        board: {
          f1: mkComp('edge', compCard.name, { level: 3 }),   // 3 ≤ 3 stays; 3 > 2 flees
          f2: mkComp('safe', compCard2.name, { level: 2 }),  // control: 2 ≤ 2 either way
        } },
    } }));
    gs.getState().endTurn(); // p1 ends → p2's Ready Phase runs the fleeing check
    return gs.getState().game;
  }

  it('without Dismay: current WP 3, the level-3 companion stays', () => {
    const g = endTurnInto(false);
    expect(g.p2.board.f1, 'level 3 vs current WP 3 — stays').toBeTruthy();
    expect(g.p2.board.f2, 'level 2 stays').toBeTruthy();
  });

  it('Dismayed: same board, current WP 2 — the level-3 companion flees to the Dead Zone', () => {
    const g = endTurnInto(true);
    expect(g.p2.board.f1, 'level 3 > current WP 2 — fled').toBeFalsy();
    expect(g.p2.dead.map(c => c.name), 'fled card buried').toContain(compCard.name);
    expect(g.p2.board.f2, 'level 2 ≤ current WP 2 — stays').toBeTruthy();
  });
});

describe("card condition 'willpowerAtLeast' reads current Willpower", () => {
  function castGatedDraw(dismayed: boolean): number {
    freshGame();
    const card = {
      id: 'wa-1', name: 'Willpower Gate', level: 1, type: 'Action', subtype: '', rarity: '',
      class1: '', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '', actionPM: 'Minor',
      itemKind: '', keywords: [], text: '', flavor: '', cls: '',
      effects: [{ trigger: 'onPlay', effects: [{ op: 'draw', count: 1, if: { kind: 'willpowerAtLeast', value: 3 } }] }],
    } as unknown as Card;
    gs.setState(s => ({ game: { ...s.game, selected: 'caster',
      p1: { ...s.game.p1, willpower: 3, dismayed, hand: [card],
        board: { f1: mkComp('caster', compCard.name) } },
    } }));
    gs.getState().playAction(card.id);
    // hand: the played card left (−1); the gated draw adds one back only if the
    // condition held → 1 with the draw, 0 without.
    return gs.getState().game.p1.hand.length;
  }

  it('base WP 3, not Dismayed → condition met, draws', () => {
    expect(castGatedDraw(false)).toBe(1);
  });

  it('base WP 3 but Dismayed → current WP 2 < 3, no draw (raw read would have drawn)', () => {
    expect(castGatedDraw(true)).toBe(0);
  });
});
