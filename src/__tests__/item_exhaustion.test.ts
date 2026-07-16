// Item exhaustion (owner-ratified 2026-07-15 — follow-up to ef4f0be's open
// question). Rules Note: "Items can be exhausted when an effect uses exhausting
// them as a cost. An exhausted item readies at the start of its controller's turn,
// with that player's characters. Exhaustion belongs to the item itself: moving an
// exhausted item to another character does not ready it. An item's granted static
// bonuses and keywords are unaffected by its exhaustion unless stated otherwise."
// Owner rationale: exhaustion is self-tracking in physical play (the rotated card
// is the record); once-per-turn markers are not. Anchor Stone's cost is now
// `exhaustItem` — the per-bearer oncePerTurn marker was wrong (a Kit-Master move
// used to grant a second activation).
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem, mkCz } from './helpers';
import { effectiveMaxHp } from '../store/keywords';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const czCards = CATALOG.slice(20, 25);
const compCard = CATALOG.find(c => c.type === 'Companion')!;
const stone = () => mkItem('as-1', 'Anchor Stone', {});

function seed(p1Board: Record<string, ReturnType<typeof mkComp>>) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: p1Board, hand: [], deck: CATALOG.slice(30, 33),
      classZone: czCards.map((c, i) => mkCz(c, 'Builder', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: {}, hand: [] },
  } }));
}
const b = () => gs.getState().game.p1.board;
const activateStone = (bearerId: string, targetId: string) => {
  gs.getState().activateAbility(bearerId, 0);
  gs.getState().resolveActionTarget(targetId);
};

describe('item exhaustion — "exhaust this trinket" is a real item cost', () => {
  it('activation exhausts THE ITEM (not the bearer); a second activation is refused naming the item', () => {
    seed({ f1: mkComp('bear', compCard.name, { loadout: { weapon: null, gear: [stone(), null] } }),
           f2: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    activateStone('bear', 'bw');
    const ent = b().f1!;
    expect(ent.loadout?.gear[0]?.exhausted, 'the trinket is exhausted').toBe(true);
    expect(ent.exhausted, 'the bearer is NOT').toBe(false);
    expect(b().f2?.anchors).toBe(3);
    gs.getState().activateAbility('bear', 0);
    expect(gs.getState().toasts.at(-1)?.msg, 'refusal names the item').toContain('Anchor Stone is exhausted');
    expect(b().f2?.anchors, 'no second anchor').toBe(3);
  });

  it('Kit-Master carry: the exhausted trinket moved to another character is STILL refused (closes ef4f0be question 3)', () => {
    seed({ f1: mkComp('bear', compCard.name, { loadout: { weapon: null, gear: [stone(), null] } }),
           f2: mkComp('mate', compCard.name, { loadout: { weapon: null, gear: [null, null] } }),
           f3: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    activateStone('bear', 'bw');
    // Move the exhausted trinket bear → mate through the loadouts, as the kit flow
    // does (the EquippedItem object travels wholesale — exhaustion rides along).
    gs.setState(s => {
      const bd = s.game.p1.board;
      const it = bd.f1!.loadout!.gear[0]!;
      return { game: { ...s.game, p1: { ...s.game.p1, board: { ...bd,
        f1: { ...bd.f1!, loadout: { weapon: null, gear: [null, null] } },
        f2: { ...bd.f2!, loadout: { weapon: null, gear: [it, null] } } } } } };
    });
    expect(b().f2?.loadout?.gear[0]?.exhausted, 'exhaustion travels with the item').toBe(true);
    gs.getState().activateAbility('mate', 0);
    expect(gs.getState().toasts.at(-1)?.msg, 'new bearer refused — no second activation from moving it').toContain('Anchor Stone is exhausted');
    expect(b().f3?.anchors, 'still one anchor added this turn').toBe(3);
  });

  it("readies at the CONTROLLER's next turn start (not the opponent's), alongside characters; usable again", () => {
    seed({ f1: mkComp('bear', compCard.name, { loadout: { weapon: null, gear: [stone(), null] } }),
           f2: mkConstruct('bw', 'Reinforced Gate', 9, { subtype: 'Fortification' }) });
    activateStone('bear', 'bw');
    expect(b().f1?.loadout?.gear[0]?.exhausted).toBe(true);
    gs.getState().endTurn(); // p1 → p2: the OPPONENT's ready — p1's item stays spent
    expect(b().f1?.loadout?.gear[0]?.exhausted, "opponent's turn start does NOT ready it").toBe(true);
    gs.getState().endTurn(); // p2 → p1: the controller's ready
    expect(b().f1?.loadout?.gear[0]?.exhausted ?? undefined, 'readied — key REMOVED (hash discipline)').toBeUndefined();
    activateStone('bear', 'bw');
    expect(b().f2?.anchors, 'usable again next turn').toBeGreaterThanOrEqual(9);
  });

  it('granted static bonuses persist while exhausted (Rules Note sentence, pinned via a synthetic +1 HP trinket)', () => {
    CATALOG.push({ id: 'syn-exh-trinket', name: 'Probe Charm', level: 1, type: 'Item', subtype: 'Trinket',
      rarity: 'Common', class1: 'Builder', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '',
      actionPM: '', itemKind: 'Trinket', keywords: [], text: '', flavor: '',
      effects: [
        { trigger: 'equipped', effects: [{ op: 'buff', stat: 'hp', amount: 1, scope: 'self', duration: 'while' }] },
        { trigger: 'activated', cost: { kind: 'exhaustItem' }, actionCost: 'minor', effects: [{ op: 'anchor', delta: 1, target: 'physicalConstruct' }] },
      ] } as unknown as Card);
    try {
      seed({ f1: mkComp('bear', compCard.name, { hp: 5, maxHp: 5, loadout: { weapon: null, gear: [mkItem('pc-1', 'Probe Charm', {}), null] } }),
             f2: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
      const before = effectiveMaxHp(b().f1!, gs.getState().game);
      expect(before, '+1 HP static active').toBe(6);
      activateStone('bear', 'bw');
      expect(b().f1?.loadout?.gear[0]?.exhausted).toBe(true);
      expect(effectiveMaxHp(b().f1!, gs.getState().game), '+1 HP persists while exhausted').toBe(6);
    } finally {
      const i = CATALOG.findIndex(c => c.id === 'syn-exh-trinket');
      if (i >= 0) CATALOG.splice(i, 1);
    }
  });

  it("bearer economy beyond the Minor spend is untouched — it still attacks after activating (ef4f0be regression)", () => {
    seed({ f1: mkComp('bear', compCard.name, { atk: 2, loadout: { weapon: null, gear: [stone(), null] } }),
           f2: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { f1: mkComp('tgt', compCard.name, { hp: 9 }) } } } }));
    activateStone('bear', 'bw');
    gs.setState({ pending: { action: 'attack', charId: 'bear' } });
    gs.getState().resolveAttack('tgt');
    expect(gs.getState().game.p2.board.f1?.hp, 'attack landed after the Minor activation').toBe(7);
  });
});
