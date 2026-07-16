// Bugfix pair (owner 2026-07-15): Anchor Stone activation economy + Animate Magic
// entry gating; plus the PC turn-1 attack verification.
//
// Anchor Stone, canon verbatim: "Equipped character has +1 HP. As a Minor Action,
// exhaust this trinket: add 1 Anchor counter to target Physical Construct."
// DIAGNOSIS (report has the evidence): the ability was always UI-reachable — the
// practical unreachability was ACTION-ECONOMY misclassification: every character-
// hosted activation was hardwired as a Major Action (blocked on the entry turn,
// blocked after attacking, and paying with FULL EXHAUSTION + 90°). New per-clause
// `actionCost: 'minor'`: Minor budget, 45° tap, no exhaustion, legal on the entry
// turn (the first-turn ban covers Major Actions only — GRU §First-Turn).
//
// Animate: type-changing is not "entering the encounter" (Rules Note 2026-07-15).
// `fresh` now means "entered the encounter this turn" for EVERY permanent —
// stamped at placeCard, cleared at ready, PRESERVED through animation.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkPc, mkItem, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';

const czCards = CATALOG.slice(20, 25);
const compCard = CATALOG.find(c => c.type === 'Companion')!;
const stone = () => mkItem('as-1', 'Anchor Stone', {});
const bearer = (over: Parameters<typeof mkComp>[2] = {}) =>
  mkComp('bear', compCard.name, { cls: 'Builder', loadout: { weapon: null, gear: [stone(), null] }, ...over });

function seed(p1Board: Record<string, ReturnType<typeof mkComp>>) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: p1Board, hand: [], deck: CATALOG.slice(30, 33),
      classZone: czCards.map((c, i) => mkCz(c, 'Builder', `cz-${i}`)), willpower: 5 },
    p2: { ...s.game.p2, board: {}, hand: [] },
  } }));
}
const b = () => gs.getState().game.p1.board;

describe('Anchor Stone — "As a Minor Action, exhaust this trinket" (activation economy bugfix)', () => {
  it('activates as the bearer\'s MINOR action: 45° tap, NOT exhausted, Major still available; adds the anchor via targeting', () => {
    seed({ f1: bearer(), f2: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    gs.getState().activateAbility('bear', 0);
    let ent = b().f1!;
    expect(gs.getState().pendingActionTarget?.eligibleIds, 'targeting armed').toEqual(['bw']);
    expect(ent.acts.minor, 'Minor budget consumed').toBe(true);
    expect(ent.acts.major, 'Major budget INTACT').toBe(false);
    expect(ent.tapped, '45° tap, not 90°').toBe('minor');
    expect(ent.exhausted, 'NOT exhausted — the old Major default wrecked the bearer').toBe(false);
    gs.getState().resolveActionTarget('bw');
    expect(b().f2?.anchors, '+1 anchor on the target').toBe(3);
    ent = b().f1!;
    // The bearer can still attack afterward (Minor then Major, normal activation order).
    gs.setState({ pending: { action: 'attack', charId: 'bear' } });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { f1: mkComp('tgt', compCard.name, { hp: 9 }) } } } }));
    gs.getState().resolveAttack('tgt');
    expect(gs.getState().game.p2.board.f1?.hp, 'attack landed after the Minor activation').toBeLessThan(9);
  });

  it('legal on the bearer\'s ENTRY turn (first-turn ban covers Major Actions only)', () => {
    seed({ f1: bearer({ fresh: true }), f2: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    gs.getState().activateAbility('bear', 0);
    expect(gs.getState().pendingActionTarget, 'fresh bearer may take Minor Actions').toBeTruthy();
  });

  it('once per turn enforced; refused with a toast when no Physical Construct exists (universal pre-cost refusal)', () => {
    seed({ f1: bearer(), f2: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    gs.getState().activateAbility('bear', 0);
    gs.getState().resolveActionTarget('bw');
    gs.getState().activateAbility('bear', 0);
    expect(gs.getState().toasts.at(-1)?.msg, 'second use refused').toContain('already used this turn');

    seed({ f1: bearer() }); // no construct anywhere
    gs.getState().activateAbility('bear', 0);
    expect(gs.getState().toasts.at(-1)?.msg, 'no-target refusal is loud').toContain('no legal target');
    expect(b().f1?.acts.minor, 'nothing charged on refusal').toBe(false);
  });

  it('the Major default is unchanged for other abilities (Quill: Major wording, exhausts)', () => {
    // Quill of Unmaking: "As a Major Action, sacrifice this trinket…" — no actionCost
    // field → the pre-existing Major economy applies untouched (regression guard).
    seed({ f1: mkComp('q-bear', compCard.name, { loadout: { weapon: null, gear: [mkItem('q-1', 'Quill of Unmaking', {}), null] } }),
           f2: mkConstruct('bw', 'Reinforced Gate', 2, { subtype: 'Fortification' }) });
    gs.getState().activateAbility('q-bear', 0);
    const ent = b().f1!;
    expect(ent.acts.major, 'Major consumed').toBe(true);
    expect(ent.exhausted, 'exhausted per the Major rule').toBe(true);
  });
});

describe('Animate Magic — type-changing is not "entering the encounter" (Rules Note 2026-07-15)', () => {
  const animate = (targetId: string) => {
    gs.setState({ pendingActionTarget: { source: 'action', sourceName: 'Test Animate', lp: 'p1',
      effects: [{ op: 'animate', atk: 2, hp: 2, target: 'magicalConstruct' }], eligibleIds: [targetId] } });
    gs.getState().resolveActionTarget(targetId);
  };

  it('a construct in the encounter since a PRIOR turn animates un-fresh and attacks this turn', () => {
    seed({ f1: mkConstruct('inc', 'Binding Sigil', 2, { subtype: 'Incantation', fresh: false }) });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { f1: mkComp('tgt', compCard.name, { hp: 9 }) } } } }));
    animate('inc');
    const m = b().f1!;
    expect(m.kind).toBe('companion');
    expect(m.fresh, 'entry time preserved through the conversion — the pinned mechanism').toBe(false);
    gs.setState({ pending: { action: 'attack', charId: 'inc' } });
    gs.getState().resolveAttack('tgt');
    expect(gs.getState().game.p2.board.f1?.hp, 'the Manifest attacked').toBeLessThan(9);
  });

  it('a construct played THIS turn animates fresh and is entry-gated like any new companion', () => {
    seed({ f1: mkConstruct('inc', 'Binding Sigil', 2, { subtype: 'Incantation', fresh: true }) });
    gs.setState(s => ({ game: { ...s.game, p2: { ...s.game.p2, board: { f1: mkComp('tgt', compCard.name, { hp: 9 }) } } } }));
    animate('inc');
    expect(b().f1?.fresh, 'same-turn entry survives the conversion').toBe(true);
    gs.getState().beginAttack('inc');
    expect(gs.getState().pending, 'attack declaration refused').toBeNull();
    expect(gs.getState().toasts.at(-1)?.msg).toContain('cannot attack until next turn');
  });

  it('mechanism end-to-end through the REAL reducers: placeCard stamps constructs fresh; readyPlayer clears it at the controller\'s next ready', () => {
    freshGame();
    const card = { id: 'hc-c', name: 'Test Sigil', level: 1, type: 'Construct', subtype: 'Incantation', rarity: 'Common',
      class1: 'Builder', class2: '', attack: 0, hp: 0, anchor: 3, actionSub: '', actionPM: '', itemKind: '',
      keywords: [], text: '', flavor: '' } as never;
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, hand: [card], deck: CATALOG.slice(30, 33),
        classZone: czCards.map((c, i) => mkCz(c, 'Builder', `cz-${i}`)), willpower: 5, board: {} },
    } }));
    gs.getState().beginPlay('hc-c');
    gs.getState().placeCard('f1');
    expect(b().f1?.fresh, 'construct stamped as entered-this-turn at placement').toBe(true);
    // p1 ends; p2 ends; p1's ready clears it.
    gs.getState().endTurn();
    gs.getState().endTurn();
    expect(b().f1?.fresh, "cleared at the controller's ready (entry turn over)").toBe(false);
  });
});

describe('PC turn-1 attack legality (verification — canon, no code change)', () => {
  // Canon (GRU §First-Turn, verbatim): "The first player may otherwise act normally
  // on Turn 1 — there is no restriction on Major Actions." (Flipped ruling
  // 2026-06-23, pinned in tier1_economy.) The PC is placed at setup, is not a
  // companion, and carries no entry gate — it may attack on turn 1 for BOTH
  // players, given a weapon and normal eligibility. ⚠ The 2026-07-15 bugfix brief
  // assumed a first-player turn-1 Major ban — that premise contradicts current
  // canon and the dated pin; SURFACED in the session report, not encoded.
  const pcAttack = (active: 'p1' | 'p2') => {
    freshGame();
    gs.setState(s => ({ game: { ...s.game, turn: 1, activePlayer: active,
      [active]: { ...s.game[active], board: { f1: mkPc('pc-a', { atk: 2 }) } },
      [active === 'p1' ? 'p2' : 'p1']: { ...s.game[active === 'p1' ? 'p2' : 'p1'], board: { f1: mkComp('tgt', compCard.name, { hp: 9 }) } },
    }, localPlayer: active }));
    gs.getState().beginAttack('pc-a');
    return gs.getState().pending?.action === 'attack';
  };
  it('SECOND player, their turn 1: the PC can declare an attack', () => {
    expect(pcAttack('p2'), 'no companion entry gate on the PC').toBe(true);
    gs.setState({ localPlayer: 'p1' });
  });
  it('FIRST player, turn 1: the PC can also declare an attack (canon: no Turn-1 Major restriction)', () => {
    expect(pcAttack('p1')).toBe(true);
  });
});
