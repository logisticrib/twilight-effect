// Batch-2 gameplay-correctness suite — converted verbatim from the 2026-07-02
// verification scratchpad (verify_batch2.mjs, 23 assertions preserved). Drives the
// real store reducers; every case here broke in a playtest or the 2026-07-02 audit.
import { describe, it, expect } from 'vitest';
import { gs, deckCards, freshGame, mkComp, mkPc, mkConstruct, mkItem } from './helpers';
import { actionTypeOf, isImmuneToSplash } from '../store/keywords';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const itemCard = CATALOG.find(c => c.type === 'Item' && !c.text?.toLowerCase().includes('heavy'))!;
const constrCard = CATALOG.find(c => c.type === 'Construct')!;
const patientStudy = CATALOG.find(c => c.name === 'Patient Study')!;

describe('action economy: actionTypeOf reads actionPM', () => {
  it('Patient Study charges a Minor (was overcharged as Major)', () => {
    expect(actionTypeOf(patientStudy)).toBe('Minor');
  });
  it('an authored Major stays Major', () => {
    const majorAction = CATALOG.find(c => c.type === 'Action' && c.actionPM === 'Major')!;
    expect(actionTypeOf(majorAction)).toBe('Major');
  });
});

describe('destruction paths land in the Dead Zone', () => {
  it('combat kill buries the card and its equipped items', () => {
    freshGame();
    const att = mkComp('att-1', compCard.name, { atk: 99 });
    const def = mkComp('def-1', compCard.name, { hp: 1, loadout: { weapon: null, gear: [mkItem(itemCard.id, itemCard.name), null] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { f1: def }, dead: [] },
    }, pending: { action: 'attack', charId: 'att-1' } }));
    gs.getState().resolveAttack('def-1');
    const g = gs.getState().game;
    const deadNames = g.p2.dead.map(c => c.name);
    expect(deadNames, 'victim card in Dead Zone').toContain(compCard.name);
    expect(deadNames, 'equipped item in Dead Zone').toContain(itemCard.name);
    expect(g.p2.board.f1, 'board slot empty').toBeFalsy();
  });

  it('readyPlayer: anchor decay + flee reach the Dead Zone (owner ruling 2026-07-03)', () => {
    freshGame();
    const decaying = mkConstruct('con-1', constrCard.name, 1);
    const flee = mkComp('flee-1', compCard.name, { level: 9 });
    gs.setState(s => ({ game: { ...s.game,
      p2: { ...s.game.p2, board: { f1: decaying, f2: flee }, dead: [], classZone: [], willpower: 0 },
    } }));
    gs.getState().endTurn(); // p1 ends → readyPlayer(p2)
    const g = gs.getState().game;
    const deadNames = g.p2.dead.map(c => c.name);
    expect(deadNames, 'decayed construct in Dead Zone').toContain(constrCard.name);
    expect(deadNames, 'fled companion in Dead Zone').toContain(compCard.name);
    expect(!g.p2.board.f1 && !g.p2.board.f2, 'both gone from board').toBe(true);
  });
});

describe('dead-pick queue resolves by card identity, not stale index', () => {
  it('Cleave-style chained picks both hand over the intended card', () => {
    freshGame();
    const [cardA, cardB] = [CATALOG[0], CATALOG[1]];
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, dead: [cardA, cardB], hand: [] },
      pendingDeadPick: { source: 'T1', lp: 'p1' as const, options: [{ card: cardA, idx: 0 }], postEffects: [], optional: true },
      pendingDeadPickQueue: [{ source: 'T2', lp: 'p1' as const, options: [{ card: cardB, idx: 1 }], postEffects: [], optional: true }],
    } }));
    gs.getState().resolveDeadPick(0); // takes A, dead shrinks to [B]
    gs.getState().resolveDeadPick(1); // stale idx 1 → must still find B
    const g = gs.getState().game;
    const handNames = g.p1.hand.map(c => c.name);
    expect(handNames, 'both intended cards returned').toContain(cardA.name);
    expect(handNames, 'both intended cards returned').toContain(cardB.name);
    expect(g.p1.dead.length, 'dead emptied').toBe(0);
  });
});

describe('PC HP single source of truth', () => {
  it('PC kill: gameOver stores the winning SIDE and HP stays married at 0', () => {
    freshGame();
    const att = mkComp('att-2', compCard.name, { atk: 99 });
    const pc = mkPc('pc-2', { hp: 1 });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: att } },
      p2: { ...s.game.p2, board: { b1: pc }, hp: 1 },
    }, pending: { action: 'attack', charId: 'att-2' } }));
    gs.getState().resolveAttack('pc-2');
    const g = gs.getState().game;
    expect(g.gameOver, 'gameOver = attacking SIDE, never a display name').toBe('p1');
    expect(g.p2.hp, 'headline HP at 0').toBe(0);
    expect(g.p2.board.b1?.hp, 'PC entity HP at 0').toBe(0);
  });

  it('adjustHp on the PC mirrors the headline and ends the game via setPcHp', () => {
    freshGame();
    const pc = mkPc('pc-3', { hp: 1 });
    gs.setState(s => ({ game: { ...s.game, gameOver: null, p1: { ...s.game.p1, board: { b1: pc }, hp: 1 } } }));
    gs.getState().adjustHp('pc-3', -1);
    const g = gs.getState().game;
    expect(g.gameOver, 'PC at 0 → opponent wins').toBe('p2');
    expect(g.p1.hp, 'headline mirrored').toBe(0);
  });
});

describe('equip slot capacity', () => {
  it('gear overflow no-ops (no silent destruction), free slot still equips', () => {
    freshGame();
    const gearCard = CATALOG.find(c => c.type === 'Item'
      && !c.itemKind?.toLowerCase().includes('weapon')
      && !c.subtype?.toLowerCase().match(/weapon|sword|bow|staff|dagger|axe|mace|wand/)
      && !c.text?.toLowerCase().includes('heavy'))!;
    const wearer = mkComp('w-1', compCard.name, {
      loadout: { weapon: null, gear: [mkItem('g1', 'Old Gear A'), mkItem('g2', 'Old Gear B')] },
    });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: wearer }, hand: [gearCard], willpower: 5, classZone: [] },
    } }));
    gs.getState().equipItem('w-1', gearCard.id);
    const g = gs.getState().game;
    const ent = g.p1.board.f1!;
    expect(g.p1.hand.some(c => c.id === gearCard.id), `overflow (${gearCard.name}): item stays in hand`).toBe(true);
    expect(ent.loadout?.gear[0]?.name, 'old gear intact').toBe('Old Gear A');
    expect(ent.loadout?.gear[1]?.name, 'old gear intact').toBe('Old Gear B');
    expect(ent.acts.minor, 'no minor action spent on the no-op').toBe(false);

    // With a FREE slot the same gear equips fine (regression).
    const wearer2 = mkComp('w-2', compCard.name, { loadout: { weapon: null, gear: [mkItem('g3', 'Old Gear C'), null] } });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: wearer2 }, hand: [gearCard], willpower: 5, classZone: [] },
    } }));
    gs.getState().equipItem('w-2', gearCard.id);
    expect(gs.getState().game.p1.board.f1?.loadout?.gear[1]?.name, 'free slot: gear equips').toBe(gearCard.name);
  });
});

describe('keywords resolve through effectiveKeywords', () => {
  it('buff-granted Zealous lifts the entry-turn attack restriction', () => {
    freshGame();
    const freshComp = mkComp('z-1', compCard.name, { fresh: true, buffs: [{ grant: ['Zealous'], until: 'endOfTurn' }] });
    const freshNoZeal = mkComp('z-2', compCard.name, { fresh: true });
    gs.setState(s => ({ game: { ...s.game, p1: { ...s.game.p1, board: { f1: freshComp, f2: freshNoZeal } } }, pending: null }));
    gs.getState().beginAttack('z-1');
    expect(gs.getState().pending?.action, 'granted Zealous: fresh attacker allowed').toBe('attack');
    gs.setState({ pending: null });
    gs.getState().beginAttack('z-2');
    expect(gs.getState().pending, 'no Zealous: fresh attacker blocked').toBeNull();
  });

  it('isImmuneToSplash honors granted Acrobatics', () => {
    const g = gs.getState().game;
    const acro = mkComp('a-1', compCard.name, { buffs: [{ grant: ['Acrobatics'], until: 'endOfTurn' }] });
    const plain = mkComp('a-2', compCard.name);
    expect(isImmuneToSplash(acro, g), 'granted Acrobatics: immune to splash').toBe(true);
    expect(isImmuneToSplash(plain, g), 'no Acrobatics: not immune').toBe(false);
  });
});

describe('prompt-state reset', () => {
  it('startSolo clears stale store-local prompts (LOCAL_PROMPTS_CLEARED)', () => {
    gs.setState({
      pendingTrigger: { stale: true } as never,
      pendingKit: { stale: true } as never,
      pileView: { player: 'p1', zone: 'dead' },
    });
    gs.getState().startSolo(deckCards, deckCards);
    const s = gs.getState();
    expect(s.pendingTrigger === null && s.pendingKit === null && s.pileView === null,
      'stale prompts cleared').toBe(true);
  });
});
