// Item-ability activation model (owner-ratified 2026-07-16, supersedes the
// 2026-07-15 Minor-spend). Rules Note: "An item's activated ability is used during
// the equipped character's activation, at any point within it, and costs
// exhausting the item — no character action is spent and the character does not
// rotate. Using an item's ability opens or continues the bearer's activation like
// any other act of that character; once the bearer's activation has ended (another
// character has acted), their items' abilities are unavailable for the turn.
// Exhausted items ready at the start of their controller's turn. Item abilities
// are used only on their controller's turn." Item taps are the SECOND member of
// the category Special Actions created: no rotation cost, own tracker, free
// interleave within the window, sealed with the character.
// (90°-bearer-taps-fine is pinned in tier1_combat; ready-at-turn-start in
// item_exhaustion — both re-based this session.)
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';

const czCards = CATALOG.slice(20, 25);
const compCard = CATALOG.find(c => c.type === 'Companion')!;
const stone = () => mkItem('as-1', 'Anchor Stone', {});
const bearer = (id = 'bear', over: Parameters<typeof mkComp>[2] = {}) =>
  mkComp(id, compCard.name, { fresh: false, loadout: { weapon: null, gear: [stone(), null] }, ...over });

function seed(p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: p1Board, hand: [], deck: CATALOG.slice(30, 33),
      classZone: czCards.map((c, i) => mkCz(c, 'Builder', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [] },
  } }));
}
const b = () => gs.getState().game.p1.board;
const tap = (bearerId: string, targetId: string) => {
  gs.getState().activateAbility(bearerId, 0);
  gs.getState().resolveActionTarget(targetId);
};

describe('item taps live in the bearer\'s activation window (2026-07-16)', () => {
  it('tap BEFORE Movement is legal — item taps sit outside the Move→Minor→Major sequence', () => {
    seed({ f1: bearer(), f3: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    tap('bear', 'bw');
    expect(b().f3?.anchors, 'tap landed first').toBe(3);
    gs.setState({ pending: { action: 'move', charId: 'bear' } });
    gs.getState().resolveMove('b1' as never);
    expect(b().b1?.name, 'Movement still legal after the tap (move-first not violated)').toBe(compCard.name);
  });

  it('tap costs NOTHING of the bearer: Minor still available (equip works after the tap)', () => {
    seed({ f1: bearer(), f3: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      hand: [{ id: 'it-x', name: 'Plain Buckler', level: 1, type: 'Item', subtype: 'Gear - Shield', rarity: 'Common',
        class1: 'Builder', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '', actionPM: '', itemKind: 'Gear',
        keywords: [], text: '', flavor: '' } as never] } } }));
    tap('bear', 'bw');
    gs.getState().equipItem('bear', 'it-x');
    expect(b().f1?.loadout?.gear[1]?.name, 'Minor was untouched by the tap — equip landed').toBe('Plain Buckler');
  });

  it('tapping OPENS the bearer\'s activation: another character mid-activation is sealed by it', () => {
    seed({ f1: bearer(), f2: mkComp('vet', compCard.name, { atk: 2, fresh: false }),
           f3: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    // vet moves (mid-activation), then the BEARER taps its item → vet is sealed.
    gs.setState({ pending: { action: 'move', charId: 'vet' } });
    gs.getState().resolveMove('b2' as never);
    tap('bear', 'bw');
    expect(b().f3?.anchors, 'tap landed').toBe(3);
    gs.getState().beginAttack('vet');
    expect(gs.getState().pending, 'vet sealed by the character switch').toBeNull();
    expect(gs.getState().toasts.at(-1)?.msg).toContain('already finished its activation');
  });

  it('sealed bearer: items untappable for the turn, refused in the ruled terms', () => {
    seed({ f1: bearer(), f2: mkComp('vet', compCard.name, { atk: 2, fresh: false }),
           f3: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) },
      { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    // The bearer acts, then vet acts (seals the bearer), then the bearer taps.
    gs.setState({ pending: { action: 'attack', charId: 'bear' } });
    gs.getState().resolveAttack('tgt');
    gs.setState({ pending: { action: 'attack', charId: 'vet' } });
    gs.getState().resolveAttack('tgt');
    gs.getState().activateAbility('bear', 0);
    expect(gs.getState().toasts.at(-1)?.msg, 'ruled refusal wording').toContain("'s activation is finished");
    expect(b().f1?.loadout?.gear[0]?.exhausted ?? undefined, 'item not spent on a refusal').toBeUndefined();
  });

  it("opponent's turn: item abilities refused (existing inactive-player restriction, cited)", () => {
    seed({ f1: bearer(), f3: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    gs.setState(s => ({ game: { ...s.game, activePlayer: 'p2' } }));
    gs.getState().activateAbility('bear', 0);
    expect(gs.getState().toasts.at(-1)?.msg).toContain("item abilities are used on their controller's turn");
    expect(gs.getState().pendingActionTarget, 'nothing armed').toBeNull();
  });
});
