// INSPIRE (Paladin, owner ruling 2026-08-18, Master_Keyword_List §Paladin Keywords):
// "As long as one or more permanents with Inspire are in the encounter under your
// control, you are Inspired." INSPIRED is a state, not a card keyword: +1 Willpower,
// does not stack, applied to players rather than characters.
//
// Implemented as the exact mirror of Dismay — same derivation site (recomputeStatics)
// and the SAME single currentWillpower read, with the sign and the direction flipped:
// Inspire reads YOUR OWN board where Dismay reads your opponent's. Pinning it here
// rather than in a second read path is the point: the owner's netting ruling then
// falls out of arithmetic instead of being special-cased.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkCz } from './helpers';
import { currentWillpower, recomputeStatics } from '../store/keywords';
import type { PlayerState } from '../store/gameStore';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

describe('currentWillpower — Inspired is the mirror of Dismayed', () => {
  const wp = (over: Partial<PlayerState>) =>
    currentWillpower({ willpower: 3, dismayed: false, inspired: false, ...over } as PlayerState);

  it('Inspired adds 1', () => {
    expect(wp({})).toBe(3);
    expect(wp({ inspired: true })).toBe(4);
  });

  it('Dismayed + Inspired NETS TO ZERO — the printed Class-Zone count (owner ruling)', () => {
    expect(wp({ dismayed: true, inspired: true }), 'net zero, not −1 and not +1').toBe(3);
  });

  it('the floor still applies when only Dismayed', () => {
    expect(wp({ willpower: 0, dismayed: true })).toBe(0);
    expect(wp({ willpower: 0, dismayed: true, inspired: true }), 'netted, so no floor needed').toBe(0);
  });
});

describe('recomputeStatics derives Inspired from YOUR OWN board', () => {
  function seed(p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>> = {}) {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: p1Board },
      p2: { ...s.game.p2, board: p2Board },
    } }));
    return recomputeStatics(gs.getState().game);
  }

  it('an Inspire permanent Inspires ITS CONTROLLER, not the opponent', () => {
    const g = seed({ f1: mkComp('insp-src', compCard.name, { keywords: ['Inspire'] }) });
    expect(g.p1.inspired, 'the controller is Inspired').toBe(true);
    expect(g.p2.inspired, 'the opponent is NOT — this is the mirror of Dismay').toBe(false);
  });

  it('DOES NOT STACK: two Inspire permanents are still +1', () => {
    const one = seed({ f1: mkComp('st-1', compCard.name, { keywords: ['Inspire'] }) });
    const two = seed({
      f1: mkComp('st-1', compCard.name, { keywords: ['Inspire'] }),
      f2: mkComp('st-2', compCard2.name, { keywords: ['Inspire'] }),
    });
    expect(two.p1.inspired, 'still just the boolean state').toBe(true);
    expect(currentWillpower({ ...two.p1, willpower: 3 }), 'two sources = +1, same as one')
      .toBe(currentWillpower({ ...one.p1, willpower: 3 }));
    expect(currentWillpower({ ...two.p1, willpower: 3 })).toBe(4);
  });

  it('a CONSTRUCT carrier Inspires too (permanents, not just companions)', () => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkConstruct('insp-con', 'Oath Standard', 3, { keywords: ['Inspire'] }) } },
    } }));
    expect(recomputeStatics(gs.getState().game).p1.inspired).toBe(true);
  });

  it('it is DERIVED: removing the source clears the state', () => {
    const g = seed({ f1: mkComp('gone', compCard.name, { keywords: ['Inspire'] }) });
    expect(g.p1.inspired).toBe(true);
    expect(recomputeStatics({ ...g, p1: { ...g.p1, board: {} } }).p1.inspired, 'no source → not Inspired').toBe(false);
  });

  it('both states at once are derived independently, and net on the read', () => {
    const g = seed(
      { f1: mkComp('both-i', compCard.name, { keywords: ['Inspire'] }) },
      { f1: mkComp('both-d', compCard2.name, { keywords: ['Dismay'] }) },
    );
    expect(g.p1.inspired, 'own Inspire source').toBe(true);
    expect(g.p1.dismayed, 'opponent Dismay source').toBe(true);
    expect(currentWillpower({ ...g.p1, willpower: 3 }), 'nets to the printed count').toBe(3);
  });
});

describe('every Willpower reader sees Inspired (one accessor, no second path)', () => {
  it('fleeing: Inspire keeps a companion whose Level would otherwise exceed Willpower', () => {
    // The symmetric consequence of the ruled "Dismay pressure alone can cause
    // fleeing" — OWNER-RATIFIED 2026-08-18 (Game_Rules_Updated §Companion Fleeing).
    // It follows from installing Inspire at the single currentWillpower read site,
    // and the owner confirmed it when it was surfaced.
    function endTurnInto(inspired: boolean) {
      freshGame();
      gs.setState(s => ({ game: { ...s.game,
        p1: { ...s.game.p1, board: {} },
        p2: { ...s.game.p2, willpower: 3, dead: [],
          classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
          board: {
            f1: mkComp('edge4', compCard.name, { level: 4 }), // 4 > 3 flees; 4 ≤ 4 stays
            ...(inspired ? { f2: mkComp('insp', compCard2.name, { keywords: ['Inspire'] }) } : {}),
          } },
      } }));
      gs.getState().endTurn(); // p1 ends → p2's Ready Phase runs the fleeing check
      return gs.getState().game;
    }

    expect(endTurnInto(false).p2.board.f1, 'level 4 > current WP 3 — flees').toBeFalsy();
    expect(endTurnInto(true).p2.board.f1, 'Inspired: level 4 ≤ current WP 4 — stays').toBeTruthy();
  });
});
