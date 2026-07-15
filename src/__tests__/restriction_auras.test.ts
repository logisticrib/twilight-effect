// Standing-restriction auras (capability arc 3, owner-ratified 2026-07-15).
// Canon, verbatim: Crystalline Sentinel — "Opposing back-line companions cannot
// attack." Reinforced Gate — "Opposing companions cannot move between front and
// back lines." Rulings pinned here:
//   R1 — "cannot" beats "can": restrictions are evaluated AFTER permissions
//        (Ranged, Watchtower coverage), so a restriction always has the final word.
//   R2 — restrictions gate the action when it is ATTEMPTED (attack declaration /
//        the moment a move would begin); never retroactive.
//   R3 — movement restrictions cover ALL movement between the lines, chosen and
//        effect-driven (reposition) alike. (The interpreter's forced-'move' op is
//        still unimplemented — standing requirement recorded at its validator stub.)
//   R4 — entering the encounter is not movement; lateral within-line repositioning
//        is not "between" lines; own companions are never restricted by their own
//        aura; the restriction dies with its source.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkCz } from './helpers';
import { attackRestrictedBy, moveRestrictedBy } from '../store/keywords';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];
const sentinel = (id: string) => mkConstruct(id, 'Crystalline Sentinel', 4, { subtype: 'Incantation' });
const gate = (id: string) => mkConstruct(id, 'Reinforced Gate', 3, { subtype: 'Fortification' });

/** p1 board + p2 board; action phase, p1 active (freshGame default). */
const seed = (p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>>) => {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: p1Board },
    p2: { ...s.game.p2, board: p2Board },
  } }));
};

describe('R1 — "cannot" beats "can" (Crystalline Sentinel: "Opposing back-line companions cannot attack.")', () => {
  it('a RANGED opposing back-line companion cannot attack while the Sentinel stands', () => {
    seed({ b1: mkComp('ra-1', compCard.name, { keywords: ['Ranged'] }) },
         { f1: sentinel('cs-1') });
    gs.getState().beginAttack('ra-1');
    expect(gs.getState().pending, 'declaration refused (no pending attack armed)').toBeNull();
    const loc = { ent: gs.getState().game.p1.board.b1!, slot: 'b1' as const };
    expect(attackRestrictedBy(gs.getState().game, loc.ent, 'p1', loc.slot), 'the gate names the restricting source').toBe('Crystalline Sentinel');
  });

  it('Watchtower interop: aura-granted eligibility is ALSO overridden (permission then restriction)', () => {
    // Watchtower covers back-line COMPANIONS (not constructs) — its grant CAN collide
    // with the Sentinel's scope, and the restriction wins.
    seed({ b1: mkComp('wt-1', compCard.name), f2: mkConstruct('tower', 'Watchtower', 3) },
         { f1: sentinel('cs-1') });
    gs.getState().beginAttack('wt-1');
    expect(gs.getState().pending, 'Watchtower-covered companion still refused').toBeNull();

    // Control: same board WITHOUT the Sentinel — the Watchtower grant works.
    seed({ b1: mkComp('wt-1', compCard.name), f2: mkConstruct('tower', 'Watchtower', 3) }, {});
    gs.getState().beginAttack('wt-1');
    expect(gs.getState().pending?.action, 'without the Sentinel the grant stands').toBe('attack');
  });
});

describe('Sentinel scope (R4) — exactly what the card names', () => {
  it('an opposing FRONT-line companion still attacks (where.line back only)', () => {
    seed({ f1: mkComp('fr-1', compCard.name) }, { f1: sentinel('cs-1'), f2: mkComp('def', compCard2.name) });
    gs.getState().beginAttack('fr-1');
    expect(gs.getState().pending?.action, 'front-liner declares normally').toBe('attack');
  });

  it("the controller's OWN back-line Ranged companion is never restricted by their own aura", () => {
    seed({}, { f1: sentinel('cs-1'), b1: mkComp('own-1', compCard.name, { keywords: ['Ranged'] }) });
    gs.getState().beginAttack('own-1');
    expect(gs.getState().pending?.action, "own side unrestricted ('opposing' is from the controller's perspective)").toBe('attack');
  });

  it('the restriction dies with its source: attack legal again the moment the Sentinel leaves (real destruction path)', () => {
    seed({ b1: mkComp('ra-1', compCard.name, { keywords: ['Ranged'] }) }, { f1: sentinel('cs-1') });
    gs.getState().beginAttack('ra-1');
    expect(gs.getState().pending, 'refused while it stands').toBeNull();
    gs.getState().sacrificeEntity('cs-1'); // routes destroyEntity — the shared exit path
    expect(gs.getState().game.p2.board.f1, 'Sentinel gone').toBeUndefined();
    gs.getState().beginAttack('ra-1');
    expect(gs.getState().pending?.action, 'immediately legal again — no cached state').toBe('attack');
  });
});

describe('R2 — legality is checked at the declaration attempt', () => {
  it('an unrestricted declaration proceeds and resolves normally with a Sentinel merely in play', () => {
    seed({ f1: mkComp('fr-1', compCard.name, { atk: 3 }) },
         { f1: sentinel('cs-1'), f2: mkComp('def', compCard2.name, { hp: 9 }) });
    gs.getState().beginAttack('fr-1');
    gs.getState().resolveAttack('def');
    expect(gs.getState().game.p2.board.f2?.hp, 'front-line attack resolves (9 − 3)').toBe(6);
  });

  it('the declaration COMMIT re-checks: a Sentinel arriving while targeting UI is up refuses the attack', () => {
    seed({ b1: mkComp('ra-1', compCard.name, { keywords: ['Ranged'], atk: 3 }) },
         { f2: mkComp('def', compCard2.name, { hp: 9 }) });
    gs.getState().beginAttack('ra-1'); // legal at this moment — pending armed
    expect(gs.getState().pending?.action).toBe('attack');
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { ...s.game.p2.board, f1: sentinel('cs-late') } } } }));
    gs.getState().resolveAttack('def');
    const g = gs.getState().game;
    expect(g.p2.board.f2?.hp, 'no damage — the declaration was refused at commit').toBe(9);
    expect(gs.getState().pending, 'pending cleared with a reason toast').toBeNull();
  });
});

describe('Reinforced Gate — "Opposing companions cannot move between front and back lines." (R3/R4)', () => {
  const mover = (slot: string, id = 'mv-1') => ({ [slot]: mkComp(id, compCard.name) });

  it('front→back AND back→front are both blocked for opposing companions', () => {
    seed(mover('f1'), { f1: gate('rg-1') });
    gs.getState().beginMove('mv-1');
    gs.getState().resolveMove('b1');
    let g = gs.getState().game;
    expect(g.p1.board.f1?.id, 'front→back refused — mover stays put').toBe('mv-1');
    expect(g.p1.board.f1?.acts.move, 'no move consumed on a refusal').toBe(false);

    seed(mover('b1'), { f1: gate('rg-1') });
    gs.getState().beginMove('mv-1');
    gs.getState().resolveMove('f1');
    g = gs.getState().game;
    expect(g.p1.board.b1?.id, 'back→front refused too').toBe('mv-1');
  });

  it("the Gate controller's OWN companions cross lines freely", () => {
    seed({}, { f1: gate('rg-1'), f2: mkComp('own-mv', compCard.name) });
    gs.getState().beginMove('own-mv');
    gs.getState().resolveMove('b2');
    expect(gs.getState().game.p2.board.b2?.id, 'own companion crossed unhindered').toBe('own-mv');
  });

  it('lateral within-line repositioning is not "between" lines — unrestricted', () => {
    seed(mover('f1'), { f1: gate('rg-1') });
    gs.getState().beginMove('mv-1');
    gs.getState().resolveMove('f2');
    expect(gs.getState().game.p1.board.f2?.id, 'lateral front→front step allowed').toBe('mv-1');
  });

  it('entering the encounter is not movement: a companion enters the back line with the Gate up', () => {
    const czCards = CATALOG.slice(20, 25);
    const hand: Card = { id: 'en-1', name: 'Gate Tester', level: 1, type: 'Companion', subtype: '',
      rarity: 'Common', class1: 'Warrior', class2: '', attack: 2, hp: 3, anchor: null,
      actionSub: '', actionPM: '', itemKind: '', keywords: [], text: '', flavor: '' } as unknown as Card;
    freshGame();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, hand: [hand], deck: CATALOG.slice(30, 33), board: {},
        classZone: czCards.map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)), willpower: 5 },
      p2: { ...s.game.p2, board: { f1: gate('rg-1') }, hand: [] },
    } }));
    gs.getState().beginPlay('en-1');
    gs.getState().placeCard('b1');
    expect(gs.getState().game.p1.board.b1?.name, 'entry unaffected by the movement restriction').toBe('Gate Tester');
  });

  it('movement is legal again the moment the Gate leaves', () => {
    seed(mover('f1'), { f1: gate('rg-1') });
    gs.getState().beginMove('mv-1');
    gs.getState().resolveMove('b1');
    expect(gs.getState().game.p1.board.f1?.id, 'blocked while it stands').toBe('mv-1');
    gs.getState().sacrificeEntity('rg-1');
    gs.getState().beginMove('mv-1');
    gs.getState().resolveMove('b1');
    expect(gs.getState().game.p1.board.b1?.id, 'crosses freely once the source is gone').toBe('mv-1');
  });

  it('R3 — effect-driven repositioning is movement: cross-line destinations are not offered, and the executor re-checks', () => {
    seed(mover('f1'), { f1: gate('rg-1') });
    // Arm a real two-step reposition prompt (Tactical Reposition shape) and pick the mover.
    gs.setState({ pendingActionTarget: { source: 'action', sourceName: 'Test Reposition', lp: 'p1',
      effects: [{ op: 'move', to: 'anySlot', target: 'ownCharacter' }], eligibleIds: ['mv-1'], twoStep: 'reposition' } });
    gs.getState().resolveActionTarget('mv-1');
    const slots = gs.getState().pendingActionTarget?.eligibleSlots ?? [];
    expect(slots.some(sl => sl.startsWith('b')), 'no back-line (cross-line) slot offered').toBe(false);
    expect(slots.some(sl => sl.startsWith('f')), 'same-line slots still offered').toBe(true);

    // Defense-in-depth: force a cross-line slot into the prompt — the executor refuses.
    gs.setState(s => ({ pendingActionTarget: { ...s.pendingActionTarget!, eligibleSlots: ['b1'] } }));
    gs.getState().resolveActionSlot('b1');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.id, 'executor re-checked and refused the cross-line reposition').toBe('mv-1');
    expect(g.p1.board.b1, 'nothing moved').toBeUndefined();
  });
});

describe('both auras in play restrict independently', () => {
  it('Sentinel + Gate together: back-line Ranged cannot attack AND cannot cross lines, but moves laterally; a front-liner attacks but cannot cross', () => {
    seed({ b1: mkComp('ra-1', compCard.name, { keywords: ['Ranged'] }), f1: mkComp('fr-1', compCard.name, { atk: 2 }) },
         { f1: sentinel('cs-1'), f2: gate('rg-1'), f3: mkComp('def', compCard2.name, { hp: 9 }) });
    // Back-liner: no attack…
    gs.getState().beginAttack('ra-1');
    expect(gs.getState().pending, 'Sentinel blocks the back-line attack').toBeNull();
    // …no crossing…
    gs.getState().beginMove('ra-1');
    gs.getState().resolveMove('f2');
    expect(gs.getState().game.p1.board.b1?.id, 'Gate blocks the crossing').toBe('ra-1');
    // …but lateral is fine.
    gs.getState().beginMove('ra-1');
    gs.getState().resolveMove('b2');
    expect(gs.getState().game.p1.board.b2?.id, 'lateral move unrestricted').toBe('ra-1');
    // Front-liner: attacks fine (Sentinel is back-line-scoped), crossing blocked.
    gs.getState().beginAttack('fr-1');
    expect(gs.getState().pending?.action, 'Sentinel does not touch the front-liner').toBe('attack');
    gs.getState().cancelPending();
    gs.getState().beginMove('fr-1');
    gs.getState().resolveMove('b3');
    expect(gs.getState().game.p1.board.f1?.id, 'Gate still blocks the front-liner crossing').toBe('fr-1');
    expect(moveRestrictedBy(gs.getState().game, gs.getState().game.p1.board.f1!, 'p1', 'f1', 'b3'), 'gate names its source').toBe('Reinforced Gate');
  });
});
