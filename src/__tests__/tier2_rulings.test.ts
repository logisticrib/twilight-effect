// Tier 2 (test_seed_plan.md) — locked rulings as tests, so they can't be silently
// re-litigated. Items 1/2/3/4/6; item 5 (class-bonus snapshot) is the component test
// in tier2_classbonus.test.tsx.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { effectiveMaxHp, canPlayActionCard } from '../store/keywords';
import type { Effect } from '../types/effects';
import type { Card } from '../types/card';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

const mkCard = (over: Record<string, unknown>): Card => ({
  id: 'synth', name: 'Synthetic', level: 1, type: 'Action', subtype: '', rarity: '',
  class1: '', class2: '', attack: 0, hp: 0, anchor: null, actionSub: '', actionPM: '',
  itemKind: '', keywords: [], text: '', flavor: '', cls: '',
  ...over,
} as unknown as Card);

/** Every effect op on a card, recursing into dieCheck/modal branches. */
function allOps(effects: Effect[]): Effect[] {
  const out: Effect[] = [];
  for (const e of effects) {
    out.push(e);
    if (e.op === 'dieCheck') out.push(...allOps(e.onPass), ...allOps(e.onFail));
    if (e.op === 'modal') for (const o of e.options) out.push(...allOps(o.effects));
  }
  return out;
}

describe('ruling 1: NO HP buffs exist (Card_Design_Parameters §8 — max HP fixed, only healing)', () => {
  it('no card in either deck authors a buff with stat "hp"', () => {
    for (const card of CATALOG) {
      const ops = (card.effects ?? []).flatMap(c => allOps(c.effects));
      const hpBuffs = ops.filter(e => e.op === 'buff' && e.stat === 'hp');
      expect(hpBuffs, `${card.name} must not grant +HP`).toHaveLength(0);
    }
  });

  it('effectiveMaxHp == printed max for every card in both decks (the +HP machinery stays dormant)', () => {
    freshGame();
    const base = gs.getState().game;
    for (const card of CATALOG) {
      const probe = mkComp('probe', compCard.name, { hp: 5, maxHp: 5 });
      if (card.type === 'Companion' || card.type === 'Construct') {
        const ent = card.type === 'Companion'
          ? mkComp('cand', card.name, { hp: card.hp ?? 0, maxHp: card.hp ?? 0, keywords: card.keywords, subtype: card.subtype, cls: card.class1 })
          : mkConstruct('cand', card.name, card.anchor ?? 1, { hp: card.hp ?? 0, maxHp: card.hp ?? 0, keywords: card.keywords, subtype: card.subtype });
        const game = { ...base, p1: { ...base.p1, board: { f1: ent, f2: probe } } };
        expect(effectiveMaxHp(probe, game), `${card.name} projects +HP onto the party`).toBe(5);
        // effectiveMaxHp floors at 1 by design (0-HP constructs) — the ruling bans ADDITIONS.
        expect(effectiveMaxHp(ent, game), `${card.name} inflates its own max HP`).toBe(Math.max(1, card.hp ?? 0));
      } else if (card.type === 'Item') {
        const wearer = mkComp('wear', compCard.name, { hp: 5, maxHp: 5, loadout: { weapon: null, gear: [mkItem('it', card.name), null] } });
        const game = { ...base, p1: { ...base.p1, board: { f1: wearer } } };
        expect(effectiveMaxHp(wearer, game), `${card.name} grants +HP when equipped`).toBe(5);
      }
    }
  });
});

describe("ruling 2: self-damage targets — acting character vs PC", () => {
  it("Conflagration's target:'self' hits the ACTING character (sourceId), not the PC", () => {
    freshGame();
    const conflagration = CATALOG.find(c => c.name === 'Conflagration')!;
    const caster = mkComp('cf-cast', compCard.name, { hp: 5, maxHp: 5 });
    const pc = mkPc('cf-pc', { hp: 20 });
    const enemy = mkComp('cf-enemy', compCard2.name, { hp: 9, maxHp: 9 });
    gs.setState(s => ({ game: { ...s.game, selected: 'cf-cast',
      p1: { ...s.game.p1, willpower: 5, hp: 20,
        classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Sorcerer', `cz-${i}`)),
        hand: [conflagration], board: { f1: caster, b1: pc } },
      p2: { ...s.game.p2, board: { f1: enemy } },
    } }));
    gs.getState().playAction(conflagration.id);
    expect(gs.getState().pendingActionTarget, 'target step armed').not.toBeNull();
    gs.getState().resolveActionTarget('cf-enemy');
    const g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'target took 5').toBe(4);
    expect(g.p1.board.f1?.hp, 'the ACTING character took the 1 self-damage').toBe(4);
    expect(g.p1.board.b1?.hp, 'the PC is untouched').toBe(20);
    expect(g.p1.hp, 'headline untouched').toBe(20);
  });

  it("Wrath of the Untamed Sky's damageSelfPC hits the PC (half the shared die), not the caster", () => {
    freshGame();
    const wrath = CATALOG.find(c => c.name === 'Wrath of the Untamed Sky')!;
    const caster = mkComp('wr-cast', compCard.name, { hp: 5, maxHp: 5 });
    const pc = mkPc('wr-pc', { hp: 20 });
    const enemy = mkComp('wr-enemy', compCard2.name, { hp: 9, maxHp: 9 });
    gs.setState(s => ({ game: { ...s.game, selected: 'wr-cast',
      p1: { ...s.game.p1, willpower: 5, hp: 20,
        classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Sorcerer', `cz-${i}`)),
        hand: [wrath], board: { f1: caster, b1: pc } },
      p2: { ...s.game.p2, board: { f1: enemy } },
    } }));
    gs.getState().playAction(wrath.id); // board AoE + self-PC — resolves immediately
    const g = gs.getState().game;
    const die = 9 - (g.p2.board.f1?.hp ?? 0); // enemies take the full die
    expect(die >= 1 && die <= 6, `die in range (rolled ${die})`).toBe(true);
    expect(g.p1.board.f1?.hp, 'the caster is untouched').toBe(5);
    expect(g.p1.board.b1?.hp, 'the PC took half the SAME die, rounded down').toBe(20 - Math.floor(die / 2));
    expect(g.p1.hp, 'headline married').toBe(20 - Math.floor(die / 2));
  });
});

describe('ruling 3: Translocation Circle is a sanctioned §11 exception', () => {
  it('bounces OWN companions only, once per turn, and re-arms after the ready phase', () => {
    freshGame();
    const circle = mkConstruct('tc-2', 'Translocation Circle', 3, { subtype: 'Incantation' });
    const own1 = mkComp('tc-own1', compCard.name);
    const own2 = mkComp('tc-own2', compCard2.name);
    const foe = mkComp('tc-foe', compCard.name);
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: circle, b1: own1, b2: own2 }, hand: [] },
      p2: { ...s.game.p2, board: { f1: foe } },
    } }));

    gs.getState().activateAbility('tc-2', 0);
    const pat = gs.getState().pendingActionTarget;
    expect(pat, 'bounce target step armed').not.toBeNull();
    expect(pat?.eligibleIds, 'own companion eligible').toContain('tc-own1');
    expect(pat?.eligibleIds, 'ENEMY companion NOT eligible').not.toContain('tc-foe');
    gs.getState().resolveActionTarget('tc-own1');
    let g = gs.getState().game;
    expect(g.p1.board.b1, 'companion left the board').toBeFalsy();
    expect(g.p1.hand.map(c => c.name), 'companion bounced to hand').toContain(compCard.name);
    expect(g.p1.board.f1?.statuses.some(st => st.startsWith('ability-used:')), 'oncePerTurn marker set').toBe(true);

    gs.getState().activateAbility('tc-2', 0); // same turn → refused
    expect(gs.getState().pendingActionTarget, 'second same-turn activation refused').toBeNull();

    gs.getState().endTurn(); // p1 → p2
    gs.getState().endTurn(); // p2 → p1: p1's ready clears the marker (and decays the circle 3→2)
    g = gs.getState().game;
    expect(g.p1.board.f1?.statuses.some(st => st.startsWith('ability-used:')), 'marker cleared on ready').toBe(false);
    expect(g.p1.board.f1?.anchors, 'circle decayed normally meanwhile').toBe(2);
    // endTurn lands on the Draw stop; actions are reducer-gated to the Action Phase
    // (2026-07-08), so fast-forward past Draw/CZ as a real player would.
    gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' as const } }));
    gs.getState().activateAbility('tc-2', 0);
    expect(gs.getState().pendingActionTarget, 'usable again next turn').not.toBeNull();
  });
});

describe('ruling 4: no Initiative, no Exile (data contract)', () => {
  it('neither word appears in any card keywords, text, or effects', () => {
    for (const card of CATALOG) {
      const hay = [card.keywords.join(' '), card.text, JSON.stringify(card.effects ?? [])].join(' ');
      expect(/initiative|exile/i.test(hay), `${card.name} references Initiative/Exile`).toBe(false);
    }
  });
});

describe('ruling 6: companion entry restriction', () => {
  const withAnchorStone = { weapon: null, gear: [mkItem('as2', 'Anchor Stone'), null] };

  it('a fresh companion can neither attack, play a Major, nor activate an ability', () => {
    freshGame();
    const entering = mkComp('en-1', compCard.name, { fresh: true, loadout: withAnchorStone });
    const wall = mkConstruct('en-w', 'Test Wall', 3, { subtype: 'Fortification' });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: entering, f2: wall } } }, pending: null }));
    gs.getState().beginAttack('en-1');
    expect(gs.getState().pending, 'attack blocked on entry turn').toBeNull();
    expect(canPlayActionCard(gs.getState().game, 'p1', entering, mkCard({ actionPM: 'Major' })).reason,
      'Major action blocked').toMatch(/entry turn/);
    gs.getState().activateAbility('en-1', 0);
    expect(gs.getState().game.p1.board.f1?.acts.major, 'ability blocked (Major untouched)').toBe(false);
    expect(gs.getState().pendingActionTarget, 'no ability targeting armed').toBeNull();
  });

  it('the restriction survives the opponent turn and auto-passes at the controller next turn start', () => {
    freshGame();
    const entering = mkComp('en-2', compCard.name, { fresh: true });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: entering } } }, pending: null }));
    gs.getState().endTurn(); // p1 → p2: opponent's turn starts, restriction holds
    expect(gs.getState().game.p1.board.f1?.fresh, 'still fresh through the opponent turn').toBe(true);
    gs.getState().endTurn(); // p2 → p1: controller's ready lifts it
    expect(gs.getState().game.p1.board.f1?.fresh, 'auto-passed at own turn start').toBe(false);
    // Fast-forward past the Draw/CZ stops — actions are reducer-gated to the Action Phase (2026-07-08).
    gs.setState(s => ({ game: { ...s.game, currentPhase: 'action' as const } }));
    gs.getState().beginAttack('en-2');
    expect(gs.getState().pending?.action, 'attack now allowed').toBe('attack');
  });

  it('Zealous exempts ATTACKS only — Major actions and abilities stay gated', () => {
    freshGame();
    const zealous = mkComp('en-3', compCard.name, { fresh: true, keywords: ['Zealous'], loadout: withAnchorStone });
    const wall = mkConstruct('en-w2', 'Test Wall', 3, { subtype: 'Fortification' });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: zealous, f2: wall } } }, pending: null }));
    gs.getState().beginAttack('en-3');
    expect(gs.getState().pending?.action, 'Zealous: entry-turn attack allowed').toBe('attack');
    expect(canPlayActionCard(gs.getState().game, 'p1', zealous, mkCard({ actionPM: 'Major' })).reason,
      'Major action still blocked').toMatch(/entry turn/);
    gs.getState().activateAbility('en-3', 0);
    expect(gs.getState().game.p1.board.f1?.acts.major, 'ability still blocked').toBe(false);
  });
});
