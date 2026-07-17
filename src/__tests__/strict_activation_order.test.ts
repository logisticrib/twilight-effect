// Strict activation order (bugfix, owner-ratified 2026-07-15 — closes ab8a5b0's
// reported observation). Canon (CDP §24, quoted verbatim): "During activation, in
// order:" Movement → Minor → Major. Owner rationale: the rotation IS the tracker
// and rotation only advances — a character at 90° has no 45° state to enter, so a
// Minor after the Major is physically untrackable and illegal. Shared gate:
// minorActionReason (stats.ts), used by equip, Minor-cost Action cards, and
// Minor-cost activated abilities alike. The same gate also closed a pre-existing
// UNGATED hole: equipItem never checked acts.minor (equip was free after any
// action) — flagged to the owner in HANDOFF.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkPc, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const czCards = CATALOG.slice(20, 25);
const compCard = CATALOG.find(c => c.type === 'Companion')!;
const handItem = (id: string): Card => ({ id, name: 'Plain Buckler', level: 1, type: 'Item', subtype: 'Gear - Shield',
  rarity: 'Common', class1: 'Builder', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '',
  actionPM: '', itemKind: 'Gear', keywords: [], text: '', flavor: '' } as unknown as Card);
const minorAction = (id: string): Card => ({ id, name: 'Quick Patch', level: 1, type: 'Action', subtype: 'Physical',
  rarity: 'Common', class1: 'Builder', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '',
  actionPM: 'Minor', itemKind: '', keywords: [], text: '', flavor: '',
  effects: [{ trigger: 'onPlay', effects: [{ op: 'draw', count: 1 }] }] } as unknown as Card);
const stoneItem = { id: 'as-1', name: 'Anchor Stone', sub: 'Trinket', hands: 1 as const, counters: 0, text: '' };

function seed(hand: Card[], board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>> = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand, deck: CATALOG.slice(30, 36), board,
      classZone: czCards.map((c, i) => mkCz(c, 'Builder', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: p2Board, hand: [] },
  } }));
}
const attackWith = (charId: string, targetId: string) => {
  gs.setState({ pending: { action: 'attack', charId } });
  gs.getState().resolveAttack(targetId);
};
const REASON = 'Already fully exhausted — Minor Actions must come before the Major';

describe('strict §24 order: no Minor Action after the Major (rotation only advances)', () => {
  it('Major (attack) then EQUIP → refused with the tracker-terms reason; item stays in hand (companion)', () => {
    seed([handItem('it-1')], { f1: mkComp('vet', compCard.name, { atk: 2, fresh: false, loadout: { weapon: null, gear: [null, null] } }) },
      { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    attackWith('vet', 'tgt');
    gs.getState().equipItem('vet', 'it-1');
    expect(gs.getState().toasts.at(-1)?.msg).toContain(REASON);
    expect(gs.getState().game.p1.hand.length, 'item stays in hand').toBe(1);
    expect(gs.getState().game.p1.board.f1?.loadout?.gear[0], 'nothing equipped').toBeNull();
  });

  it('Major then Minor-cost ABILITY → refused (synthetic body ability; PC covered). RE-BASED 2026-07-16: Anchor Stone left this rule — item taps are window-model, legal after the Major', () => {
    // Supersession note: this pin originally used Anchor Stone as the Minor-cost
    // exemplar. The 2026-07-16 window model makes item taps NOT character actions
    // (usable after the Major — see activation_economy + item window pins), so the
    // Minor-after-Major rule is pinned with a synthetic BODY-hosted Minor ability.
    CATALOG.push({ id: 'syn-minor-body', name: 'Focus Probe', level: 1, type: 'Companion', subtype: '',
      rarity: 'Common', class1: 'Builder', class2: '', attack: 1, hp: 1, anchor: null, actionSub: '',
      actionPM: '', itemKind: '', keywords: [], text: '', flavor: '',
      effects: [{ trigger: 'activated', oncePerTurn: true, actionCost: 'minor', effects: [{ op: 'anchor', delta: 1, target: 'physicalConstruct' }] }],
    } as unknown as Card);
    try {
      seed([], { f2: mkPc('pc-1', { atk: 2 }), f3: mkComp('probe', 'Focus Probe', { fresh: false }),
                 f1: mkConstruct('bw-host', 'Reinforced Gate', 2, { subtype: 'Fortification' }) },
        { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
      attackWith('probe', 'tgt');
      gs.getState().activateAbility('probe', 0);
      expect(gs.getState().toasts.at(-1)?.msg).toContain(REASON);
      expect(gs.getState().pendingActionTarget, 'no targeting armed').toBeNull();
    } finally {
      const i = CATALOG.findIndex(c => c.id === 'syn-minor-body');
      if (i >= 0) CATALOG.splice(i, 1);
    }
  });

  it('Major then Minor-cost ACTION CARD → refused via the shared canPlayActionCard gate', () => {
    seed([minorAction('qa-1')], { f1: mkComp('vet', compCard.name, { atk: 2, fresh: false }) },
      { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    attackWith('vet', 'tgt');
    const deckBefore = gs.getState().game.p1.deck.length;
    gs.setState(s => ({ game: { ...s.game, selected: 'vet' } }));
    gs.getState().playAction('qa-1');
    expect(gs.getState().toasts.at(-1)?.msg).toContain(REASON);
    expect(gs.getState().game.p1.deck.length, 'card never resolved').toBe(deckBefore);
  });

  it('REGRESSION: the legal direction stands — Anchor Stone tap (window model, no rotation — 2026-07-16) then attack (Major, 90°)', () => {
    seed([], { f2: mkPc('pc-1', { atk: 2, loadout: { weapon: null, gear: [{ ...stoneItem }, null] } }),
               f1: mkConstruct('bw-host', 'Reinforced Gate', 2, { subtype: 'Fortification' }) },
      { f1: mkComp('tgt', compCard.name, { hp: 9 }) });
    gs.getState().activateAbility('pc-1', 0);
    gs.getState().resolveActionTarget('bw-host');
    expect(gs.getState().game.p1.board.f1?.anchors, 'Minor landed').toBe(3);
    attackWith('pc-1', 'tgt');
    expect(gs.getState().game.p2.board.f1?.hp, 'Major after Minor fully legal').toBe(7);
  });

  it('REGRESSION: Movement stays strictly first (move after a Minor refused — existing enforcement)', () => {
    seed([handItem('it-1')], { f1: mkComp('vet', compCard.name, { fresh: false, loadout: { weapon: null, gear: [null, null] } }) });
    gs.getState().equipItem('vet', 'it-1');
    expect(gs.getState().game.p1.board.f1?.loadout?.gear[0]?.name, 'Minor spent on the equip').toBe('Plain Buckler');
    gs.setState({ pending: { action: 'move', charId: 'vet' } });
    gs.getState().resolveMove('b1' as never);
    expect(gs.getState().game.p1.board.f1, 'move refused — character stayed put').toBeTruthy();
    expect(gs.getState().toasts.at(-1)?.msg).toContain('Move must be the first action');
  });

  it('FLAGGED CLOSURE: equip after equip → "Minor action already used" (equipItem was previously ungated)', () => {
    seed([handItem('it-1'), handItem('it-2')], { f1: mkComp('vet', compCard.name, { fresh: false, loadout: { weapon: null, gear: [null, null] } }) });
    gs.getState().equipItem('vet', 'it-1');
    gs.getState().equipItem('vet', 'it-2');
    expect(gs.getState().toasts.at(-1)?.msg).toContain('Minor action already used');
    expect(gs.getState().game.p1.board.f1?.loadout?.gear.filter(Boolean).length, 'only the first equip landed').toBe(1);
  });
});
