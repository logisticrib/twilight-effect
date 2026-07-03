// Batch-3 MP protocol suite — converted verbatim from the 2026-07-02 verification
// scratchpad (verify_batch3.mjs, 19 assertions preserved). Two MultiplayerSessions
// over stubbed DataConnections (peerjs mocked — no WebRTC in Node), plus the
// store-level reactiveHold / owner-gated-cancel checks.
import { describe, it, expect, vi } from 'vitest';
import type { DataConnection } from 'peerjs';
import { MultiplayerSession, PROTOCOL_VERSION } from '../lib/multiplayer';
import { useGameStore, reactiveHold } from '../store/gameStore';
import type { GameState } from '../store/gameStore';
import { CATALOG } from '../data/catalog';

vi.mock('peerjs', () => ({
  default: class PeerStub {
    on() {}
    connect() { return {}; }
    destroy() {}
  },
}));

// A pair of fake DataConnections delivering to each other, with a drop switch.
interface FakeConn {
  handlers: Record<string, ((data: unknown) => void)[]>;
  open: boolean;
  closed: boolean;
  drop?: boolean;
  dropped?: number;
  on(ev: string, cb: (data: unknown) => void): void;
  send(raw: unknown): void;
  close(): void;
}

function makePipe() {
  const mk = (): FakeConn => {
    const c: FakeConn = {
      handlers: {}, open: true, closed: false,
      on: (ev, cb) => { (c.handlers[ev] ??= []).push(cb); },
      send: () => {},
      close: () => { c.closed = true; },
    };
    return c;
  };
  const a = mk(), b = mk();
  const wire = (self: FakeConn, other: FakeConn) => {
    self.send = (raw) => {
      if (self.drop) { self.dropped = (self.dropped ?? 0) + 1; return; }
      (other.handlers['data'] ?? []).forEach(cb => cb(raw));
    };
  };
  wire(a, b); wire(b, a);
  const openBoth = () => {
    (a.handlers['open'] ?? []).forEach(cb => cb(undefined));
    (b.handlers['open'] ?? []).forEach(cb => cb(undefined));
  };
  return { a, b, openBoth };
}

// Test seam into the session's private wiring (host()/join() assign these in the real flow).
type SessionInternals = {
  conn: DataConnection | null;
  _wireConn(conn: DataConnection, name: string, avatar: string): void;
};
const internals = (s: MultiplayerSession) => s as unknown as SessionInternals;
const asConn = (c: FakeConn) => c as unknown as DataConnection;

type Callbacks = ConstructorParameters<typeof MultiplayerSession>[0];
interface Log {
  status: string[];
  joined: unknown[];
  msgs: { seq?: number; state?: { turn?: number } }[];
  latency: number[];
  errors: string[];
  disconnects: number;
}
const mkLog = (): Log => ({ status: [], joined: [], msgs: [], latency: [], errors: [], disconnects: 0 });
const mkCallbacks = (log: Log): Callbacks => ({
  onStatusChange: (s) => { log.status.push(s); },
  onOpponentJoined: (p) => { log.joined.push(p); },
  onMessage: (m) => { log.msgs.push(m as Log['msgs'][number]); },
  onLatency: (ms) => { log.latency.push(ms); },
  onDisconnect: () => { log.disconnects++; },
  onError: (e) => { log.errors.push(String(e)); },
});

const st = (n: number) => ({ p1: {}, p2: {}, activePlayer: 'p1', turn: n }) as unknown as GameState;

describe('protocol: handshake, sync sequencing, self-heal', () => {
  it('runs the full A↔B session lifecycle', () => {
    const logA = mkLog(), logB = mkLog();
    const A = new MultiplayerSession(mkCallbacks(logA));
    const B = new MultiplayerSession(mkCallbacks(logB));
    const { a, b, openBoth } = makePipe();
    internals(A).conn = asConn(a);
    internals(B).conn = asConn(b);
    internals(A)._wireConn(asConn(a), 'Alice', 'A');
    internals(B)._wireConn(asConn(b), 'Bob', 'B');
    openBoth();
    expect(logA.joined.length, 'handshake: A sees READY (version ok)').toBe(1);
    expect(logB.joined.length, 'handshake: B sees READY (version ok)').toBe(1);
    expect(logA.errors.length + logB.errors.length, 'handshake: no version errors').toBe(0);

    // STATE_SYNC seq tracking + lost-sync self-heal
    A.sendStateSync(st(1));
    expect(logB.msgs.length === 1 && logB.msgs[0].seq === 1, 'B received seq 1').toBe(true);

    a.drop = true;            // the wire eats A's next message
    A.sendStateSync(st(2));   // lost in transit
    a.drop = false;
    expect(logB.msgs.length, 'lost sync: B did not receive seq 2 yet').toBe(1);

    // Next ping cycle: A pings (seq=2) → B answers PONG(recvSeq=1) → A re-sends.
    b.handlers['data'].forEach(cb => cb(JSON.stringify({ type: 'PING', ts: Date.now(), seq: 2 })));
    expect(logB.msgs.length === 2 && logB.msgs[1].seq === 2 && logB.msgs[1].state?.turn === 2,
      `self-heal: B got the re-sent seq-2 snapshot (seqs=${logB.msgs.map(m => m.seq)})`).toBe(true);

    // PONG latency via origTs
    a.handlers['data'].forEach(cb => cb(JSON.stringify({ type: 'PONG', ts: Date.now(), origTs: Date.now() - 100, recvSeq: 2 })));
    const lat = logA.latency.at(-1)!;
    expect(lat >= 45 && lat <= 60, `latency computed from origTs (~50ms, got ${lat})`).toBe(true);

    // Malformed message is dropped without crashing
    expect(() => { b.handlers['data'].forEach(cb => cb('{{{not json')); }, 'malformed message: no crash').not.toThrow();
    expect(logB.msgs.length, 'malformed message: dropped').toBe(2);

    A.destroy(); B.destroy();
  });

  it('refuses a version-mismatched (or versionless) peer', () => {
    const logA = mkLog();
    const A = new MultiplayerSession(mkCallbacks(logA));
    const { a } = makePipe();
    internals(A).conn = asConn(a);
    internals(A)._wireConn(asConn(a), 'Alice', 'A');
    a.handlers['data'].forEach(cb => cb(JSON.stringify({ type: 'READY', name: 'Old Build', avatar: 'O' }))); // no v field
    expect(logA.errors.some(e => e.includes('Version mismatch')), `error surfaced (${logA.errors})`).toBe(true);
    expect(a.closed, 'connection closed').toBe(true);
    expect(logA.joined.length, 'opponent NOT marked joined').toBe(0);
    expect(PROTOCOL_VERSION, 'protocol version exported').toBe(1);
    A.destroy();
  });
});

describe('store: reactiveHold coverage + owner-gated cancels', () => {
  const gs = useGameStore;
  gs.getState().startSolo(CATALOG.slice(0, 50), CATALOG.slice(0, 50));

  it('reactiveHold holds the non-owner for every opponent-owned prompt', () => {
    const g = gs.getState().game;
    const withPac = { ...g, pendingAttackChoice: { lp: 'p2' as const, charId: 'x', targetId: 'y', sourceName: 'Mara', payHP: 1, bonus: 1 } };
    expect(reactiveHold(withPac, 'p1'), 'opponent-owned attack choice holds p1').not.toBeNull();
    expect(reactiveHold(withPac, 'p2'), 'owner (p2) not held by own attack choice').toBeNull();
    const withDp = { ...g, pendingDeadPick: { source: 'MS', lp: 'p2' as const, options: [], postEffects: [], optional: false } };
    expect(reactiveHold(withDp, 'p1'), 'opponent-owned dead-pick still holds').not.toBeNull();
  });

  it('cancelPeek is owner-gated in MP, open in sandbox', () => {
    const peek = { source: 'High Reader', lp: 'p2' as const, deckSide: 'p2' as const, cards: [CATALOG[0]], dests: ['top', 'bottom'] } as never;
    // Multiplayer, p1 local, p2-owned peek → cancel must no-op
    gs.setState(s => ({ conn: { ...s.conn, mode: 'host' as const }, localPlayer: 'p1' as const,
      game: { ...s.game, pendingPeek: peek, pendingPeekQueue: [] } }));
    gs.getState().cancelPeek();
    expect(gs.getState().game.pendingPeek, 'non-owner (MP) blocked').not.toBeNull();
    // Owner cancels fine
    gs.setState({ localPlayer: 'p2' });
    gs.getState().cancelPeek();
    expect(gs.getState().game.pendingPeek, 'owner allowed').toBeNull();
    // Sandbox may always cancel
    gs.setState(s => ({ conn: { ...s.conn, mode: 'solo' as const }, localPlayer: 'p1' as const,
      game: { ...s.game, pendingPeek: peek } }));
    gs.getState().cancelPeek();
    expect(gs.getState().game.pendingPeek, 'sandbox bypass').toBeNull();
  });

  it('cancelDeadPick is owner-gated in MP', () => {
    const dp = { source: 'Library', lp: 'p2' as const, options: [{ card: CATALOG[0], idx: 0 }], postEffects: [], optional: true };
    gs.setState(s => ({ conn: { ...s.conn, mode: 'host' as const }, localPlayer: 'p1' as const,
      game: { ...s.game, pendingDeadPick: dp, pendingDeadPickQueue: [] } }));
    gs.getState().cancelDeadPick();
    expect(gs.getState().game.pendingDeadPick, 'non-owner (MP) blocked').not.toBeNull();
    gs.setState({ localPlayer: 'p2' });
    gs.getState().cancelDeadPick();
    expect(gs.getState().game.pendingDeadPick, 'owner allowed').toBeNull();
  });
});
