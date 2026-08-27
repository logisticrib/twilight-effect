// Turn-ownership gate (MP wire finding 2026-08-25): in a hosted/joined match the
// NON-ACTIVE peer must not be able to play cards, attack, move, exchange, or advance
// phases on the opponent's turn. The wire treats whoever just mutated as authoritative
// (useMultiplayer broadcasts every local game mutation), so an out-of-turn play would
// overwrite the active player's game mid-turn. Owner-routed prompt RESOLVERS stay
// ungated — they are the non-active player's own decisions — and solo/sandbox is
// exempt (one human plays both sides via switchSides).
import { describe, it, expect, beforeEach } from 'vitest';
import { gs, deckCards, mkPc, mkComp } from './helpers';
import { CATALOG } from '../data/catalog';

const HAND_CARD = CATALOG.find(c => c.type === 'Companion' && c.level === 1)!;
const NOT_YOUR_TURN = /not your turn/i;
const lastToast = () => gs.getState().toasts.at(-1)?.msg ?? '';

/** MP seat p1 (host) while p2 is the ACTIVE player, mid-action-phase with a playable
 *  board and hand — the out-of-turn peer's seat. */
function mpOffTurn(over: Record<string, unknown> = {}) {
  gs.getState().startSolo(deckCards, deckCards);
  gs.setState(s => ({
    conn: { ...s.conn, mode: 'host' as const }, localPlayer: 'p1' as const,
    pending: null, pendingPlay: null,
    game: {
      ...s.game, setupQueue: [], currentPhase: 'action' as const, activePlayer: 'p2' as const,
      selected: null,
      p1: { ...s.game.p1, hand: [HAND_CARD],
        board: { b3: mkPc('pc-p1'), b1: mkComp('own-unit', 'Own Unit') } },
      p2: { ...s.game.p2, board: { b3: mkPc('pc-p2'), f1: mkComp('opp-unit', 'Opp Unit') } },
      ...over,
    },
  }));
}

beforeEach(() => { gs.getState().startSolo(deckCards, deckCards); });

describe('MP turn gate: the non-active peer is refused', () => {
  it('beginPlay / playAction / equipItem refuse with a toast and touch nothing', () => {
    mpOffTurn();
    const before = gs.getState().game;
    gs.getState().beginPlay(HAND_CARD.id);
    expect(gs.getState().pendingPlay, 'play never arms').toBeNull();
    expect(lastToast()).toMatch(NOT_YOUR_TURN);
    gs.getState().playAction(HAND_CARD.id);
    gs.getState().equipItem('own-unit', HAND_CARD.id);
    expect(gs.getState().game, 'game object untouched (no broadcastable mutation)').toBe(before);
  });

  it('beginAttack / resolveAttack / beginMove / resolveMove refuse', () => {
    mpOffTurn();
    const before = gs.getState().game;
    gs.getState().beginAttack('own-unit');
    expect(gs.getState().pending, 'attack never arms').toBeNull();
    expect(lastToast()).toMatch(NOT_YOUR_TURN);
    gs.getState().beginMove('own-unit');
    expect(gs.getState().pending, 'move never arms').toBeNull();
    expect(gs.getState().game).toBe(before);
  });

  it('phase advancement and endTurn refuse (turn cannot be stolen)', () => {
    mpOffTurn();
    const before = gs.getState().game;
    gs.getState().advancePhase();
    gs.getState().completeCzPhase();
    gs.getState().endTurnToEndPhase();
    gs.getState().endTurn();
    expect(gs.getState().game).toBe(before);
    expect(gs.getState().game.activePlayer).toBe('p2');
    expect(lastToast()).toMatch(NOT_YOUR_TURN);
  });

  it('CZ exchange refuses off-turn (cz phase seeded)', () => {
    mpOffTurn({ currentPhase: 'cz' as const });
    const before = gs.getState().game;
    gs.getState().handToCz(HAND_CARD.id);
    gs.getState().czToHand(gs.getState().game.p1.classZone[0]?.id ?? 'cz0');
    expect(gs.getState().game).toBe(before);
    expect(lastToast()).toMatch(NOT_YOUR_TURN);
  });

  it('playtest helpers (adjustHp / resetActions / sacrificeEntity / markAction) refuse', () => {
    mpOffTurn();
    const before = gs.getState().game;
    gs.getState().adjustHp('opp-unit', -1);
    gs.getState().resetActions('own-unit');
    gs.getState().sacrificeEntity('own-unit');
    gs.getState().markAction('own-unit', 'major');
    expect(gs.getState().game).toBe(before);
    expect(lastToast()).toMatch(NOT_YOUR_TURN);
  });

  it('switchSides is inert outside sandbox (a peer cannot become the other seat)', () => {
    mpOffTurn();
    gs.getState().switchSides();
    expect(gs.getState().localPlayer).toBe('p1');
  });
});

describe('MP turn gate: what must STILL work', () => {
  it('the ACTIVE peer plays normally under the same MP state', () => {
    mpOffTurn({ activePlayer: 'p1' as const });
    gs.getState().selectEntity('pc-p1');
    gs.getState().beginPlay(HAND_CARD.id);
    expect(gs.getState().pendingPlay, 'active player arms the play').not.toBeNull();
  });

  it('an owner-routed prompt RESOLVER is not turn-gated (dead-pick on the opponent turn)', () => {
    mpOffTurn();
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, dead: [HAND_CARD] },
      pendingDeadPick: { source: 'Test Return', lp: 'p1' as const,
        options: [{ card: HAND_CARD, idx: 0 }], postEffects: [], optional: true } as never,
    } }));
    gs.getState().resolveDeadPick(0);
    expect(gs.getState().game.pendingDeadPick, 'p1 resolved their own prompt mid-p2-turn').toBeNull();
    expect(gs.getState().game.p1.hand.some(c => c.id === HAND_CARD.id)).toBe(true);
  });

  it('sandbox (solo) is exempt: hotseat plays the non-local side freely', () => {
    gs.getState().startSolo(deckCards, deckCards);
    gs.setState(s => ({ localPlayer: 'p1' as const,
      game: { ...s.game, setupQueue: [], currentPhase: 'action' as const, activePlayer: 'p2' as const,
        selected: null, p1: { ...s.game.p1, hand: [HAND_CARD], board: { b3: mkPc('pc-p1') } } } }));
    gs.getState().selectEntity('pc-p1');
    gs.getState().beginPlay(HAND_CARD.id);
    expect(gs.getState().pendingPlay, 'solo mode never turn-refuses').not.toBeNull();
    gs.getState().switchSides();
    expect(gs.getState().localPlayer, 'sandbox side-switch still works').toBe('p2');
  });
});
