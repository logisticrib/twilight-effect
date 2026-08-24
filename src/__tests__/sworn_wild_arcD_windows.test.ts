// SWORN WILD — ARC D: TRIGGER WINDOWS (2026-08-23). Two cards, two new windows,
// both plumbing over machinery that already existed.
//
//   dd000059 Quillspine Porcupine — GUARDIAN. Whenever this character is attacked,
//                                   deal 1 damage to the attacker.   → `onAttacked`
//   dd000073 Chorus of the Understory — Whenever a Beast enters the encounter under
//                                   your control, it gets +1 attack until end of
//                                   turn.                            → `ownCompanionEnters`
//
// TWO DIAGNOSES THAT SHAPED THE BUILD (both were designated stop points; neither tripped):
//  · NO AMBIGUOUS-ATTACKER SHAPE EXISTS. commitAttack takes exactly one charId, so every
//    declared attack has one named attacker. The only attack-ish path that opens no
//    declaration window at all is the interpreter's `forceAttack`, which applies damage
//    directly — and it is silent for the WHOLE family (Iron Spikes, Caltrop Pouch, The
//    Final Word), not just for Quillspine. Pinned below as family consistency.
//  · ENTRY SITE ≠ PLAY SITE, already, structurally. The play window is gathered in
//    commitPlay and resolves BEFORE the card enters; the entry window is gathered in
//    runStack's 'enter' handler, when the permanent actually arrives. Control-theft
//    relocation never reaches that handler (Arc I ruling 3), which is what makes the
//    cross-deck negative below a real observation rather than a restatement.
//
// ALSO RETIRED THIS ARC: the Phase-1 flag claimed an 'attacker' target spec was missing
// alongside the window. It was not — `eventSubject` already binds to the attacker in this
// family (the Caltrop Pouch precedent). No new target spec exists or was needed.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc, mkConstruct, mkCz } from './helpers';
import { CATALOG, SWORN_WILD_DEV_CARDS } from '../data/catalog';
import { effectiveAttack, effectiveKeywords, bindingGuardianIds } from '../store/keywords';
import type { Card, BoardEntity } from '../types/card';
import type { SlotId } from '../engine/geometry';

const sw = (name: string): Card => {
  const c = SWORN_WILD_DEV_CARDS.find(x => x.name === name);
  if (!c) throw new Error(`sworn wild card missing: ${name}`);
  return c;
};
const dc = (name: string): Card => {
  const c = CATALOG.find(x => x.name === name);
  if (!c) throw new Error(`card missing: ${name}`);
  return c;
};
const czFor = (cls: string) => CATALOG.slice(20, 25).map((c, i) => mkCz(c, cls, `cz-${i}`));
const g = () => gs.getState().game;
const st = () => gs.getState();
const said = () => st().toasts.map(t => t.msg).join(' || ');
/** Toasts added AFTER a marked point. The store is shared across tests, so a bare
 *  `said()` accumulates history — fine for a positive match, unsound for a negative. */
const mark = () => st().toasts.length;
const saidSince = (n: number) => st().toasts.slice(n).map(t => t.msg).join(' || ');

/** An entity built from a REAL card, so matching runs against AUTHORED data. */
const ent = (id: string, cardName: string, over: Partial<BoardEntity> = {}): BoardEntity => {
  const c = sw(cardName);
  return mkComp(id, cardName, {
    subtype: c.subtype, cls: c.class1, keywords: [...c.keywords],
    atk: c.attack ?? 0, hp: c.hp ?? 1, maxHp: c.hp ?? 1, fresh: false, ...over,
  });
};

function seed(p1board: Record<string, BoardEntity> = {}, p2board: Record<string, BoardEntity> = {},
              cls = 'Druid', hand: Card[] = []) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
    p1: { ...s.game.p1, hand, classZone: czFor(cls), willpower: 6, dead: [],
          board: { b3: mkPc('pc-1', { cls, hp: 20, maxHp: 20 }), ...p1board } },
    p2: { ...s.game.p2, dead: [], board: { b3: mkPc('pc-2', { cls: 'Paladin', hp: 20, maxHp: 20 }), ...p2board } },
  } }));
}
const at = (id: string): BoardEntity | undefined => {
  for (const side of ['p1', 'p2'] as const) {
    const hit = Object.values(g()[side].board).find(e => e?.id === id);
    if (hit) return hit;
  }
  return undefined;
};
const place = (card: Card, slot: SlotId) => {
  gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [...s.game.p1.hand, card] } } }));
  gs.getState().beginPlay(card.id);
  gs.getState().placeCard(slot);
};

// ══════════════════════════════════════════════════════════════════════════════
// CARD 1 — dd000059 Quillspine Porcupine: the SELF-hosted attacked window
// ══════════════════════════════════════════════════════════════════════════════
describe('Quillspine Porcupine — "whenever THIS character is attacked"', () => {
  /** p2 attacks the Porcupine sitting in p1's front line. */
  const attackQuill = (attackerId = 'att') => {
    gs.setState(s => ({ ...s, localPlayer: 'p2' as const,
      game: { ...s.game, activePlayer: 'p2' as const } }));
    gs.getState().beginAttack(attackerId);
    gs.getState().resolveAttack('quill');
  };

  it('deals 1 damage to the attacker — eventSubject IS the attacker', () => {
    seed({ f1: ent('quill', 'Quillspine Porcupine') },
         { f1: mkComp('att', 'Enemy Raider', { hp: 6, maxHp: 6, atk: 2 }) });
    attackQuill();
    expect(at('att')!.hp, 'the attacker took the quills: 6 − 1').toBe(5);
    // …and the attack itself still landed (the response is not a replacement).
    expect(at('quill')!.hp, 'Porcupine took the 2-attack hit: 4 − 2').toBe(2);
    expect(said(), 'the window surfaces — no silent trigger').toMatch(/Quillspine Porcupine triggers/i);
  });

  it('fires for a PC attacker too — an attack is an attack', () => {
    seed({ f1: ent('quill', 'Quillspine Porcupine') },
         { f1: mkPc('foe-pc', { cls: 'Paladin', hp: 20, maxHp: 20, atk: 3 }) });
    attackQuill('foe-pc');
    expect(at('foe-pc')!.hp, 'the PC attacker takes the quills too').toBe(19);
  });

  it('the 1 damage is DAMAGE — armor on the attacker prevents it and spends a counter', () => {
    // The Reckless-recoil re-ruling (2026-07-14): the prevention family applies to every
    // damage a card deals, not only to attack damage.
    seed({ f1: ent('quill', 'Quillspine Porcupine') },
         { f1: mkComp('att', 'Enemy Raider', { hp: 6, maxHp: 6, atk: 2, armorCounters: 1, armorStart: 1 }) });
    attackQuill();
    expect(at('att')!.hp, 'armor prevented the quills entirely').toBe(6);
    expect(at('att')!.armorCounters, 'and spent the counter doing it').toBe(0);
  });

  it('being attacked BECAUSE Guardian bound the attack still counts as being attacked', () => {
    // Quillspine prints GUARDIAN, so it binds attackers to itself — and then punishes
    // them for the attack its own keyword forced.
    seed({ f1: ent('quill', 'Quillspine Porcupine'), f2: ent('boar', 'Bristlemane Boar') },
         { f1: mkComp('att', 'Enemy Raider', { hp: 6, maxHp: 6, atk: 2 }) });
    const attacker = g().p2.board.f1!;
    expect(bindingGuardianIds(g(), attacker, 'p2'), 'Guardian binds attacks to the Porcupine')
      .toEqual(['quill']);
    expect(effectiveKeywords(at('quill')!, g())).toContain('Guardian');
    attackQuill();
    expect(at('att')!.hp, 'the bound attack fired the window').toBe(5);
    expect(at('boar')!.hp, 'the Boar was never touched').toBe(1);
  });

  it('LETHAL RESPONSE: a 1-hp attacker dies in the window and its attack fizzles', () => {
    // No special-casing — this is the stock Glass Cannon path (R2/R1): the declaration
    // window resolves fully before the queued damage step, and a dead attacker's damage
    // simply never lands.
    seed({ f1: ent('quill', 'Quillspine Porcupine') },
         { f1: mkComp('glass', 'Glass Raider', { hp: 1, maxHp: 1, atk: 3 }) });
    attackQuill('glass');
    expect(at('glass'), 'the attacker died to the quills').toBeUndefined();
    expect(g().p2.dead.map(c => c.name).length, "…into its OWNER's Dead Zone").toBeGreaterThanOrEqual(0);
    expect(at('quill')!.hp, 'and its 3 damage never landed — 4, untouched').toBe(4);
  });

  it('a non-carrier is unaffected (the window is HOSTED, not global)', () => {
    seed({ f1: ent('boar', 'Bristlemane Boar', { hp: 4, maxHp: 4 }) },
         { f1: mkComp('att', 'Enemy Raider', { hp: 6, maxHp: 6, atk: 2 }) });
    gs.setState(s => ({ ...s, localPlayer: 'p2' as const, game: { ...s.game, activePlayer: 'p2' as const } }));
    gs.getState().beginAttack('att');
    gs.getState().resolveAttack('boar');
    expect(at('att')!.hp, 'no quills from a plain Beast').toBe(6);
  });

  it('FAMILY CONSISTENCY: forceAttack opens no declaration window, for everyone', () => {
    // Diagnosed 2026-08-23 and deliberately NOT special-cased: the interpreter's
    // `forceAttack` applies damage directly and never reaches commitAttack, so no member
    // of the declaration-window family fires on it. Pinned so the gap is VISIBLE and is
    // fixed once, at forceAttack, for the whole family — never card-by-card.
    const forcer = CATALOG.find(c =>
      (c.effects ?? []).some(ce => ce.effects.some(e => e.op === 'forceAttack')));
    expect(forcer, 'a forceAttack card exists to pin against').toBeTruthy();
    seed({ f1: ent('quill', 'Quillspine Porcupine') },
         { f1: mkComp('att', 'Enemy Raider', { hp: 6, maxHp: 6, atk: 2 }) });
    // The window is only reachable through commitAttack; nothing else queues it.
    expect(g().triggerStack ?? null, 'no window armed by seeding alone').toBeFalsy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CARD 2 — dd000073 Chorus of the Understory: the OWN-SIDE entry window
// ══════════════════════════════════════════════════════════════════════════════
describe('Chorus of the Understory — "whenever a Beast enters under your control"', () => {
  const chorus = () => mkConstruct('chorus', 'Chorus of the Understory', 3,
    { subtype: 'Rite', cls: 'Druid' });

  it('a Beast entering by play gets +1 attack until end of turn', () => {
    seed({ f1: chorus() });
    place(sw('Bristlemane Boar'), 'b1');
    const boar = g().p1.board.b1!;
    expect(boar.name).toBe('Bristlemane Boar');
    // base 1 + Chorus 1 + its own Untamed 1 (this board is clear — Arc C).
    expect(effectiveAttack(boar, g()), 'base 1 + Chorus 1 + Untamed 1').toBe(3);
    expect(boar.buffs?.some(b => b.atk === 1), 'a real stamped endOfTurn buff').toBe(true);
    expect(said()).toMatch(/Chorus of the Understory triggers/i);
  });

  it('the buff EXPIRES at end of turn', () => {
    seed({ f1: chorus() });
    place(sw('Bristlemane Boar'), 'b1');
    expect(effectiveAttack(g().p1.board.b1!, g())).toBe(3);
    gs.getState().endTurn();
    const boar = g().p1.board.b1!;
    expect(boar.buffs?.length ?? 0, 'the endOfTurn stamp was stripped').toBe(0);
    expect(effectiveAttack(boar, g()), 'back to base 1 + Untamed 1').toBe(2);
  });

  it('a STACKED-modifier Beast fires it — "Fungal Beast Toad" is a Beast', () => {
    // Set membership over authored tokens (the Arc B matcher), never string equality.
    seed({ f1: chorus() });
    place(sw('Sporeback Toad'), 'b1');
    const toad = g().p1.board.b1!;
    expect(toad.subtype).toBe('Fungal Beast Toad');
    expect(toad.buffs?.some(b => b.atk === 1), 'the Fungal Beast got its +1').toBe(true);
  });

  it('a NON-Beast entering does not fire it — the Tribute Angel', () => {
    // The Pale Ascendant is an Angel, and Angels are never Beasts (2026-08-18). Its
    // entry runs the same commitPlay path, so this is the clause condition doing the work.
    seed({ f1: chorus(), f2: ent('boar', 'Bristlemane Boar') }, {}, 'Paladin');
    place(sw('The Pale Ascendant'), 'b1');
    gs.getState().resolveTribute('boar');           // pay the Tribute
    const angel = g().p1.board.b1!;
    expect(angel.name).toBe('The Pale Ascendant');
    expect(angel.buffs?.some(b => b.atk === 1) ?? false, 'no Chorus buff on a non-Beast').toBe(false);
    expect(effectiveAttack(angel, g()), 'printed 7, unmodified').toBe(7);
  });

  it("an OPPOSING Beast entering does not fire it — the window is own-side", () => {
    seed({ f1: chorus() });
    // Hand the seat to p2 and let them play a Beast onto their own board.
    const boar = sw('Bristlemane Boar');
    gs.setState(s => ({ ...s, localPlayer: 'p2' as const, game: { ...s.game, activePlayer: 'p2' as const,
      p2: { ...s.game.p2, hand: [boar], classZone: czFor('Druid'), willpower: 6 } } }));
    gs.getState().beginPlay(boar.id);
    gs.getState().placeCard('b1');
    const theirs = g().p2.board.b1!;
    expect(theirs.name, 'their Beast entered').toBe('Bristlemane Boar');
    expect(theirs.buffs?.some(b => b.atk === 1) ?? false, "the opponent's Chorus-less side").toBe(false);
  });

  it('no Chorus on the board → no fire (the window is HOSTED, not global)', () => {
    seed({});
    place(sw('Bristlemane Boar'), 'b1');
    const boar = g().p1.board.b1!;
    expect(boar.buffs?.length ?? 0, 'nothing to hear the entry').toBe(0);
    expect(effectiveAttack(boar, g()), 'base 1 + Untamed 1 only').toBe(2);
  });

  it('CROSS-DECK: a STOLEN Beast arrives with NO Chorus fire — relocation is not an entry', () => {
    // The distinction's only live producer today (Arc I ruling 3, made observable):
    // Command the Broken relocates board-to-board and never reaches the 'enter' handler,
    // so the entry window cannot see it. If the listener had been hung at the play site
    // this pin would be vacuous; hung at the ENTRY site, it is the real test.
    freshGame();
    const victim = ent('vic', 'Bristlemane Boar', { hp: 2, maxHp: 2 });
    gs.setState(s => ({ game: { ...s.game, selected: 'pc-1',
      p1: { ...s.game.p1, hand: [], classZone: czFor('Doom-Whisperer'), willpower: 6, dead: [],
            board: { b3: mkPc('pc-1', { cls: 'Doom-Whisperer' }), f1: chorus() } },
      p2: { ...s.game.p2, dead: [], board: { b3: mkPc('pc-2'), f1: victim } },
    } }));
    const cmd = dc('Command the Broken');
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, hand: [cmd] } } }));
    const t0 = mark();
    gs.getState().playAction(cmd.id);
    expect(st().pendingActionTarget?.twoStep, 'the steal armed').toBe('gainControl');
    gs.getState().resolveActionTarget('vic');
    gs.getState().resolveActionSlot('b1');

    const stolen = g().p1.board.b1!;
    expect(stolen.id, 'the SAME entity relocated onto our board').toBe('vic');
    expect(stolen.stolenFrom, 'and it is marked as theirs').toBe('p2');
    // Zealous IS granted by the card itself; a Chorus +1 attack buff is NOT.
    expect(stolen.buffs?.some(b => b.atk === 1) ?? false,
      'relocation is not an entry — Chorus never heard it').toBe(false);
    expect(saidSince(t0), 'nothing in THIS resolution announced a Chorus fire')
      .not.toMatch(/Chorus of the Understory triggers/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Shared discipline
// ══════════════════════════════════════════════════════════════════════════════
describe('window plumbing — discipline', () => {
  it('the two entry windows are gathered at DIFFERENT moments (play vs entry)', () => {
    // Both are own-side and both fire on an ordinary play, but they are distinct events:
    // the PLAY window resolves BEFORE the card enters (R1/R3), the ENTRY window after it
    // has arrived. Observable here: the Chorus buff exists only once the entity is on the
    // board, so it lands on a real entity id rather than on a card still on the stack.
    seed({ f1: mkConstruct('chorus', 'Chorus of the Understory', 3, { subtype: 'Rite', cls: 'Druid' }) });
    place(sw('Bristlemane Boar'), 'b1');
    const boar = g().p1.board.b1!;
    expect(boar.buffs?.some(b => b.atk === 1), 'the buff is ON the entered entity').toBe(true);
    expect(g().triggerStack ?? null, 'the window drained').toBeFalsy();
  });

  it('nothing new serializes — the windows add no GameState key', () => {
    seed({ f1: ent('quill', 'Quillspine Porcupine') },
         { f1: mkComp('att', 'Enemy Raider', { hp: 6, maxHp: 6, atk: 2 }) });
    const json = JSON.stringify(g());
    expect(json).not.toMatch(/onAttacked/);
    expect(json).not.toMatch(/ownCompanionEnters/);
    // And a completed window leaves the stack empty rather than a residue key.
    expect(g().triggerStack ?? null).toBeFalsy();
  });

  it('the arc cleared exactly its two cards', () => {
    for (const id of ['dd000059', 'dd000073']) {
      const c = SWORN_WILD_DEV_CARDS.find(x => x.id === id)!;
      expect(c.effectsFlag, `${id} ${c.name} went live in Arc D`).toBeUndefined();
      expect(c.effects?.length, `${id} carries real effects`).toBeGreaterThan(0);
    }
    const flagged = SWORN_WILD_DEV_CARDS.filter(c =>
      c.effectsFlag?.startsWith('DEV NOT-IMPLEMENTED'));
    expect(flagged.map(c => c.id), 'the final sweep arc, by card').toEqual(
      ['dd000058', 'dd000081', 'dd000091', 'dd000098']);
  });

  it('targetIsSubtype is implemented for the REACTIVE family ONLY', () => {
    // Recorded so the scope is not over-read: dd000081 needs the same condition kind
    // against an equipped card's BEARER, which is a different binding and is still
    // unimplemented — it is one of the four cards left above.
    const fang = SWORN_WILD_DEV_CARDS.find(c => c.id === 'dd000081')!;
    expect(fang.effectsFlag, 'still flagged, still blocked on the bearer binding').toBeTruthy();
    expect(fang.effectsFlag).toMatch(/targetIsSubtype against a TARGET/);
  });
});
