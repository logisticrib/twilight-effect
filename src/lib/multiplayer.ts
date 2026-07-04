import Peer, { type DataConnection } from 'peerjs';
import type { GameState } from '../store/gameStore';

// ─── Message protocol ─────────────────────────────────────────────────────────
// Multiplayer is authoritative state-sync: the mutating peer broadcasts its full
// `game`, the receiver applies it. (The old per-action replay protocol was removed.)

/** Bump whenever the message protocol or the synced GameState schema changes shape —
 *  mismatched builds refuse to connect instead of desyncing/crashing mid-game.
 *  v2 (2026-07-04): READY now carries the guest's `deck` ids and the host assembles
 *  the game from them. A v1 host silently ignores `deck` (reviving the sandbox-
 *  substitution bug), so mixed builds must refuse — hence the bump. */
export const PROTOCOL_VERSION = 2;

export type NetworkMessage =
  | { type: 'STATE_SYNC'; state: GameState; seq?: number }
  | { type: 'READY';      name: string; avatar: string; v?: number; deck?: string[] }
  | { type: 'PING';       ts: number; seq?: number }
  | { type: 'PONG';       ts: number; origTs: number; recvSeq?: number };

export type SessionStatus =
  | 'idle'
  | 'creating'       // generating peer id
  | 'waiting'        // host waiting for opponent
  | 'connecting'     // guest connecting
  | 'connected'      // both seats filled
  | 'disconnected'
  | 'error';

export interface SessionPeer {
  name: string;
  avatar: string;
  status: 'connecting' | 'ready';
  /** The guest's deck as card ids (from the READY handshake). Undefined for the host's
   *  own READY. The host resolves these against CATALOG to assemble the authoritative game. */
  deck?: string[];
}

export interface MultiplayerCallbacks {
  onStatusChange: (status: SessionStatus) => void;
  onOpponentJoined: (peer: SessionPeer) => void;
  onMessage: (msg: NetworkMessage) => void;
  onLatency: (ms: number) => void;
  onDisconnect: () => void;
  onError: (err: string) => void;
}

// ─── Session class ────────────────────────────────────────────────────────────
export class MultiplayerSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pendingPing: number | null = null;
  // Sync bookkeeping: monotonic count of STATE_SYNCs we've sent / applied from the
  // peer, piggybacked on PING/PONG. Snapshot sync normally self-heals on the next
  // mutation, but a lost FINAL sync (e.g. right after endTurn) would deadlock the
  // turn with both players waiting — the seq mismatch detects that and re-sends.
  private sentSeq = 0;
  private recvSeq = 0;
  private lastState: GameState | null = null;
  // Our own deck as card ids, announced in the READY handshake. Only the GUEST sets this
  // (the host assembles from it); the host leaves it empty so its READY carries no deck.
  private myDeck: string[] = [];
  private callbacks: MultiplayerCallbacks;
  public code = '';
  public isHost = false;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  /** HOST: create a peer and wait for a connection. */
  async host(playerName: string, avatarLetter: string): Promise<string> {
    this.isHost = true;
    this.sentSeq = 0; this.recvSeq = 0; this.lastState = null; this.pendingPing = null;
    this.callbacks.onStatusChange('creating');
    return new Promise((resolve, reject) => {
      // Generate a 6-char alphanumeric code as the peer ID
      const code = Array.from({ length: 6 }, () =>
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
      ).join('');
      this.code = code;

      const peer = new Peer(`twilight-${code}`, {
        host: '0.peerjs.com', port: 443, path: '/', secure: true,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      });
      this.peer = peer;

      peer.on('open', () => {
        this.callbacks.onStatusChange('waiting');
        resolve(code);
      });

      peer.on('connection', (conn) => {
        this.conn = conn;
        this._wireConn(conn, playerName, avatarLetter);
      });

      peer.on('error', (err) => {
        this.callbacks.onError(String(err));
        reject(err);
      });
    });
  }

  /** GUEST: connect to a host using their code. `deckIds` (this player's deck as card ids)
   *  is announced in the READY handshake so the host can assemble the authoritative game. */
  async join(code: string, playerName: string, avatarLetter: string, deckIds: string[] = []): Promise<void> {
    this.isHost = false;
    this.code = code;
    this.myDeck = deckIds;
    this.sentSeq = 0; this.recvSeq = 0; this.lastState = null; this.pendingPing = null;
    this.callbacks.onStatusChange('connecting');

    const peer = new Peer(undefined as unknown as string, {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    });
    this.peer = peer;

    return new Promise((resolve, reject) => {
      peer.on('open', () => {
        const conn = peer.connect(`twilight-${code}`, { reliable: true });
        this.conn = conn;
        this._wireConn(conn, playerName, avatarLetter);
        resolve();
      });

      peer.on('error', (err) => {
        this.callbacks.onError(String(err));
        reject(err);
      });
    });
  }

  send(msg: NetworkMessage) {
    if (this.conn?.open) {
      this.conn.send(JSON.stringify(msg));
    }
  }

  sendStateSync(state: GameState) {
    this.sentSeq++;
    this.lastState = state;
    this.send({ type: 'STATE_SYNC', state, seq: this.sentSeq });
  }

  destroy() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
    this.code = '';
  }

  /** HOST: reject the connected guest (e.g. they sent no/invalid deck) but KEEP hosting on
   *  the same code so a valid guest can retry. Mirrors the version-mismatch refusal path:
   *  surface the reason locally + close the connection (the conn 'close' handler returns the
   *  host to the waiting state); the peer stays alive. */
  rejectOpponent(reason: string) {
    this.callbacks.onError(reason);
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    this.conn?.close();
    this.conn = null;
    this.sentSeq = 0; this.recvSeq = 0; this.lastState = null; this.pendingPing = null;
  }

  private _wireConn(conn: DataConnection, name: string, avatar: string) {
    conn.on('open', () => {
      // Announce ourselves (with the protocol version — mismatched builds refuse to play).
      // The guest also announces its deck ids so the host can assemble the authoritative game.
      this.send({ type: 'READY', name, avatar, v: PROTOCOL_VERSION,
        deck: this.myDeck.length ? this.myDeck : undefined });
      this.callbacks.onStatusChange('connected');
      // Start ping loop
      this.pingInterval = setInterval(() => {
        this.pendingPing = Date.now();
        this.send({ type: 'PING', ts: this.pendingPing, seq: this.sentSeq });
      }, 3000);
    });

    conn.on('data', (raw) => {
      try {
        const msg = JSON.parse(raw as string) as NetworkMessage;
        if (msg.type === 'PING') {
          // Reply with how many of the peer's STATE_SYNCs we've applied — if they've
          // sent more, they re-send the latest (see PONG below).
          this.send({ type: 'PONG', ts: Date.now(), origTs: msg.ts, recvSeq: this.recvSeq });
          return;
        }
        if (msg.type === 'PONG') {
          // Latency from the ping's own timestamp — pendingPing is overwritten every
          // 3s, so matching a late PONG against a newer ping reported garbage.
          this.callbacks.onLatency(Math.round((Date.now() - msg.origTs) / 2));
          this.pendingPing = null;
          // Self-heal a dropped sync: the peer has applied fewer of our syncs than
          // we've sent → push the latest snapshot again (idempotent on the receiver).
          if (msg.recvSeq !== undefined && msg.recvSeq < this.sentSeq && this.lastState) {
            this.send({ type: 'STATE_SYNC', state: this.lastState, seq: this.sentSeq });
          }
          return;
        }
        if (msg.type === 'READY') {
          if ((msg.v ?? 0) !== PROTOCOL_VERSION) {
            this.callbacks.onError(
              `Version mismatch — opponent's build speaks protocol v${msg.v ?? 0}, this one v${PROTOCOL_VERSION}. Both players need the same app version.`);
            conn.close(); // refuse: playing across schema versions desyncs/crashes mid-game
            return;
          }
          this.callbacks.onOpponentJoined({ name: msg.name, avatar: msg.avatar, status: 'ready', deck: msg.deck });
          return;
        }
        if (msg.type === 'STATE_SYNC') this.recvSeq = msg.seq ?? this.recvSeq + 1;
        this.callbacks.onMessage(msg);
      } catch (e) {
        console.warn('[mp] dropped malformed message', e, raw);
      }
    });

    conn.on('close', () => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.callbacks.onStatusChange('disconnected');
      this.callbacks.onDisconnect();
    });

    conn.on('error', (err) => {
      this.callbacks.onError(String(err));
    });
  }
}
