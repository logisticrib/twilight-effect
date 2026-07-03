// Owner rulings resolved 2026-07-03 (tasks/test_seed_plan.md §Owner rulings),
// encoded as tests so they can't be silently re-litigated.
// Ruling 1 (fled/decayed → Dead Zone) is covered by gameplay.test.ts
// ("readyPlayer: anchor decay + flee reach the Dead Zone").
// Ruling 2: Stone Rampart is anchors-not-heal, and the `anchor` group op
// excludes its own source (self-inclusion would be hidden printed-anchor inflation).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkConstruct } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const rampart = CATALOG.find(c => c.name === 'Stone Rampart')!;
const grudrik = CATALOG.find(c => c.name === 'Grudrik Stonebrace')!;

/** Board with an existing Physical Construct + a Magic Construct, hand holding `cards`. */
function seedBoard(cards: Card[]) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1,
      hand: cards,
      classZone: CATALOG.slice(10, 15).map(c => ({ id: c.id, cls: c.class1 || 'Builder', name: c.name, faceDown: false, cardData: c })),
      willpower: 5,
      board: {
        f1: mkConstruct('phys-1', 'Existing Trap', 2, { subtype: 'Trap', hp: 0, maxHp: 0 }),
        f2: mkConstruct('magic-1', 'Existing Incantation', 2, { subtype: 'Incantation', hp: 0, maxHp: 0 }),
      },
    },
  } }));
}

describe('ruling 2: Stone Rampart grants anchors to OTHER Physical Constructs', () => {
  it('is authored as an anchor op, not the interim heal', () => {
    expect(rampart.effects?.[0]?.trigger).toBe('onEnter');
    expect(rampart.effects?.[0]?.effects?.[0]).toMatchObject({ op: 'anchor', delta: 1, target: 'ownPhysicalConstructs' });
    expect(rampart.text).toContain('other Physical Constructs');
  });

  it('on enter: other physical +1, itself excluded, magic construct untouched', () => {
    seedBoard([rampart]);
    gs.getState().beginPlay(rampart.id);
    gs.getState().placeCard('b1');
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'Stone Rampart placed').toBe('Stone Rampart');
    expect(g.p1.board.f1?.anchors, 'other physical construct 2→3').toBe(3);
    expect(g.p1.board.f2?.anchors, 'magic construct untouched').toBe(2);
    expect(g.p1.board.b1?.anchors, 'Rampart keeps PRINTED anchors (3, not 4 — self excluded)').toBe(3);
  });

  it('Grudrik regression: companion source still buffs every physical construct (+2)', () => {
    seedBoard([rampart, grudrik]);
    gs.getState().beginPlay(rampart.id);
    gs.getState().placeCard('b1');
    gs.getState().beginPlay(grudrik.id);
    gs.getState().placeCard('b2');
    const g = gs.getState().game;
    expect(g.p1.board.b2?.name, 'Grudrik placed').toBe('Grudrik Stonebrace');
    expect(g.p1.board.f1?.anchors, 'Trap 3→5').toBe(5);
    expect(g.p1.board.b1?.anchors, 'Stone Rampart 3→5').toBe(5);
    expect(g.p1.board.f2?.anchors, 'magic construct still untouched').toBe(2);
  });
});
