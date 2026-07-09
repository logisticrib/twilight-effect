// Owner bug batch 2026-07-08 — the two reducer-level gates:
//  1. Game-over gate: once `game.gameOver` is set, every gameplay reducer refuses (the
//     board is frozen for review); session/UI actions stay live. Regression guarded:
//     a post-game endTurn used to WIPE gameOver back to null (`gameOver: winnerOnDeckOut`).
//  2. Action-phase gate: action-phase actions are legal only in the Action Phase — the
//     Class Zone Exchange must be resolved or deliberately skipped (completeCzPhase)
//     first. This was UI-only (the CZ panel overlay); now the reducers refuse.
import { describe, it, expect } from 'vitest';
import { gs, freshGame, mkComp, mkPc } from './helpers';
import { CATALOG } from '../data/catalog';

const compCard = CATALOG.find(c => c.type === 'Companion')!;
const compCard2 = CATALOG.filter(c => c.type === 'Companion')[1];

/** Board with one attacker-vs-defender pair plus both PCs, ready to fight. */
function seedDuel(over: { gameOver?: 'p1' | 'p2' | null; currentPhase?: 'draw' | 'cz' | 'action' | 'end' } = {}) {
  freshGame();
  gs.setState(s => ({ game: { ...s.game,
    gameOver: over.gameOver ?? null,
    currentPhase: over.currentPhase ?? ('action' as const),
    p1: { ...s.game.p1, board: { f1: mkComp('g-att', compCard.name, { atk: 2 }), b1: mkPc('g-pc1') } },
    p2: { ...s.game.p2, board: { f1: mkComp('g-def', compCard2.name, { hp: 9 }), b1: mkPc('g-pc2') } },
  } }));
}

describe('game-over gate: gameplay reducers refuse once the game is decided', () => {
  it('endTurn is a no-op — and no longer wipes gameOver (regression)', () => {
    seedDuel({ gameOver: 'p1' });
    const before = gs.getState().game;
    gs.getState().endTurn();
    expect(gs.getState().game, 'endTurn refused (state untouched)').toBe(before);
    expect(gs.getState().game.gameOver, 'gameOver survives — it used to be reset to null').toBe('p1');
  });

  it('drawCard is a no-op (and works again once gameOver clears — non-vacuous)', () => {
    seedDuel({ gameOver: 'p1' });
    const handBefore = gs.getState().game.p1.hand.length;
    gs.getState().drawCard('p1');
    expect(gs.getState().game.p1.hand.length, 'refused while game over').toBe(handBefore);
    gs.setState(s => ({ game: { ...s.game, gameOver: null } }));
    gs.getState().drawCard('p1');
    expect(gs.getState().game.p1.hand.length, 'control: same call draws normally').toBe(handBefore + 1);
  });

  it('placeCard is a no-op', () => {
    // A companion the fresh 3-card Class Zone can afford (WP ≥ level), so the ONLY
    // blocker is the gate — proven by the control placement after gameOver clears.
    const cheap = CATALOG.find(c => c.type === 'Companion' && c.level <= 2)!;
    const armPlace = () => gs.setState(s => ({
      game: { ...s.game, p1: { ...s.game.p1, hand: [cheap] } },
      pendingPlay: { cardId: cheap.id, actorId: null },
    }));
    seedDuel({ gameOver: 'p2' });
    armPlace();
    gs.getState().placeCard('b2');
    const g = gs.getState().game;
    expect(g.p1.board.b2, 'nothing entered the board').toBeUndefined();
    expect(g.p1.hand.map(c => c.id), 'card stays in hand').toContain(cheap.id);

    gs.setState(s => ({ game: { ...s.game, gameOver: null } }));
    armPlace();
    gs.getState().placeCard('b2');
    expect(gs.getState().game.p1.board.b2?.name, 'control: same play lands without gameOver').toBe(cheap.name);
  });

  it('attacks are refused (arm and resolve)', () => {
    seedDuel({ gameOver: 'p1' });
    gs.getState().beginAttack('g-att');
    expect(gs.getState().pending, 'beginAttack refused').toBeNull();
    gs.setState({ pending: { action: 'attack', charId: 'g-att' } }); // force-arm past the gate
    const before = gs.getState().game;
    gs.getState().resolveAttack('g-def');
    expect(gs.getState().game, 'resolveAttack refused').toBe(before);
    expect(gs.getState().game.p2.board.f1?.hp).toBe(9);
  });

  it('session/UI actions stay live: backToLobby still exits', () => {
    seedDuel({ gameOver: 'p1' });
    gs.getState().backToLobby();
    expect(gs.getState().playPhase).toBe('lobby');
  });
});

describe('action-phase gate: actions wait for the CZ exchange (reducer-level)', () => {
  it('during the CZ phase, attack / play / move / equip reducers refuse', () => {
    seedDuel({ currentPhase: 'cz' });
    const action = CATALOG.find(c => c.type === 'Action')!;
    const item = CATALOG.find(c => c.type === 'Item')!;
    gs.setState(s => ({ game: { ...s.game, selected: 'g-att',
      p1: { ...s.game.p1, hand: [action, item], willpower: 9 } } }));

    gs.getState().beginAttack('g-att');
    expect(gs.getState().pending, 'beginAttack refused outside the Action Phase').toBeNull();
    gs.setState({ pending: { action: 'attack', charId: 'g-att' } });
    let before = gs.getState().game;
    gs.getState().resolveAttack('g-def');
    expect(gs.getState().game, 'resolveAttack refused').toBe(before);

    before = gs.getState().game;
    gs.getState().playAction(action.id);
    expect(gs.getState().game, 'playAction refused').toBe(before);

    gs.setState({ pending: { action: 'move', charId: 'g-att' } });
    before = gs.getState().game;
    gs.getState().resolveMove('f2');
    expect(gs.getState().game, 'resolveMove refused').toBe(before);

    before = gs.getState().game;
    gs.getState().equipItem('g-att', item.id);
    expect(gs.getState().game, 'equipItem refused').toBe(before);
  });

  it('completeCzPhase (the deliberate Skip) unlocks the Action Phase', () => {
    seedDuel({ currentPhase: 'cz' });
    gs.getState().completeCzPhase();
    expect(gs.getState().game.currentPhase).toBe('action');
    gs.getState().beginAttack('g-att');
    expect(gs.getState().pending?.action, 'attack arms once in the Action Phase').toBe('attack');
    gs.getState().resolveAttack('g-def');
    expect(gs.getState().game.p2.board.f1?.hp, 'attack resolves').toBe(7);
  });

  it('the CZ exchange itself is reducer-gated: cz-phase only, once per turn', () => {
    freshGame(); // action phase
    const handCard = gs.getState().game.p1.hand[0];
    const czBefore = gs.getState().game.p1.classZone.length;
    gs.getState().handToCz(handCard.id);
    expect(gs.getState().game.p1.classZone.length, 'exchange refused outside the CZ phase').toBe(czBefore);

    gs.setState(s => ({ game: { ...s.game, currentPhase: 'cz' as const } }));
    gs.getState().handToCz(handCard.id);
    expect(gs.getState().game.p1.classZone.length, 'exchange works during the CZ phase').toBe(czBefore + 1);
    expect(gs.getState().game.czExchangeUsed).toBe(true);

    const second = gs.getState().game.p1.hand[0];
    gs.getState().handToCz(second.id);
    expect(gs.getState().game.p1.classZone.length, 'once per turn — second exchange refused').toBe(czBefore + 1);
  });
});
