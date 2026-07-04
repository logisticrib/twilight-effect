// Tier 1 (test_seed_plan.md) — armor-picker + keyword-suppression regressions, items 6/10.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkConstruct, mkItem, mkCz, mkPc } from './helpers';
import { effectiveKeywords, isImmuneToSplash } from '../store/keywords';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];
const armorA = () => mkItem('ar-a', 'Guard Plate A', { armor: 3, counters: 0 });
const armorB = () => mkItem('ar-b', 'Guard Plate B', { armor: 2, counters: 0 });

describe('item 6: armor per-hit picker', () => {
  it('a single armor piece auto-applies (no prompt) and sacrifices at X counters', () => {
    freshGame();
    const oneHit = mkItem('ar-1', 'Thin Shield', { armor: 1, counters: 0 });
    const att = mkComp('sa-att', compCard.name, { atk: 4 });
    const def = mkComp('sa-def', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [oneHit, null] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'sa-att' } }));
    gs.getState().resolveAttack('sa-def');
    const g = gs.getState().game;
    expect(g.pendingArmor, 'no prompt for a single piece').toBeNull();
    expect(g.p2.board.f1?.hp, 'damage fully prevented').toBe(5);
    expect(g.p2.board.f1?.loadout?.gear[0], 'armor-1 piece sacrificed after its block').toBeNull();
  });

  it('2+ pieces pause combat for the DEFENDER; resolveArmor resumes it', () => {
    freshGame();
    const att = mkComp('pa-att', compCard.name, { atk: 4 });
    const def = mkComp('pa-def', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [armorA(), armorB()] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'pa-att' } }));
    gs.getState().resolveAttack('pa-def');
    let g = gs.getState().game;
    expect(g.pendingArmor, 'combat paused on the choice').not.toBeNull();
    expect(g.pendingArmor?.defender, 'the DEFENDER is prompted').toBe('p2');
    expect(g.pendingArmor?.candidates.map(c => c.id).sort(), 'both pieces offered').toEqual(['ar-a', 'ar-b']);
    expect(g.p2.board.f1?.hp, 'no damage applied while paused').toBe(5);

    gs.getState().resolveArmor('ar-b');
    g = gs.getState().game;
    expect(g.pendingArmor, 'combat resumed and finished').toBeNull();
    expect(g.p2.board.f1?.hp, 'hit fully prevented').toBe(5);
    expect(g.p2.board.f1?.loadout?.gear[1]?.counters, 'the CHOSEN piece took the counter').toBe(1);
    expect(g.p2.board.f1?.loadout?.gear[0]?.counters, 'the other piece untouched').toBe(0);
    expect(g.p1.board.f1?.exhausted, 'attack finalized (attacker exhausted)').toBe(true);
  });

  it('Cleave chains one pause per multi-armor defender', () => {
    freshGame();
    const att = mkComp('cl-att', compCard.name, { atk: 4, keywords: ['Cleave'] });
    const def1 = mkComp('cl-d1', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [armorA(), armorB()] } });
    const def2 = mkComp('cl-d2', compCard.name, { hp: 5, loadout: { weapon: null, gear: [mkItem('ar-c', 'Guard C', { armor: 3 }), mkItem('ar-d', 'Guard D', { armor: 3 })] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def1, f2: def2 } },
    }, pending: { action: 'attack', charId: 'cl-att' } }));
    gs.getState().resolveAttack('cl-d1');
    expect(gs.getState().game.pendingArmor?.entityId, 'first pause: primary target').toBe('cl-d1');
    gs.getState().resolveArmor('ar-a');
    expect(gs.getState().game.pendingArmor?.entityId, 'second pause: the Cleave splash target').toBe('cl-d2');
    gs.getState().resolveArmor('ar-d');
    const g = gs.getState().game;
    expect(g.pendingArmor, 'chain drained').toBeNull();
    expect(g.p2.board.f1?.hp, 'both hits prevented').toBe(5);
    expect(g.p2.board.f2?.hp, 'both hits prevented').toBe(5);
  });

  it('non-combat damage defers the choice via armorSink and arms it after resolution', () => {
    freshGame();
    const sparkflare = CATALOG.find(c => c.name === 'Sparkflare')!;
    const caster = mkComp('nc-cast', compCard.name);
    const def = mkComp('nc-def', compCard2.name, { hp: 5, loadout: { weapon: null, gear: [armorA(), armorB()] } });
    gs.setState(s => ({ game: { ...s.game, selected: 'nc-cast',
      p1: { ...s.game.p1, willpower: 9,
        classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, sparkflare.class1, `cz-${i}`)),
        hand: [sparkflare], board: { f1: caster } },
      p2: { ...s.game.p2, board: { f1: def } },
    } }));
    gs.getState().playAction(sparkflare.id);
    expect(gs.getState().pendingActionTarget, 'damage action armed').not.toBeNull();
    gs.getState().resolveActionTarget('nc-def');
    let g = gs.getState().game;
    expect(g.pendingArmor, 'deferred choice armed AFTER the effect resolved').not.toBeNull();
    expect(g.pendingArmor?.ctx, 'non-combat: no attack context to resume').toBeUndefined();
    expect(g.p2.board.f1?.hp, 'damage prevented').toBe(5);
    gs.getState().resolveArmor('ar-a');
    g = gs.getState().game;
    expect(g.pendingArmor, 'choice resolved').toBeNull();
    expect(g.p2.board.f1?.loadout?.gear[0]?.counters, 'chosen piece took the counter').toBe(1);
  });

  it('Reckless self-damage bypasses armor (current ruling)', () => {
    freshGame();
    const att = mkComp('rb-att', compCard.name, {
      atk: 9, hp: 5, keywords: ['Reckless'],
      loadout: { weapon: null, gear: [armorA(), null] },
    });
    const def = mkComp('rb-def', compCard2.name, { hp: 1 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'rb-att' } }));
    gs.getState().resolveAttack('rb-def');
    const g = gs.getState().game;
    expect(g.p1.board.f1?.hp, 'recoil applied despite armor').toBe(4);
    expect(g.p1.board.f1?.loadout?.gear[0]?.counters, 'armor NOT consumed by the recoil').toBe(0);
  });
});

describe('item 10: keywords resolve through effectiveKeywords', () => {
  const kitted = () => mkComp('kw-1', compCard.name, {
    fresh: true,
    keywords: ['Zealous'],
    buffs: [{ grant: ['Acrobatics'], until: 'endOfTurn' }],
    loadout: { weapon: mkItem('pk', 'Pikestaff'), gear: [null, null] },
  });

  it('printed + buff-granted + item-granted keywords all function', () => {
    freshGame();
    const ent = kitted();
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: ent } } }, pending: null }));
    const g = gs.getState().game;
    const kws = effectiveKeywords(g.p1.board.f1!, g);
    expect(kws, 'printed Zealous').toContain('Zealous');
    expect(kws, 'buff-granted Acrobatics').toContain('Acrobatics');
    expect(kws, 'item-granted Ranged (Pikestaff)').toContain('Ranged');
    gs.getState().beginAttack('kw-1');
    expect(gs.getState().pending?.action, 'Zealous lifts the entry-turn attack gate').toBe('attack');
  });

  it('Binding Sigil suppression disables printed AND granted copies', () => {
    freshGame();
    const ent = kitted();
    const sigil = mkConstruct('sig-1', 'Binding Sigil', 2, { subtype: 'Incantation' });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: ent } },
      p2: { ...s.game.p2, board: { b1: sigil } },
    }, pending: null }));
    const g = gs.getState().game;
    const kws = effectiveKeywords(g.p1.board.f1!, g);
    expect(kws, 'printed Zealous suppressed').not.toContain('Zealous');
    expect(kws, 'buff-granted Acrobatics suppressed').not.toContain('Acrobatics');
    expect(kws, 'item-granted Ranged suppressed').not.toContain('Ranged');
    expect(isImmuneToSplash(g.p1.board.f1!, g), 'suppressed Acrobatics no longer dodges Cleave').toBe(false);
    gs.getState().beginAttack('kw-1');
    expect(gs.getState().pending, 'suppressed Zealous no longer lifts the entry-turn gate').toBeNull();
  });

  it('the suppression is positional — a back-line companion keeps its keywords', () => {
    freshGame();
    const ent = { ...kitted(), id: 'kw-2' };
    const sigil = mkConstruct('sig-2', 'Binding Sigil', 2, { subtype: 'Incantation' });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { b1: ent } },
      p2: { ...s.game.p2, board: { b2: sigil } },
    } }));
    const g = gs.getState().game;
    expect(effectiveKeywords(g.p1.board.b1!, g), 'back line unaffected (front-line ward)').toContain('Zealous');
  });
});

describe("Bane: \"X's Bane\" deals double damage to companions of the named subtype or class", () => {
  /** Board with one p1 attacker vs the given p2 defenders, attack armed. */
  const arm = (att: ReturnType<typeof mkComp>, defs: Record<string, ReturnType<typeof mkComp>>) =>
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: defs },
    }, pending: { action: 'attack', charId: att.id } }));

  it('doubles against a companion of the named SUBTYPE', () => {
    freshGame();
    arm(mkComp('bn-att', compCard.name, { atk: 3, keywords: ["Goblin's Bane"] }),
        { f1: mkComp('bn-gob', compCard2.name, { hp: 8, subtype: 'Goblin' }) });
    gs.getState().resolveAttack('bn-gob');
    expect(gs.getState().game.p2.board.f1?.hp, '3 attack lands as 6').toBe(2);
  });

  it('doubles against a companion of the named CLASS', () => {
    freshGame();
    arm(mkComp('bn-att', compCard.name, { atk: 3, keywords: ["Warrior's Bane"] }),
        { f1: mkComp('bn-war', compCard2.name, { hp: 8, cls: 'Warrior' }) });
    gs.getState().resolveAttack('bn-war');
    expect(gs.getState().game.p2.board.f1?.hp, '3 attack lands as 6').toBe(2);
  });

  it('a companion outside the named prey takes normal damage', () => {
    freshGame();
    arm(mkComp('bn-att', compCard.name, { atk: 3, keywords: ["Goblin's Bane"] }),
        { f1: mkComp('bn-elf', compCard2.name, { hp: 8, subtype: 'Elf', cls: 'Rogue' }) });
    gs.getState().resolveAttack('bn-elf');
    expect(gs.getState().game.p2.board.f1?.hp, 'no double vs a non-named companion').toBe(5);
  });

  it('never doubles against the PC — companions only, even on a class match', () => {
    freshGame();
    arm(mkComp('bn-att', compCard.name, { atk: 3, keywords: ["Warrior's Bane"] }),
        { f1: mkPc('bn-pc', { cls: 'Warrior' }) });
    gs.getState().resolveAttack('bn-pc');
    expect(gs.getState().game.p2.board.f1?.hp, 'PC takes the plain 3').toBe(17);
  });

  it('Cleave checks each hit separately: only the named prey on the line takes double', () => {
    freshGame();
    arm(mkComp('bn-att', compCard.name, { atk: 3, keywords: ['Cleave', "Goblin's Bane"] }),
        { f1: mkComp('bn-d1', compCard2.name, { hp: 8, subtype: 'Elf' }),
          f2: mkComp('bn-d2', compCard.name,  { hp: 8, subtype: 'Goblin' }) });
    gs.getState().resolveAttack('bn-d1');
    const g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'primary (Elf) takes the plain 3').toBe(5);
    expect(g.p2.board.f2?.hp, 'splash Goblin takes the doubled 6').toBe(2);
  });
});
