// @vitest-environment jsdom
// Live two-peer MP pass findings (2026-07-21), pinned. The synced holds themselves
// passed the live pass (trigger order / prevent order / any-deck peek resolved over
// real PeerJS with byte-identical peer states); what failed was the HELD side's UX:
//  1) ReactiveHoldBanner was a hand-enumerated COPY of reactiveHold() covering 4 of
//     its 9 hold kinds — trigger ordering, deck peeks, Coercion, attack choice and
//     the ownEnter stack head held the peer with NO banner (divergence-time-bomb
//     class, lesson 2026-07-20). The banner now derives from reactiveHold() itself.
//  2) Every hold-gated reducer except activateAbility refused SILENTLY (no-silent-
//     outcomes violation) — now they all toast the blocking prompt by name.
//  3) FLAGGED CLOSURES (same gate, previously absent entirely): beginPlay/beginAttack
//     could arm a picker whose resolution was guaranteed to refuse (dead prompt,
//     2026-07-20 class); advancePhase/completeCzPhase/endTurnToEndPhase (plus the CZ
//     exchange and the playtest helpers) mutated game locally while the wire was
//     suppressed — a silent local divergence until the owner's next snapshot.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactiveHoldBanner } from '../screens/play/ReactiveHoldBanner';
import { gs, freshGame, mkComp, mkCz } from './helpers';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';
import type { PendingTriggerOrder, PendingPreventOrder } from '../engine';

afterEach(() => cleanup());

const trapEntry = (id: string) => ({
  kind: 'reactive', sourceId: id, sourceName: 'Tripwire Snare', controller: 'p2',
  trigger: 'oppCompanionEnters', subjectId: 'x', subjectName: 'X',
}) as unknown as PendingTriggerOrder['items'][number];

/** p2-owned simultaneous-trigger ordering — one of the hold kinds the old banner missed. */
const p2TriggerOrder = (): PendingTriggerOrder =>
  ({ lp: 'p2', items: [trapEntry('tw-a'), trapEntry('tw-b')], picked: [] });

/** p2-owned prevention ordering — a hold kind the old banner DID cover (regression). */
const p2PreventOrder = (): PendingPreventOrder => ({
  chooser: 'p2', entityId: 'wz', entityName: 'Held Wizard', dmg: 2, sourceName: 'Attacker',
  items: [
    { kind: 'prevent', sourceId: 'rp-1', sourceName: 'Reflecting Pool', amount: 1 },
    { kind: 'prevent', sourceId: 'rp-2', sourceName: 'Reflecting Pool', amount: 1 },
  ],
  picked: [],
});

const p2Peek = () => ({
  source: 'Runic Convergence Staff', lp: 'p2' as const, deckSide: 'p2' as const,
  cards: [CATALOG[0]], dests: ['top'] as ('hand' | 'top' | 'bottom')[],
});

/** MP seat p1 with a seeded hold in game state (the multiplayer.test.ts idiom). */
function mpHold(hold: Record<string, unknown>) {
  freshGame();
  gs.setState(s => ({ conn: { ...s.conn, mode: 'host' as const }, localPlayer: 'p1' as const,
    game: { ...s.game, ...hold } }));
}

const lastToast = () => gs.getState().toasts.at(-1)?.msg ?? '';

describe('ReactiveHoldBanner derives from reactiveHold() — every hold kind shows', () => {
  it('renders for the previously-missing kinds: trigger ordering, deck peek, Coercion', () => {
    mpHold({ pendingTriggerOrder: p2TriggerOrder() });
    render(<ReactiveHoldBanner />);
    expect(screen.getByText(/simultaneous trigger ordering/), 'trigger-ordering hold shows').toBeTruthy();
    cleanup();

    mpHold({ pendingPeek: p2Peek(), pendingPeekQueue: [] });
    render(<ReactiveHoldBanner />);
    expect(screen.getByText(/deck peek/), 'deck-peek hold shows').toBeTruthy();
    cleanup();

    mpHold({ pendingCoercion: { source: 'Whisper of Doubt', victim: 'p2' } as never });
    render(<ReactiveHoldBanner />);
    expect(screen.getByText(/Coercion/), 'Coercion hold shows').toBeTruthy();
  });

  it('still renders for a previously-covered kind (prevention ordering) — no regression', () => {
    mpHold({ pendingPreventOrder: p2PreventOrder() });
    render(<ReactiveHoldBanner />);
    expect(screen.getByText(/Held Wizard's damage prevention/)).toBeTruthy();
  });

  it('absent for the prompt OWNER and absent in sandbox', () => {
    mpHold({ pendingTriggerOrder: p2TriggerOrder() });
    gs.setState({ localPlayer: 'p2' });
    render(<ReactiveHoldBanner />);
    expect(screen.queryByText(/Waiting for the opponent/), 'owner is never held by their own prompt').toBeNull();
    cleanup();

    freshGame();
    gs.setState(s => ({ conn: { ...s.conn, mode: 'solo' as const }, localPlayer: 'p1' as const,
      game: { ...s.game, pendingTriggerOrder: p2TriggerOrder() } }));
    render(<ReactiveHoldBanner />);
    expect(screen.queryByText(/Waiting for the opponent/), 'sandbox: the modal covers the board, no banner').toBeNull();
  });
});

describe('held reducers refuse LOUDLY (no-silent-outcomes)', () => {
  it('held endTurn: turn unchanged + the reason toasts (was a silent dead click)', () => {
    mpHold({ pendingPreventOrder: p2PreventOrder() });
    const turn0 = gs.getState().game.turn;
    gs.getState().endTurn();
    const g = gs.getState().game;
    expect(g.turn, 'turn unchanged').toBe(turn0);
    expect(g.activePlayer, 'still p1').toBe('p1');
    expect(lastToast()).toBe("Waiting for the opponent to resolve Held Wizard's damage prevention.");
  });

  it('held markAction (existing gate) now toasts too', () => {
    mpHold({ pendingTriggerOrder: p2TriggerOrder() });
    gs.setState(s => ({ game: { ...s.game,
      p1: { ...s.game.p1, board: { f1: mkComp('ma-1', 'Marker') } } } }));
    gs.getState().markAction('ma-1', 'move');
    expect(gs.getState().game.p1.board.f1?.acts.move, 'refused — nothing marked').toBe(false);
    expect(lastToast()).toBe('Waiting for the opponent to resolve simultaneous trigger ordering.');
  });
});

describe('FLAGGED CLOSURES — arming and phase advancement are hold-gated at all now', () => {
  /** Playable synthetic Warrior + matching CZ + willpower (the trap-test seed). */
  const handComp: Card = {
    id: 'mh-hc-1', name: 'Held Recruit', level: 1, type: 'Companion', subtype: '',
    rarity: 'Common', class1: 'Warrior', class2: '', attack: 2, hp: 4, anchor: null,
    actionSub: '', actionPM: '', itemKind: '', keywords: [], text: '', flavor: '',
  } as unknown as Card;
  const seedPlayable = () => gs.setState(s => ({ game: { ...s.game,
    p1: { ...s.game.p1, hand: [handComp], willpower: 5,
      classZone: CATALOG.slice(20, 25).map((c, i) => mkCz(c, 'Warrior', `mh-cz-${i}`)),
      board: { f1: mkComp('mh-att-1', 'Held Attacker') } },
  } }));

  it('held beginPlay refuses at ARM time (no dead pendingPlay) + toasts', () => {
    mpHold({ pendingTriggerOrder: p2TriggerOrder() });
    seedPlayable();
    gs.getState().beginPlay('mh-hc-1');
    expect(gs.getState().pendingPlay, 'nothing armed').toBeNull();
    expect(lastToast()).toBe('Waiting for the opponent to resolve simultaneous trigger ordering.');
  });

  it('held beginAttack refuses at ARM time (no dead target picker) + toasts', () => {
    mpHold({ pendingTriggerOrder: p2TriggerOrder() });
    seedPlayable();
    gs.getState().beginAttack('mh-att-1');
    expect(gs.getState().pending, 'nothing armed').toBeNull();
    expect(lastToast()).toBe('Waiting for the opponent to resolve simultaneous trigger ordering.');
  });

  it('held phase reducers refuse (the wire suppresses their broadcast — a held phase change was a silent local divergence)', () => {
    mpHold({ pendingTriggerOrder: p2TriggerOrder() });
    gs.getState().endTurnToEndPhase();
    expect(gs.getState().game.currentPhase, 'action phase kept').toBe('action');
    expect(lastToast()).toBe('Waiting for the opponent to resolve simultaneous trigger ordering.');

    gs.setState(s => ({ game: { ...s.game, currentPhase: 'cz' as const } }));
    gs.getState().completeCzPhase();
    expect(gs.getState().game.currentPhase, 'cz phase kept').toBe('cz');
  });

  it('unheld regression — the same seats and seeds proceed (no over-refusal)', () => {
    mpHold({});
    seedPlayable();
    gs.getState().beginPlay('mh-hc-1');
    expect(gs.getState().pendingPlay, 'arming proceeds unheld').toBeTruthy();
    gs.getState().cancelPlay();
    gs.getState().endTurnToEndPhase();
    expect(gs.getState().game.currentPhase, 'phase advances unheld').toBe('end');
  });
});
