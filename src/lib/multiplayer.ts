import Peer, { type DataConnection } from 'peerjs';
import type { GameState } from '../store/gameStore';

// ─── Message protocol ─────────────────────────────────────────────────────────
// Multiplayer is authoritative state-sync: the mutating peer broadcasts its full
// `game`, the receiver applies it. (The old per-action replay protocol was removed.)
export type NetworkMessage =
  | { type: 'STATE_SYNC'; state: GameState }
  | { type: 'READY';      name: string; avatar: string }
  | { type: 'PING';       ts: number }
  | { type: 'PONG';       ts: number; origTs: number };

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
  private callbacks: MultiplayerCallbacks;
  public code = '';
  public isHost = false;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  /** HOST: create a peer and wait for a connection. */
  async host(playerName: string, avatarLetter: string): Promise<string> {
    this.isHost = true;
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

  /** GUEST: connect to a host using their code. */
  async join(code: string, playerName: string, avatarLetter: string): Promise<void> {
    this.isHost = false;
    this.code = code;
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
    this.send({ type: 'STATE_SYNC', state });
  }

  destroy() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
    this.code = '';
  }

  private _wireConn(conn: DataConnection, name: string, avatar: string) {
    conn.on('open', () => {
      // Announce ourselves
      this.send({ type: 'READY', name, avatar });
      this.callbacks.onStatusChange('connected');
      // Start ping loop
      this.pingInterval = setInterval(() => {
        this.pendingPing = Date.now();
        this.send({ type: 'PING', ts: this.pendingPing });
      }, 3000);
    });

    conn.on('data', (raw) => {
      try {
        const msg = JSON.parse(raw as string) as NetworkMessage;
        if (msg.type === 'PING') {
          this.send({ type: 'PONG', ts: Date.now(), origTs: msg.ts });
          return;
        }
        if (msg.type === 'PONG') {
          if (this.pendingPing) {
            const latency = Math.round((Date.now() - this.pendingPing) / 2);
            this.callbacks.onLatency(latency);
            this.pendingPing = null;
          }
          return;
        }
        if (msg.type === 'READY') {
          this.callbacks.onOpponentJoined({ name: msg.name, avatar: msg.avatar, status: 'ready' });
          return;
        }
        this.callbacks.onMessage(msg);
      } catch {
        // ignore malformed messages
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
