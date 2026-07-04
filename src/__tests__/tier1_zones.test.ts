// Tier 1 (test_seed_plan.md) — zone-integrity regressions, items 3/4/5/11/12.
// Destruction paths, PC-HP mirroring, slot capacity, dead-pick identity, prompt resets.
// NOTE: poison resolution lives in PoisonModal (component, needs jsdom) — not covered here.
import { describe, it, expect } from 'vitest';
import { gs, deckCards, freshGame, mkComp, mkPc, mkConstruct, mkItem, mkCz } from './helpers';
import { canHoldItem } from '../store/keywords';
import { reactiveHold } from '../store/gameStore';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];
const constrCard = CATALOG.find(c => c.type === 'Construct')!;

describe('item 3: every destruction path lands in the Dead Zone', () => {
  it('Reckless recoil death buries the attacker + items and fires removal triggers (Memory Stone parity)', () => {
    freshGame();
    const att = mkComp('rk-1', compCard.name, {
      atk: 9, hp: 1, keywords: ['Reckless'],
      loadout: { weapon: null, gear: [mkItem('ms', 'Memory Stone'), null] },
    });
    const def = mkComp('rk-def', compCard2.name, { hp: 1 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att }, dead: [CATALOG[5]] },
      p2: { ...s.game.p2, board: { f1: def }, dead: [] },
    }, pending: { action: 'attack', charId: 'rk-1' } }));
    gs.getState().resolveAttack('rk-def');
    const g = gs.getState().game;
    const p1Dead = g.p1.dead.map(c => c.name);
    expect(g.p1.board.f1, 'attacker died to its own recoil').toBeFalsy();
    expect(p1Dead, 'attacker card buried').toContain(compCard.name);
    expect(p1Dead, 'its equipped Memory Stone buried').toContain('Memory Stone');
    expect(g.pendingDeadPick, 'Memory Stone onDestroy fired from the recoil path').not.toBeNull();
    expect(g.pendingDeadPick?.lp, 'pick belongs to the stone owner').toBe('p1');
  });

  it('Dismantle sacrifice buries the construct', () => {
    freshGame();
    const wall = mkConstruct('dm-1', constrCard.name, 2, { subtype: 'Fortification' });
    gs.setState(s => ({
      game: { ...s.game, p2: { ...s.game.p2, board: { f1: wall }, dead: [] } },
      pendingTrigger: { kind: 'dismantle', n: 3, sourceName: 'Saboteur', eligibleIds: ['dm-1'] },
    }));
    gs.getState().resolveTrigger('dm-1');
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'construct gone from board').toBeFalsy();
    expect(g.p2.dead.map(c => c.name), 'construct card in owner dead').toContain(constrCard.name);
  });

  it('moveAnchor draining the source sacrifices it into the Dead Zone', () => {
    freshGame();
    const src = mkConstruct('ma-src', constrCard.name, 2, { subtype: 'Trap' });
    const dst = mkConstruct('ma-dst', 'Other Wall', 3, { subtype: 'Fortification' });
    gs.setState(s => ({
      game: { ...s.game, p1: { ...s.game.p1, board: { f1: src, f2: dst }, dead: [] } },
      pendingActionTarget: { source: 'enter', sourceName: 'Field Test', lp: 'p1',
        effects: [{ op: 'moveAnchor', count: 2 }], eligibleIds: ['ma-src'], twoStep: 'moveAnchor' },
    }));
    gs.getState().resolveActionTarget('ma-src'); // step 1: source
    expect(gs.getState().pendingActionTarget?.firstId).toBe('ma-src');
    gs.getState().resolveActionTarget('ma-dst'); // step 2: destination
    const g = gs.getState().game;
    expect(g.p1.board.f2?.anchors, 'destination gained both anchors').toBe(5);
    expect(g.p1.board.f1, 'drained source gone').toBeFalsy();
    expect(g.p1.dead.map(c => c.name), 'drained source buried').toContain(constrCard.name);
  });

  it('a tucked Oathsworn card returns to hand while the entity is buried', () => {
    freshGame();
    const swornCard = CATALOG[7];
    const victim = mkComp('os-1', compCard.name, { hp: 1, sworn: swornCard });
    const att = mkComp('os-att', compCard2.name, { atk: 9 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: victim }, dead: [], hand: [] },
      p2: { ...s.game.p2, board: { f1: att } },
    }, pending: { action: 'attack', charId: 'os-att' } }));
    gs.getState().resolveAttack('os-1');
    const g = gs.getState().game;
    expect(g.p1.dead.map(c => c.name), 'entity card buried').toContain(compCard.name);
    expect(g.p1.hand.map(c => c.id), 'sworn card back to hand, not dead').toContain(swornCard.id);
    expect(g.p1.dead.map(c => c.id), 'sworn card NOT buried').not.toContain(swornCard.id);
  });

  it('a heavy item in both gear slots is buried once (deduped)', () => {
    freshGame();
    const heavy = mkItem('pl', 'Plate of the Standing Wall', { heavy: true });
    const victim = mkComp('hv-1', compCard.name, { hp: 1, loadout: { weapon: null, gear: [heavy, heavy] } });
    const att = mkComp('hv-att', compCard2.name, { atk: 9 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: victim }, dead: [] },
      p2: { ...s.game.p2, board: { f1: att } },
    }, pending: { action: 'attack', charId: 'hv-att' } }));
    gs.getState().resolveAttack('hv-1');
    const plates = gs.getState().game.p1.dead.filter(c => c.name === 'Plate of the Standing Wall');
    expect(plates, 'heavy item buried exactly once').toHaveLength(1);
  });
});

describe('item 4: PC HP single source of truth (payHP via Mara)', () => {
  function armMara() {
    freshGame();
    const mara = mkComp('mara-1', 'Mara, the Sworn Sword', { atk: 3, keywords: ['Zealous'] });
    const pc = mkPc('pc-m', { hp: 20 });
    const def = mkComp('mara-def', compCard.name, { hp: 5 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mara, b1: pc }, hp: 20 },
      p2: { ...s.game.p2, board: { f1: def } },
    }, pending: { action: 'attack', charId: 'mara-1' } }));
    gs.getState().resolveAttack('mara-def');
    expect(gs.getState().game.pendingAttackChoice, 'optional payHP choice armed').not.toBeNull();
  }

  it('accepting pays HP through setPcHp — entity and headline stay married', () => {
    armMara();
    gs.getState().resolveAttackChoice(true);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'PC entity paid 1').toBe(19);
    expect(g.p1.hp, 'headline mirrored').toBe(19);
    expect(g.p2.board.f1?.hp, 'boosted damage dealt (3+1)').toBe(1);
  });

  it('declining pays nothing and deals base damage', () => {
    armMara();
    gs.getState().resolveAttackChoice(false);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'PC untouched').toBe(20);
    expect(g.p1.hp, 'headline untouched').toBe(20);
    expect(g.p2.board.f1?.hp, 'base damage dealt').toBe(2);
  });
});

describe('item 4: poison routes through setPcHp (resolvePoison)', () => {
  function seedPoisonBoard(pcHp: number) {
    freshGame();
    const cleanser = mkComp('po-a', compCard.name, { poison: 2, statuses: ['Poisoned'], exhausted: true, tapped: 'major' });
    const holder = mkComp('po-b', compCard2.name, { poison: 3, statuses: ['Poisoned'], exhausted: true, tapped: 'major' });
    const pc = mkPc('po-pc', { hp: pcHp });
    gs.setState(s => ({ game: { ...s.game, pendingPoison: 'p1',
      p1: { ...s.game.p1, board: { f1: cleanser, f2: holder, b1: pc }, hp: pcHp },
    } }));
  }

  it('failed checks damage the PC per counter — entity and headline stay married', () => {
    seedPoisonBoard(20);
    gs.getState().resolvePoison('p1', [{ id: 'po-a', cleansed: true }, { id: 'po-b', cleansed: false }]);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'PC entity took 3 (the failed unit counters)').toBe(17);
    expect(g.p1.hp, 'headline mirrored').toBe(17);
    const cleansed = g.p1.board.f1!;
    expect(cleansed.poison, 'cleansed unit loses its counters').toBe(0);
    expect(cleansed.statuses, 'Poisoned status removed').not.toContain('Poisoned');
    expect(cleansed.exhausted, 'cleansed unit readies').toBe(false);
    const failed = g.p1.board.f2!;
    expect(failed.poison, 'failed unit keeps its counters').toBe(3);
    expect(failed.exhausted, 'failed unit stays exhausted').toBe(true);
    expect(g.pendingPoison, 'prompt cleared').toBeNull();
  });

  it('lethal poison ends the game with the winning SIDE', () => {
    seedPoisonBoard(2);
    gs.getState().resolvePoison('p1', [{ id: 'po-b', cleansed: false }]);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.hp, 'PC at 0').toBe(0);
    expect(g.p1.hp, 'headline at 0').toBe(0);
    expect(g.gameOver, 'gameOver = opposing SIDE, never a name').toBe('p2');
  });

  it('un-rolled units (Resolve later) are skipped entirely', () => {
    seedPoisonBoard(20);
    gs.getState().resolvePoison('p1', []);
    const g = gs.getState().game;
    expect(g.p1.hp, 'no damage').toBe(20);
    expect(g.p1.board.f1?.poison, 'counters untouched').toBe(2);
    expect(g.pendingPoison, 'prompt still cleared').toBeNull();
  });

  it('ready phase: a Poisoned unit does NOT auto-ready — the check decides (endTurn arms it)', () => {
    freshGame();
    // Non-catalog names: no card effects fire at start of turn. Level 1 vs willpower 3 — no fleeing.
    const poisoned = mkComp('rp-a', 'Venom Victim', { poison: 2, statuses: ['Poisoned'], exhausted: true, tapped: 'major' });
    const normal = mkComp('rp-b', 'Tired Grunt', { exhausted: true, tapped: 'major' });
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, board: { f1: poisoned, f2: normal } },
    } }));
    gs.getState().endTurn(); // p1 ends → p2's ready phase
    const g = gs.getState().game;
    expect(g.activePlayer).toBe('p2');
    expect(g.p2.board.f2?.exhausted, 'a plain unit readies as usual').toBe(false);
    expect(g.p2.board.f1?.exhausted, 'the Poisoned unit stays exhausted').toBe(true);
    expect(g.p2.board.f1?.tapped, 'still tapped').toBe('major');
    expect(g.p2.board.f1?.poison, 'counters intact for the check').toBe(2);
    expect(g.pendingPoison, 'check armed for the player whose turn begins').toBe('p2');
  });
});

describe('item 5: slot capacity', () => {
  const pikestaff = CATALOG.find(c => c.name === 'Pikestaff')!;

  it('canHoldItem enforces 1 weapon + 2 gear; heavy needs both slots', () => {
    const empty = mkComp('c1', compCard.name);
    const oneGear = mkComp('c2', compCard.name, { loadout: { weapon: null, gear: [mkItem('g1', 'G1'), null] } });
    const fullGear = mkComp('c3', compCard.name, { loadout: { weapon: null, gear: [mkItem('g1', 'G1'), mkItem('g2', 'G2')] } });
    const armed = mkComp('c4', compCard.name, { loadout: { weapon: mkItem('w', 'W'), gear: [null, null] } });
    expect(canHoldItem(empty, false, true), 'heavy fits two free slots').toBe(true);
    expect(canHoldItem(oneGear, false, true), 'heavy refused with one free slot').toBe(false);
    expect(canHoldItem(oneGear, false, false), 'normal gear fits the free slot').toBe(true);
    expect(canHoldItem(fullGear, false, false), 'full gear refuses more').toBe(false);
    expect(canHoldItem(armed, true, false), 'occupied weapon slot refuses a transfer').toBe(false);
  });

  it('equipping a weapon from hand swaps the old weapon back to hand', () => {
    freshGame();
    const cleaver = CATALOG.find(c => c.name === 'Ashforged Cleaver')!;
    const wearer = mkComp('sw-1', compCard.name, {
      loadout: { weapon: mkItem('old-w', 'Pikestaff'), gear: [null, null] },
    });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      willpower: 9, board: { f1: wearer }, hand: [cleaver],
    } } }));
    gs.getState().equipItem('sw-1', cleaver.id);
    const g = gs.getState().game;
    expect(g.p1.board.f1?.loadout?.weapon?.name, 'new weapon equipped').toBe('Ashforged Cleaver');
    expect(g.p1.hand.map(c => c.name), 'old weapon swapped to hand').toContain('Pikestaff');
  });

  it('Kit-Master transfers respect slot capacity (kitDests)', () => {
    freshGame();
    const src = mkComp('kit-src', compCard.name, { loadout: { weapon: mkItem('kw', pikestaff.name), gear: [null, null] } });
    const armedDest = mkComp('kit-full', compCard2.name, { loadout: { weapon: mkItem('dw', 'Ashforged Cleaver'), gear: [null, null] } });
    gs.setState(s => ({
      game: { ...s.game, p1: { ...s.game.p1, board: { f1: src, f2: armedDest } } },
      pendingKit: { sourceName: 'Kit Test', step: 'source', eligibleIds: ['kit-src'] },
    }));
    gs.getState().resolveKit('kit-src');
    expect(gs.getState().pendingKit, 'no capacity anywhere → transfer refused').toBeNull();
    expect(gs.getState().game.p1.board.f1?.loadout?.weapon?.name, 'weapon stayed put').toBe(pikestaff.name);

    // With an open-handed destination the same transfer works.
    const openDest = mkComp('kit-open', compCard2.name);
    gs.setState(s => ({
      game: { ...s.game, p1: { ...s.game.p1, board: { f1: src, f2: armedDest, b1: openDest } } },
      pendingKit: { sourceName: 'Kit Test', step: 'source', eligibleIds: ['kit-src'] },
    }));
    gs.getState().resolveKit('kit-src');
    const dests = gs.getState().pendingKit;
    expect(dests?.step, 'dest step armed').toBe('dest');
    expect(dests?.eligibleIds, 'full character excluded from dests').not.toContain('kit-full');
    expect(dests?.eligibleIds, 'open character offered').toContain('kit-open');
    gs.getState().resolveKit('kit-open');
    const g = gs.getState().game;
    expect(g.p1.board.b1?.loadout?.weapon?.name, 'weapon moved').toBe(pikestaff.name);
    expect(g.p1.board.f1?.loadout?.weapon, 'source emptied').toBeNull();
  });
});

describe('item 11: a card that left the Dead Zone is skipped', () => {
  it('second pick referencing the taken card skips and advances the queue', () => {
    freshGame();
    const only = CATALOG[3];
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, dead: [only], hand: [] },
      pendingDeadPick: { source: 'T1', lp: 'p1', options: [{ card: only, idx: 0 }], postEffects: [], optional: true },
      pendingDeadPickQueue: [{ source: 'T2', lp: 'p1', options: [{ card: only, idx: 0 }], postEffects: [], optional: true }],
    } }));
    gs.getState().resolveDeadPick(0); // takes the only copy
    expect(gs.getState().game.pendingDeadPick?.source, 'queue advanced').toBe('T2');
    gs.getState().resolveDeadPick(0); // the card is gone — must skip, not mis-grant
    const g = gs.getState().game;
    expect(g.pendingDeadPick, 'stale pick skipped').toBeNull();
    expect(g.p1.hand.filter(c => c.id === only.id), 'exactly one copy granted').toHaveLength(1);
    expect(g.p1.dead, 'dead stays empty').toHaveLength(0);
  });
});

describe('item 12: prompt-state reset on every game-lifecycle path', () => {
  const leakCard = CATALOG[9];
  const PROMPT_KEYS = ['pending', 'pendingPlay', 'pendingTrigger', 'pendingKit',
    'pendingActionTarget', 'pendingEquipPick', 'pileView'] as const;

  function setStale() {
    gs.setState({
      pending: { action: 'move', charId: 'stale' },
      pendingPlay: { cardId: 'stale', actorId: null },
      pendingTrigger: { stale: true } as never,
      pendingKit: { stale: true } as never,
      pendingActionTarget: { source: 'action', sourceName: 'Stale', lp: 'p1', effects: [], eligibleIds: [], card: leakCard },
      pendingEquipPick: { stale: true } as never,
      pileView: { player: 'p1', zone: 'dead' },
    });
  }
  const allCleared = () => PROMPT_KEYS.every(k => gs.getState()[k] === null);

  it('startMultiplayer clears all 7 local prompts', () => {
    freshGame(); setStale();
    gs.getState().startMultiplayer('host', 'TEST', 'p1', deckCards, deckCards);
    expect(allCleared()).toBe(true);
  });

  it('backToLobby clears all 7 local prompts', () => {
    freshGame(); setStale();
    gs.getState().backToLobby();
    expect(allCleared()).toBe(true);
  });

  it('resumeGame clears all 7 local prompts', () => {
    freshGame();
    gs.getState().saveGame();
    setStale();
    gs.getState().resumeGame();
    expect(allCleared()).toBe(true);
  });

  it('a stale pendingActionTarget cannot leak its card into the new game via cancel', () => {
    freshGame(); setStale();
    gs.getState().startSolo(deckCards, deckCards);
    expect(gs.getState().pendingActionTarget, 'prompt gone with the old game').toBeNull();
    // Compare the whole hand before/after — leakCard is part of the 50-card deck, so
    // "hand does not contain it" false-positives whenever the fresh shuffle happens
    // to deal it into the opening hand (a real 10% flake). Unchanged ids prove cancel
    // returned nothing, including the stale card.
    const handBefore = gs.getState().game.p1.hand.map(c => c.id);
    gs.getState().cancelActionTarget();
    expect(gs.getState().game.p1.hand.map(c => c.id), 'cancel returned nothing — hand unchanged').toEqual(handBefore);
  });
});

describe('Scavenger: on enter, optionally attach an Item from your Dead Zone', () => {
  const scavCard = (): Card => ({
    id: 'scav-1', name: 'Rust Scavenger', level: 1, type: 'Companion', subtype: '', rarity: '',
    class1: '', class2: '', attack: 1, hp: 3, anchor: null, actionSub: '', actionPM: '',
    itemKind: '', keywords: ['Scavenger'], text: '', flavor: '', cls: '',
  } as unknown as Card);
  const sword = CATALOG.find(c => c.name === 'Iron Sword')!;
  const mantle = CATALOG.find(c => c.name === "Storm-Caller's Mantle")!;
  const action = CATALOG.find(c => c.type === 'Action')!;

  /** Place a fresh Scavenger companion for p1 with the given Dead Zone. */
  function placeScavenger(dead: Card[]) {
    freshGame();
    const sc = scavCard();
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1,
      classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
      willpower: 3, hand: [sc], dead, board: {},
    } } }));
    gs.getState().beginPlay(sc.id);
    gs.getState().placeCard('b1');
  }

  it('arms an optional pick listing only Items, bound to the entering companion', () => {
    placeScavenger([action, sword, mantle]);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'companion placed').toBe('Rust Scavenger');
    const dp = g.pendingDeadPick;
    expect(dp, 'pick armed').not.toBeNull();
    expect(dp?.optional, '"you may" — skippable').toBe(true);
    expect(dp?.attachTo?.id, 'attach destination is the scavenger').toBe(g.p1.board.b1?.id);
    expect(dp?.options.map(o => o.card.name).sort(), 'Actions filtered out')
      .toEqual(["Iron Sword", "Storm-Caller's Mantle"]);
  });

  it('resolving attaches the item to the companion — not to hand', () => {
    placeScavenger([action, sword]);
    const idx = gs.getState().game.pendingDeadPick!.options.find(o => o.card.name === 'Iron Sword')!.idx;
    gs.getState().resolveDeadPick(idx);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.loadout?.weapon?.name, 'weapon equipped').toBe('Iron Sword');
    expect(g.p1.dead.map(c => c.name), 'item left the Dead Zone').not.toContain('Iron Sword');
    expect(g.p1.dead.map(c => c.name), 'other dead cards untouched').toContain(action.name);
    expect(g.p1.hand.map(c => c.name), 'did NOT go to hand').not.toContain('Iron Sword');
    expect(g.pendingDeadPick, 'prompt cleared').toBeNull();
  });

  it('an armor item lands in a gear slot with its Armor value parsed', () => {
    placeScavenger([mantle]);
    gs.getState().resolveDeadPick(0);
    const worn = gs.getState().game.p1.board.b1?.loadout?.gear[0];
    expect(worn?.name).toBe("Storm-Caller's Mantle");
    expect(worn?.armor, 'ARMOR 1 parsed for the damage pipeline').toBe(1);
  });

  it('Skip declines: the Dead Zone is untouched', () => {
    placeScavenger([sword]);
    gs.getState().cancelDeadPick();
    const g = gs.getState().game;
    expect(g.pendingDeadPick, 'prompt cleared').toBeNull();
    expect(g.p1.dead.map(c => c.name), 'item stays dead').toContain('Iron Sword');
    expect(g.p1.board.b1?.loadout?.weapon, 'nothing equipped').toBeNull();
  });

  it('no Items in the Dead Zone: enters without a prompt', () => {
    placeScavenger([action]);
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'companion still placed').toBe('Rust Scavenger');
    expect(g.pendingDeadPick, 'nothing to scavenge').toBeNull();
  });

  it('wearer gone by resolve time: the pick is skipped, the item stays dead', () => {
    placeScavenger([sword]);
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: {} } } }));
    gs.getState().resolveDeadPick(0);
    const g = gs.getState().game;
    expect(g.pendingDeadPick, 'stale pick skipped').toBeNull();
    expect(g.p1.dead.map(c => c.name), 'item preserved').toContain('Iron Sword');
  });
});

describe('Animate Magic X: on enter, an own Magical Construct becomes an X/X Manifest', () => {
  const binderCard = (): Card => ({
    id: 'am-1', name: 'Spirit Binder', level: 1, type: 'Companion', subtype: '', rarity: '',
    class1: '', class2: '', attack: 1, hp: 3, anchor: null, actionSub: '', actionPM: '',
    itemKind: '', keywords: ['Animate Magic 2'], text: '', flavor: '', cls: '',
  } as unknown as Card);

  /** Place the Animate Magic companion for p1 with the given boards. */
  function placeBinder(p1Board: Record<string, unknown>, p2Board: Record<string, unknown> = {}) {
    freshGame();
    const bc = binderCard();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1,
        classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
        willpower: 3, hand: [bc], board: p1Board },
      p2: { ...s.game.p2, board: p2Board },
    } }));
    gs.getState().beginPlay(bc.id);
    gs.getState().placeCard('b1');
  }

  it('arms an enter target over OWN Incantation constructs only', () => {
    placeBinder(
      { f1: mkConstruct('am-inc', 'Glimmer Ward', 2, { subtype: 'Incantation' }),
        f2: mkConstruct('am-trap', 'Spike Pit', 2, { subtype: 'Trap' }) },
      { f1: mkConstruct('am-opp', 'Enemy Sigil', 2, { subtype: 'Incantation' }) });
    const pa = gs.getState().pendingActionTarget;
    expect(pa, 'target pick armed').not.toBeNull();
    expect(pa?.source, 'an enter trigger, no card cost involved').toBe('enter');
    expect(pa?.eligibleIds, 'own Incantation eligible').toEqual(['am-inc']);
  });

  it('resolving animates: kind/stats/subtype flip, anchors + manifest status retained', () => {
    placeBinder({ f1: mkConstruct('am-inc', 'Glimmer Ward', 2, { subtype: 'Incantation' }) });
    gs.getState().resolveActionTarget('am-inc');
    const ent = gs.getState().game.p1.board.f1!;
    expect(ent.kind, 'construct became a companion').toBe('companion');
    expect(ent.subtype).toBe('Manifest');
    expect([ent.atk, ent.hp, ent.maxHp], 'X/X from the keyword parameter').toEqual([2, 2, 2]);
    expect(ent.statuses, 'manifest marker (sacrificed instead of bouncing)').toContain('manifest');
    expect(ent.fresh, 'summoning sickness as a new companion').toBe(true);
    expect(ent.anchors, 'anchor counters retained (inert)').toBe(2);
    expect(gs.getState().pendingActionTarget, 'prompt cleared').toBeNull();
  });

  it('no Magical Construct → enters without a prompt (fizzle)', () => {
    placeBinder({ f1: mkConstruct('am-trap', 'Spike Pit', 2, { subtype: 'Trap' }) });
    expect(gs.getState().game.p1.board.b1?.name, 'companion still placed').toBe('Spirit Binder');
    expect(gs.getState().pendingActionTarget, 'nothing to animate').toBeNull();
  });

  it('cancel fizzles the trigger without touching the placed companion', () => {
    placeBinder({ f1: mkConstruct('am-inc', 'Glimmer Ward', 2, { subtype: 'Incantation' }) });
    gs.getState().cancelActionTarget();
    const g = gs.getState().game;
    expect(gs.getState().pendingActionTarget, 'prompt cleared').toBeNull();
    expect(g.p1.board.f1?.kind, 'construct untouched').toBe('construct');
    expect(g.p1.board.b1?.name, 'companion stays placed').toBe('Spirit Binder');
    expect(g.p1.hand, 'nothing bounced to hand').toHaveLength(0);
  });
});

describe('Coercion: on enter, the OPPONENT discards a card or sacrifices a permanent', () => {
  const envoyCard = (): Card => ({
    id: 'co-1', name: 'Dread Envoy', level: 1, type: 'Companion', subtype: '', rarity: '',
    class1: '', class2: '', attack: 1, hp: 3, anchor: null, actionSub: '', actionPM: '',
    itemKind: '', keywords: ['Coercion'], text: '', flavor: '', cls: '',
  } as unknown as Card);

  /** Place the Coercion companion for p1 against the given p2 hand/board. */
  function placeEnvoy(p2Hand: Card[], p2Board: Record<string, unknown>) {
    freshGame();
    const ec = envoyCard();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1,
        classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
        willpower: 3, hand: [ec], board: {} },
      p2: { ...s.game.p2, hand: p2Hand, dead: [], board: p2Board },
    } }));
    gs.getState().beginPlay(ec.id);
    gs.getState().placeCard('b1');
  }

  it('arms the prompt for the VICTIM and holds everyone else', () => {
    placeEnvoy([CATALOG[10]], { f1: mkComp('co-c', compCard.name) });
    const g = gs.getState().game;
    expect(g.pendingCoercion, 'prompt armed').toEqual({ source: 'Dread Envoy', victim: 'p2' });
    expect(reactiveHold(g, 'p1'), 'the acting player is held').toMatch(/Coercion/);
    expect(reactiveHold(g, 'p2'), 'the victim is not held — they must act').toBeNull();
  });

  it('discard: the chosen card moves hand → Dead Zone and the prompt clears', () => {
    placeEnvoy([CATALOG[10]], {});
    gs.getState().resolveCoercionDiscard(CATALOG[10].id);
    const g = gs.getState().game;
    expect(g.p2.hand, 'hand emptied').toHaveLength(0);
    expect(g.p2.dead.map(c => c.name), 'discard lands in the Dead Zone').toContain(CATALOG[10].name);
    expect(g.pendingCoercion, 'prompt cleared').toBeNull();
  });

  it('sacrifice: the permanent is buried; the PC is never a legal choice', () => {
    placeEnvoy([], { f1: mkComp('co-c', compCard.name), b1: mkPc('co-pc') });
    gs.getState().resolveCoercionSacrifice('co-pc');
    expect(gs.getState().game.pendingCoercion, 'PC refused — prompt still armed').not.toBeNull();
    expect(gs.getState().game.p2.board.b1, 'PC untouched').toBeDefined();
    gs.getState().resolveCoercionSacrifice('co-c');
    const g = gs.getState().game;
    expect(g.p2.board.f1, 'companion sacrificed').toBeFalsy();
    expect(g.p2.dead.map(c => c.name), 'buried in the Dead Zone').toContain(compCard.name);
    expect(g.pendingCoercion, 'prompt cleared').toBeNull();
  });

  it("cannot sacrifice the coercer's own-side permanents (victim's board only)", () => {
    placeEnvoy([CATALOG[10]], {});
    const envoyId = gs.getState().game.p1.board.b1!.id;
    gs.getState().resolveCoercionSacrifice(envoyId);
    expect(gs.getState().game.p1.board.b1, 'the coercer survives').toBeDefined();
    expect(gs.getState().game.pendingCoercion, 'prompt still armed').not.toBeNull();
  });

  it('nothing to coerce (empty hand, only the PC) → fizzles without a prompt', () => {
    placeEnvoy([], { b1: mkPc('co-pc') });
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'coercer still placed').toBe('Dread Envoy');
    expect(g.pendingCoercion, 'no prompt').toBeNull();
  });
});

// Paranoia was first implemented here from an INVENTED definition (on-enter trigger,
// the victim resolving their OWN deck). Canon (docs/Master_Keyword_List.md) is the
// reverse: "Whenever an opponent plays a Companion, look at the top card of that
// player's deck. You may put that card on the top or bottom of their deck." — the
// CONTROLLER decides, over the PLACING player's deck. Full canonical coverage lives in
// keyword_paranoia.test.ts; this block pins the correction against regression.
describe('Paranoia: canonical direction (owner correction 2026-07-04)', () => {
  const whispererCard = (): Card => ({
    id: 'pn-1', name: 'Whisper of Doubt', level: 1, type: 'Companion', subtype: '', rarity: '',
    class1: '', class2: '', attack: 1, hp: 3, anchor: null, actionSub: '', actionPM: '',
    itemKind: '', keywords: ['Paranoia'], text: '', flavor: '', cls: '',
  } as unknown as Card);

  function placeWhisperer(p2Board: Record<string, ReturnType<typeof mkComp>>) {
    freshGame();
    const wc = whispererCard();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1,
        classZone: CATALOG.slice(20, 23).map((c, i) => mkCz(c, 'Warrior', `cz-${i}`)),
        willpower: 3, hand: [wc], board: {}, deck: CATALOG.slice(30, 35) },
      p2: { ...s.game.p2, board: p2Board, deck: CATALOG.slice(35, 40), hand: [] },
    } }));
    gs.getState().beginPlay(wc.id);
    gs.getState().placeCard('b1');
  }

  it('playing a companion that ITSELF has Paranoia triggers nothing — not an on-enter ability', () => {
    placeWhisperer({});
    const g = gs.getState().game;
    expect(g.p1.board.b1?.name, 'companion placed').toBe('Whisper of Doubt');
    expect(g.pendingPeek, 'no peek: the placed card\'s own Paranoia is dormant until the OPPONENT plays a companion').toBeNull();
    expect(reactiveHold(g, 'p1'), 'nobody is held').toBeNull();
  });

  it('an opposing Paranoia permanent peeks the PLACING player\'s deck — never its controller\'s own', () => {
    placeWhisperer({ f1: mkComp('opp-par', 'Duke\'s Watcher', { keywords: ['Paranoia'] }) });
    const g = gs.getState().game;
    const pk = g.pendingPeek!;
    expect(pk, 'peek armed for the controller').toBeTruthy();
    expect([pk.lp, pk.deckSide], 'p2 (controller) looks at p1\'s (placer\'s) deck').toEqual(['p2', 'p1']);
    expect(pk.cards.map(c => c.id), 'sees the placer\'s top card').toEqual([CATALOG[30].id]);
    expect(reactiveHold(g, 'p1'), 'the placer waits for the decision').toContain('Duke\'s Watcher');
  });
});
