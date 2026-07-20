// Attack-target gate unification (bugfix, owner-reported 2026-07-20). The board
// UI carried its own copies of attack eligibility + target legality from the
// initial commit; the store's rules evolved (Watchtower 2026-07-08, Guardian
// legality 2026-07-15, Ranged excision 2026-07-16) and the copies did not — on
// the reported board (own back-line companion + own Watchtower vs opposing PC in
// the front line) the targeting prompt armed with ZERO highlights, because the
// UI's eligibility check never learned of the Watchtower aura. NEVER a July
// regression: the Watchtower highlight path never worked in its life.
// Fix: engine/stats.ts is the single gate (canAttackFromPosition /
// isLegalAttackTarget / bindingGuardianIds / legalAttackTargetIds); beginAttack,
// resolveAttack, LoadoutPanel and CommandZone all consult it. legalAttackTargetIds
// IS the highlight set, so these pins cover the UI computation directly.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct } from './helpers';
import { legalAttackTargetIds } from '../engine/stats';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

const lastToast = () => gs.getState().toasts.at(-1)?.msg ?? '';
const p2ent = (slot: string) => (gs.getState().game.p2.board as Record<string, { hp: number; anchors?: number } | undefined>)[slot];
const targetSet = (attackerId: string) => {
  const g = gs.getState().game;
  const att = Object.values(g.p1.board).find(e => e?.id === attackerId)!;
  return [...legalAttackTargetIds(g, att, 'p1')].sort();
};

function seed(p1Board: Record<string, ReturnType<typeof mkComp>>, p2Board: Record<string, ReturnType<typeof mkComp>>) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, board: p1Board },
    p2: { ...s.game.p2, board: p2Board },
  }, pending: null }));
}
const armPending = (charId: string) => gs.setState({ pending: { action: 'attack', charId } });

describe('single attack-target gate (2026-07-20): PC offered, both attacker paths', () => {
  it('pin 1a — opposing PC in an occupied front line is the candidate set and attackable, FRONT-line attacker', () => {
    seed({ f1: mkComp('att-1', compCard.name, { atk: 2 }) },
         { f1: mkPc('foe-pc'), b1: mkComp('tb-1', compCard2.name, { hp: 5 }), b2: mkComp('qm-1', compCard2.name, { hp: 5 }) });
    expect(targetSet('att-1'), 'the PC is the ONLY legal target').toEqual(['foe-pc']);
    armPending('att-1');
    gs.getState().resolveAttack('foe-pc');
    expect(p2ent('f1')?.hp, 'PC takes the hit').toBe(18);
  });

  it('pin 1b — the REPORTED board: Watchtower-granted back-line attacker arms, the PC highlights and is attackable', () => {
    // Mirrors the owner's board: own companion in the back line + own Watchtower;
    // opposing PC front, two companions back, a construct back.
    seed({ b1: mkComp('scholar', compCard.name, { atk: 2 }), f3: mkConstruct('wt-1', 'Watchtower', 3, { subtype: 'Fortification' }) },
         { f1: mkPc('foe-pc'), b1: mkComp('tb-1', compCard2.name, { hp: 5 }), b2: mkComp('qm-1', compCard2.name, { hp: 5 }),
           b3: mkConstruct('spark', 'Test Spark', 2, { subtype: 'Incantation' }) });
    gs.getState().beginAttack('scholar');
    expect(gs.getState().pending?.action, 'Watchtower eligibility arms the prompt').toBe('attack');
    expect(targetSet('scholar'), 'the PC is offered — back-liners and the construct are not').toEqual(['foe-pc']);
    gs.getState().resolveAttack('foe-pc');
    expect(p2ent('f1')?.hp, 'PC attackable via the Watchtower path').toBe(18);
  });

  it('pin 2 — back-line companions behind an occupied front line stay unoffered AND refused (post-excision regression)', () => {
    seed({ b1: mkComp('scholar', compCard.name, { atk: 2 }), f3: mkConstruct('wt-1', 'Watchtower', 3, { subtype: 'Fortification' }) },
         { f1: mkPc('foe-pc'), b1: mkComp('tb-1', compCard2.name, { hp: 5 }) });
    expect(targetSet('scholar')).toEqual(['foe-pc']);
    armPending('scholar');
    gs.getState().resolveAttack('tb-1');
    expect(p2ent('b1')?.hp, 'protected back-liner untouched').toBe(5);
    expect(lastToast()).toContain('Must target the Front Line first');
  });

  it('pin 3 — EMPTY opposing front line: back-line characters (companion AND back-placed PC) become legal (branch previously unpinned)', () => {
    seed({ f1: mkComp('att-1', compCard.name, { atk: 2 }) },
         { b1: mkComp('tb-1', compCard2.name, { hp: 5 }), b3: mkPc('foe-pc') });
    expect(targetSet('att-1'), 'both back-line characters legal').toEqual(['foe-pc', 'tb-1']);
    armPending('att-1');
    gs.getState().resolveAttack('tb-1');
    expect(p2ent('b1')?.hp, 'back-line companion attackable with the front empty').toBe(3);
  });

  it('pin 4 — constructs NEVER appear in candidate sets, do not occupy the front line, and a direct attack on one is refused (canon: "Constructs cannot be attacked and do not satisfy or interfere with Front Line priority")', () => {
    seed({ f1: mkComp('att-1', compCard.name, { atk: 2 }) },
         { f1: mkConstruct('wall-1', 'Test Wall', 3, { subtype: 'Fortification' }), b1: mkComp('tb-1', compCard2.name, { hp: 5 }), b3: mkPc('foe-pc') });
    expect(targetSet('att-1'), 'front construct neither offered nor front-line-occupying').toEqual(['foe-pc', 'tb-1']);
    armPending('att-1');
    gs.getState().resolveAttack('wall-1');
    expect(lastToast(), 'loud refusal — the reducer agrees with the UI (adjacent hole closed 2026-07-20)').toContain('Constructs cannot be attacked');
    expect(p2ent('f1')?.hp, 'construct hp untouched').toBe(3);
    expect(p2ent('f1')?.anchors, 'anchors untouched').toBe(3);
  });

  it('pin 5 — Guardian interop: a legal Guardian is the whole candidate set; an unreachable back Guardian binds nothing', () => {
    // (a) legal front Guardian binds — the set is exactly the Guardian.
    seed({ f1: mkComp('att-1', compCard.name, { atk: 2 }) },
         { f1: mkComp('gd-1', compCard2.name, { hp: 5, keywords: ['Guardian'] }), f2: mkComp('grunt', compCard2.name, { hp: 5 }), b3: mkPc('foe-pc') });
    expect(targetSet('att-1'), 'binding Guardian is the only candidate').toEqual(['gd-1']);
    armPending('att-1');
    gs.getState().resolveAttack('grunt');
    expect(p2ent('f2')?.hp, 'non-Guardian refused').toBe(5);
    expect(lastToast()).toContain('Guardian must be attacked first');
    // (b) unreachable back Guardian behind an occupied front binds nobody (05b31af).
    seed({ f1: mkComp('att-2', compCard.name, { atk: 2 }) },
         { f1: mkComp('grunt', compCard2.name, { hp: 5 }), b1: mkComp('gd-2', compCard2.name, { hp: 5, keywords: ['Guardian'] }), b3: mkPc('foe-pc') });
    expect(targetSet('att-2'), 'unreachable Guardian contributes nothing — front grunt is the set').toEqual(['grunt']);
    armPending('att-2');
    gs.getState().resolveAttack('grunt');
    expect(p2ent('f1')?.hp, 'front grunt attackable').toBe(3);
  });

  it('pin 6 — NO dead prompts: when every legal target is ward-protected, beginAttack refuses with a reason instead of arming', () => {
    // Opposing Long-Quiet Wall in the FRONT wards the BACK line; the only opposing
    // character is the back-placed PC → zero legal targets for a companion attacker.
    seed({ f1: mkComp('att-1', compCard.name, { atk: 2 }) },
         { f2: mkConstruct('wall-1', 'The Long-Quiet Wall', 5, { subtype: 'Fortification' }), b3: mkPc('foe-pc') });
    expect(targetSet('att-1'), 'ward empties the candidate set').toEqual([]);
    gs.getState().beginAttack('att-1');
    expect(gs.getState().pending, 'prompt never arms').toBeNull();
    expect(lastToast()).toContain('No legal attack target');
  });
});
