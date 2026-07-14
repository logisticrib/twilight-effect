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

  it('Reckless recoil routes through the damage chokepoint — armor absorbs it (RE-RULED 2026-07-14; supersedes the 2026-07-03 bypass reading)', () => {
    // Canon RECKLESS "deals 1 damage to itself" is damage the character takes, so
    // the prevention family applies (owner ruling 2026-07-14, damage-prevention arc).
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
    expect(g.p1.board.f1?.hp, 'recoil fully prevented by armor').toBe(5);
    expect(g.p1.board.f1?.loadout?.gear[0]?.counters, 'the armor piece took the counter').toBe(1);
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

describe('Poison: a character damaged by a Poison attacker is exhausted + countered', () => {
  const arm = (att: ReturnType<typeof mkComp>, defs: Record<string, ReturnType<typeof mkComp>>) =>
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: defs },
    }, pending: { action: 'attack', charId: att.id } }));
  const venom = () => mkComp('po-att', compCard.name, { atk: 2, keywords: ['Poison'] });

  it('a damaging hit adds a counter, marks Poisoned, and exhausts the survivor', () => {
    freshGame();
    arm(venom(), { f1: mkComp('po-def', compCard2.name, { hp: 8 }) });
    gs.getState().resolveAttack('po-def');
    const def = gs.getState().game.p2.board.f1!;
    expect(def.hp, 'the damage itself still lands').toBe(6);
    expect(def.poison, 'one counter for the hit').toBe(1);
    expect(def.statuses, 'marked for the ready-phase check').toContain('Poisoned');
    expect(def.exhausted, 'exhausted by the poison').toBe(true);
    expect(def.tapped, 'fully tapped').toBe('major');
  });

  it('counters stack per damaging hit; the Poisoned status is not duplicated', () => {
    freshGame();
    arm(venom(), { f1: mkComp('po-def', compCard2.name, { hp: 8, poison: 1, statuses: ['Poisoned'] }) });
    gs.getState().resolveAttack('po-def');
    const def = gs.getState().game.p2.board.f1!;
    expect(def.poison, 'second hit stacks').toBe(2);
    expect(def.statuses.filter(st => st === 'Poisoned'), 'status stays single').toHaveLength(1);
  });

  it('an armor-blocked hit deals no damage and does not poison', () => {
    freshGame();
    arm(venom(), { f1: mkComp('po-def', compCard2.name,
      { hp: 8, loadout: { weapon: null, gear: [mkItem('po-ar', 'Guard Plate', { armor: 3 }), null] } }) });
    gs.getState().resolveAttack('po-def');
    const def = gs.getState().game.p2.board.f1!;
    expect(def.hp, 'hit fully prevented').toBe(8);
    expect(def.poison ?? 0, 'no counter on a blocked hit').toBe(0);
    expect(def.exhausted, 'not exhausted').toBe(false);
  });

  it('constructs are not characters — damaged, never poisoned', () => {
    freshGame();
    arm(venom(), { f1: mkConstruct('po-con', 'Watch Post', 2) });
    gs.getState().resolveAttack('po-con');
    const con = gs.getState().game.p2.board.f1!;
    expect(con.hp, 'construct takes the damage').toBe(1);
    expect(con.poison ?? 0, 'no counter').toBe(0);
  });

  it('the PC can be poisoned', () => {
    freshGame();
    arm(venom(), { f1: mkPc('po-pc') });
    gs.getState().resolveAttack('po-pc');
    const pc = gs.getState().game.p2.board.f1!;
    expect(pc.hp).toBe(18);
    expect(pc.poison, 'PC holds the counter').toBe(1);
    expect(pc.exhausted, 'PC exhausted').toBe(true);
  });

  it('a killed character is destroyed, not poisoned posthumously', () => {
    freshGame();
    arm(venom(), { f1: mkComp('po-dead', compCard2.name, { hp: 2 }) });
    gs.getState().resolveAttack('po-dead');
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'defender destroyed').toBeUndefined();
    expect(g.p2.dead.length, 'buried in the Dead Zone').toBeGreaterThan(0);
  });

  it('Cleave: every damaged character on the line is poisoned', () => {
    freshGame();
    arm(mkComp('po-att', compCard.name, { atk: 2, keywords: ['Cleave', 'Poison'] }),
        { f1: mkComp('po-d1', compCard2.name, { hp: 8 }),
          f2: mkComp('po-d2', compCard.name,  { hp: 8 }) });
    gs.getState().resolveAttack('po-d1');
    const g = gs.getState().game;
    expect(g.p2.board.f1?.poison, 'primary poisoned').toBe(1);
    expect(g.p2.board.f2?.poison, 'splash target poisoned too').toBe(1);
  });
});

// ─── Owner bug batch 2026-07-08 — combat rulings ────────────────────────────────
describe('batch 2026-07-08: Cleave splash hits characters only', () => {
  // Canon: "deals damage equal to its attack to each CHARACTER on the same line as the
  // target" (§Evergreen Keywords) + "Constructs cannot be attacked" (§Targeting Rules).
  // The splash used to push ANY line-mate — a construct on the target's line was hit
  // (and could be destroyed outright, bypassing its Anchor counters).
  it('a construct on the target\'s line is untouched; a PC on the line IS splashed', () => {
    freshGame();
    const att = mkComp('cs-att', compCard.name, { atk: 4, keywords: ['Cleave'] });
    const def = mkComp('cs-def', compCard2.name, { hp: 9 });
    const wall = mkConstruct('cs-wall', 'Test Wall', 3, { subtype: 'Fortification' });
    const pc = mkPc('cs-pc', { hp: 20 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def, f2: wall, f3: pc } },
    }, pending: { action: 'attack', charId: 'cs-att' } }));
    gs.getState().resolveAttack('cs-def');
    const g = gs.getState().game;
    expect(g.p2.board.f1?.hp, 'primary target hit').toBe(5);
    expect(g.p2.board.f2, 'construct NOT splashed (still on board)').toBeTruthy();
    expect(g.p2.board.f2?.hp, 'construct hp untouched').toBe(3);
    expect(g.p2.board.f2?.anchors, 'anchors untouched').toBe(3);
    expect(g.p2.board.f3?.hp, 'the PC is a character — splashed').toBe(16);
  });
});

describe('batch 2026-07-08: attacking exhausts the attacker — PC included (ruled)', () => {
  // Rules Note 2026-07-08 (§Exhaustion): an attack exhausts the attacking character,
  // the Player Character included — no second attack or activated ability until ready.
  it('PC attacks → exhausted; second attack and activated abilities refused until ready', () => {
    freshGame();
    const pc = mkPc('px-pc', { loadout: { weapon: mkItem('px-w', 'Iron Sword'), gear: [mkItem('px-as', 'Anchor Stone'), null] } });
    const wall = mkConstruct('px-wall', 'Test Wall', 2, { subtype: 'Fortification' });
    const def = mkComp('px-def', compCard2.name, { hp: 9 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: pc, f2: wall } },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'px-pc' } }));
    gs.getState().resolveAttack('px-def');
    let g = gs.getState().game;
    expect(g.p1.board.f1?.exhausted, 'PC exhausted by its attack').toBe(true);
    expect(g.p1.board.f1?.tapped, 'rotated 90° (Major)').toBe('major');

    gs.getState().beginAttack('px-pc');
    expect(gs.getState().pending, 'second attack refused').toBeNull();
    gs.getState().activateAbility('px-pc', 0); // Anchor Stone's activated ability
    expect(gs.getState().pendingActionTarget, 'activated ability refused while exhausted').toBeNull();

    // Readying at the start of the controller's next turn lifts it.
    gs.getState().endTurn(); // p1 → p2
    gs.getState().endTurn(); // p2 → p1: p1 readies
    g = gs.getState().game;
    expect(g.p1.board.f1?.exhausted, 'PC readied at own turn start').toBe(false);
    expect(g.p1.board.f1?.tapped).toBe('none');
  });
});

describe('batch 2026-07-08: Hit & Run per canon', () => {
  // Canon: "After this character attacks, it may take an extra move action." Optional,
  // and an explicit exception to movement-must-be-first (Rules Note 2026-07-08) —
  // exhaustion blocks attacks/abilities, not movement.
  it('grants an optional extra move after the attack (despite Major used + exhausted)', () => {
    freshGame();
    const att = mkComp('hr-att', compCard.name, { atk: 2, keywords: ['Hit & Run'] });
    const def = mkComp('hr-def', compCard2.name, { hp: 9 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'hr-att' } }));
    gs.getState().resolveAttack('hr-def');
    let g = gs.getState().game;
    expect(g.p1.board.f1?.statuses, 'bonus-move marker granted').toContain('hit-run-ready');
    expect(g.p1.board.f1?.exhausted, 'attacker exhausted as usual').toBe(true);

    gs.getState().beginMove('hr-att');
    gs.getState().resolveMove('f2');
    g = gs.getState().game;
    expect(g.p1.board.f2?.id, 'extra move taken AFTER the attack').toBe('hr-att');
    expect(g.p1.board.f2?.statuses, 'marker consumed by the move').not.toContain('hit-run-ready');
  });

  it('without Hit & Run, moving after an attack stays illegal (the exception is the keyword)', () => {
    freshGame();
    const att = mkComp('nk-att', compCard.name, { atk: 2 });
    const def = mkComp('nk-def', compCard2.name, { hp: 9 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'nk-att' } }));
    gs.getState().resolveAttack('nk-def');
    gs.getState().beginMove('nk-att');
    gs.getState().resolveMove('f2');
    expect(gs.getState().game.p1.board.f1?.id, 'move refused — still in place').toBe('nk-att');
  });

  it('declining is legal — the unused marker expires at ready with no penalty', () => {
    freshGame();
    const att = mkComp('dc-att', compCard.name, { atk: 2, keywords: ['Hit & Run'] });
    const def = mkComp('dc-def', compCard2.name, { hp: 9 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'dc-att' } }));
    gs.getState().resolveAttack('dc-def');
    expect(gs.getState().game.p1.board.f1?.statuses).toContain('hit-run-ready');
    // Decline: never move. Two endTurns bring p1's ready phase around.
    gs.getState().endTurn();
    gs.getState().endTurn();
    const ent = gs.getState().game.p1.board.f1;
    expect(ent, 'companion unharmed by declining').toBeTruthy();
    expect(ent?.statuses, 'unused marker dropped at ready').not.toContain('hit-run-ready');
    expect(ent?.exhausted, 'readied normally').toBe(false);
  });
});
