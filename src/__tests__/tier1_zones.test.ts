// Tier 1 (test_seed_plan.md) — zone-integrity regressions, items 3/4/5/11/12.
// Destruction paths, PC-HP mirroring, slot capacity, dead-pick identity, prompt resets.
// NOTE: poison resolution lives in PoisonModal (component, needs jsdom) — not covered here.
import { describe, it, expect } from 'vitest';
import { gs, deckCards, freshGame, mkComp, mkPc, mkConstruct, mkItem } from './helpers';
import { canHoldItem } from '../store/keywords';
import { CATALOG } from '../data/catalog';

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
    const handBefore = gs.getState().game.p1.hand.length;
    gs.getState().cancelActionTarget();
    const g = gs.getState().game;
    expect(g.p1.hand.length, 'cancel returned nothing').toBe(handBefore);
    expect(g.p1.hand.map(c => c.id), 'the old game card did not appear').not.toContain(leakCard.id);
  });
});
