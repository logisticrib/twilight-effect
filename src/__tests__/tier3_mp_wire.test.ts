// @vitest-environment jsdom
// Tier 3 (test_seed_plan.md) — the useMultiplayer WIRE layer, items 1/3/5. (Items 2/4/6
// — owner-gated cancels, version handshake, PING/PONG self-heal — live in
// multiplayer.test.ts.) The real store subscription drives a recording fake session.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('../lib/multiplayer', () => {
  class MultiplayerSession {
    static instances: MultiplayerSession[] = [];
    callbacks: unknown;
    sent: unknown[] = [];
    constructor(cb: unknown) { this.callbacks = cb; MultiplayerSession.instances.push(this); }
    sendStateSync(state: unknown) { this.sent.push(state); }
    send() {}
    async host() { return 'TEST42'; }
    async join() {}
    destroy() {}
  }
  return { MultiplayerSession, PROTOCOL_VERSION: 1 };
});

import { useMultiplayer } from '../lib/useMultiplayer';
import { MultiplayerSession } from '../lib/multiplayer';
import { gs, deckCards } from './helpers';
import type { GameState } from '../store/gameStore';

interface FakeSession {
  callbacks: {
    onOpponentJoined: (p: { name: string; avatar: string }) => void;
    onMessage: (m: unknown) => void;
  };
  sent: GameState[];
}
const instances = (MultiplayerSession as unknown as { instances: FakeSession[] }).instances;
const lastSession = () => instances[instances.length - 1];

afterEach(cleanup);

async function hostGame() {
  const hook = renderHook(() => useMultiplayer());
  await act(async () => { await hook.result.current.host(deckCards, deckCards); });
  const session = lastSession();
  // Opponent becomes ready → the one-shot initial handoff snapshot. (host() also
  // broadcast once when startMultiplayer reset the game — harmless in production,
  // no connection is open yet, but the recording fake counts it.)
  act(() => { session.callbacks.onOpponentJoined({ name: 'Bob', avatar: 'B' }); });
  expect(session.sent.length, 'initial handoff snapshot on opponent ready').toBe(2);
  return session;
}

describe('item 1: reactiveHold suppresses the WIRE while an opponent-owned prompt is out', () => {
  it('arming snapshot goes out once; held traffic (incl. selection clicks) is silent; resolution resumes it', async () => {
    const session = await hostGame();
    // Ordinary mutations broadcast — including bare selection clicks.
    act(() => { gs.getState().selectEntity('sel-1'); });
    expect(session.sent.length, 'selection click broadcasts when not held').toBe(3);

    // Arming an OPPONENT-owned dead pick: this snapshot is how the owner learns the
    // prompt exists — it MUST be sent (suppressing it deadlocked the match).
    act(() => { gs.getState().setGame(g => ({ ...g,
      pendingDeadPick: { source: 'Memory Stone', lp: 'p2', options: [], postEffects: [], optional: false } })); });
    expect(session.sent.length, 'the arming snapshot is delivered').toBe(4);
    expect(session.sent[3].pendingDeadPick?.source).toBe('Memory Stone');

    // While the prompt is outstanding: selection clicks and modal setGame stay silent.
    act(() => { gs.getState().selectEntity('sel-2'); });
    act(() => { gs.getState().setGame(g => ({ ...g, turn: g.turn + 1 })); });
    expect(session.sent.length, 'held traffic suppressed').toBe(4);

    // The owner resolves on their client; applying their snapshot must not echo.
    act(() => { session.callbacks.onMessage({ type: 'STATE_SYNC',
      state: { ...gs.getState().game, pendingDeadPick: null }, seq: 2 }); });
    expect(gs.getState().game.pendingDeadPick, 'resolution applied').toBeNull();
    expect(session.sent.length, 'no echo on remote apply').toBe(4);

    // Hold released → normal broadcasting resumes.
    act(() => { gs.getState().selectEntity('sel-3'); });
    expect(session.sent.length).toBe(5);
  });

  it('all three opponent-owned prompts hold the wire; a local clear (escape hatch) releases it', async () => {
    const session = await hostGame();
    const prompts: Partial<GameState>[] = [
      { pendingArmor: { defender: 'p2', entityId: 'x', entityName: 'X', candidates: [] } },
      { pendingDeadPick: { source: 'Library', lp: 'p2', options: [], postEffects: [], optional: true } },
      { pendingAttackChoice: { lp: 'p2', charId: 'x', targetId: 'y', sourceName: 'Mara', payHP: 1, bonus: 1 } },
    ];
    let sends = 2;
    for (const patch of prompts) {
      act(() => { gs.getState().setGame(g => ({ ...g, ...patch })); });
      expect(session.sent.length, `arming ${Object.keys(patch)[0]} sends once`).toBe(++sends);
      act(() => { gs.getState().setGame(g => ({ ...g, turn: g.turn + 1 })); });
      expect(session.sent.length, `${Object.keys(patch)[0]} holds the wire`).toBe(sends);
      // Owner-side cancel arrives as a local clear (sandbox/escape-hatch path) → resumes.
      act(() => { gs.getState().setGame(g => ({ ...g,
        pendingArmor: null, pendingDeadPick: null, pendingAttackChoice: null })); });
      expect(session.sent.length, `clearing ${Object.keys(patch)[0]} broadcasts the release`).toBe(++sends);
    }
  });
});

describe('item 3: the guest is silent until the host’s first STATE_SYNC', () => {
  it('applies nothing outward and broadcasts nothing pre-sync; syncs then flows', async () => {
    const hook = renderHook(() => useMultiplayer());
    await act(async () => { await hook.result.current.join('CODE99', deckCards, deckCards); });
    const session = lastSession();

    // Pre-sync window: local mutations (clicks, Escape fallout) must NOT broadcast the
    // guest's independently-shuffled game over the host's.
    act(() => { gs.getState().selectEntity('pre-1'); });
    act(() => { gs.getState().setGame(g => ({ ...g, turn: 99 })); });
    expect(session.sent.length, 'guest silent pre-sync').toBe(0);

    // The host's authoritative snapshot arrives: applied wholesale, but the guest's own
    // `selected` (local UI concern) is preserved.
    act(() => { gs.getState().selectEntity('keep-me'); });
    const authoritative = { ...gs.getState().game, turn: 42, selected: 'HOST-SEL' };
    act(() => { session.callbacks.onMessage({ type: 'STATE_SYNC', state: authoritative, seq: 1 }); });
    const g = gs.getState().game;
    expect(g.turn, 'host snapshot applied').toBe(42);
    expect(g.selected, 'local selection preserved over the host value').toBe('keep-me');
    expect(session.sent.length, 'applying never echoes').toBe(0);

    // Synced — the guest now broadcasts its own mutations.
    act(() => { gs.getState().selectEntity('post-1'); });
    expect(session.sent.length).toBe(1);
  });
});

describe('item 5: STATE_SYNC shape check', () => {
  it('malformed payloads are dropped with a warning, never applied', async () => {
    const session = await hostGame();
    const before = gs.getState().game;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => { session.callbacks.onMessage({ type: 'STATE_SYNC', state: null, seq: 9 }); });
    act(() => { session.callbacks.onMessage({ type: 'STATE_SYNC', state: 'garbage', seq: 10 }); });
    act(() => { session.callbacks.onMessage({ type: 'STATE_SYNC', state: { p1: {} }, seq: 11 }); });
    expect(gs.getState().game, 'store untouched by all three').toBe(before);
    const dropped = warn.mock.calls.filter(c => String(c[0]).includes('malformed')).length;
    expect(dropped, 'each drop warned').toBe(3);
    warn.mockRestore();
    // A well-formed snapshot still applies afterwards.
    act(() => { session.callbacks.onMessage({ type: 'STATE_SYNC', state: { ...before, turn: 77 }, seq: 12 }); });
    expect(gs.getState().game.turn).toBe(77);
  });
});
