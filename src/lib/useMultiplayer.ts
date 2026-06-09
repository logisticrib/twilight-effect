import { useEffect, useRef, useCallback } from 'react';
import { MultiplayerSession, type NetworkMessage } from './multiplayer';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Hook that manages the PeerJS session lifecycle and wires it
 * to the game store's broadcast/receive system.
 */
export function useMultiplayer() {
  const sessionRef = useRef<MultiplayerSession | null>(null);
  // True while we are applying a remote STATE_SYNC, so the game subscription
  // does not echo that state straight back to the sender (infinite loop).
  const applyingRemoteRef = useRef(false);
  // Unsubscribe handle for the game-state broadcast subscription.
  const unsubGameRef = useRef<(() => void) | null>(null);
  const {
    setBroadcast, clearBroadcast,
    setConn, backToLobby, startMultiplayer,
    pushToast,
  } = useGameStore();
  const { playerName, avatarLetter } = useSettingsStore();

  /**
   * Begin broadcasting our resulting game state after every local mutation.
   * The game is strictly turn-based, so whoever just mutated is authoritative
   * for that change — this keeps both peers byte-identical without re-deriving
   * actions on the receiver (which is what used to desync).
   */
  const startStateSync = useCallback((session: MultiplayerSession) => {
    unsubGameRef.current?.();
    unsubGameRef.current = useGameStore.subscribe(
      (s) => s.game,
      (g) => {
        if (applyingRemoteRef.current) return;
        session.sendStateSync(g);
      }
    );
    // Keep `_broadcast` truthy so the store's "am I in multiplayer?" checks
    // (e.g. backToLobby) still fire. The per-action payload is ignored now —
    // state syncing is handled by the subscription above.
    setBroadcast(() => {});
  }, [setBroadcast]);

  const getSession = useCallback((): MultiplayerSession => {
    if (!sessionRef.current) {
      sessionRef.current = new MultiplayerSession({
        onStatusChange: (status) => {
          if (status === 'disconnected') {
            pushToast('Opponent disconnected');
            clearBroadcast();
          }
        },
        onOpponentJoined: (peer) => {
          setConn({ opponentName: peer.name, opponentAvatar: peer.avatar, opponentStatus: 'ready' });
          pushToast(`${peer.name} joined the table`);
        },
        onMessage: (msg: NetworkMessage) => {
          if (msg.type === 'STATE_SYNC') {
            // Apply the sender's authoritative game state. Preserve our own
            // `selected` (a local UI concern) so an opponent's action does not
            // wipe our current selection. The flag stops us echoing it back.
            applyingRemoteRef.current = true;
            try {
              useGameStore.setState((s) => ({
                game: { ...msg.state, selected: s.game.selected },
              }));
            } finally {
              applyingRemoteRef.current = false;
            }
          }
        },
        onLatency: (ms) => setConn({ latency: ms }),
        onDisconnect: () => {
          clearBroadcast();
          setConn({ opponentStatus: 'waiting', latency: null });
        },
        onError: (err) => pushToast(`Connection error: ${err}`),
      });
    }
    return sessionRef.current!;
  }, [clearBroadcast, setConn, pushToast]);

  /** HOST: generate a code and wait. Returns the 6-char code. */
  const host = useCallback(async (p1Cards: import('../types/card').Card[], p2Cards: import('../types/card').Card[]): Promise<string> => {
    const session = getSession();
    const code = await session.host(playerName, avatarLetter);
    startStateSync(session);
    startMultiplayer('host', code, 'p1', p1Cards, p2Cards);
    // When opponent connects and is ready, send them the current game state
    const unsubOpponent = useGameStore.subscribe(
      s => s.conn.opponentStatus,
      (status) => {
        if (status === 'ready') {
          session.sendStateSync(useGameStore.getState().game);
          unsubOpponent();
        }
      }
    );
    return code;
  }, [getSession, playerName, avatarLetter, startStateSync, startMultiplayer]);

  /** GUEST: connect using the host's code. */
  const join = useCallback(async (code: string, p1Cards: import('../types/card').Card[], p2Cards: import('../types/card').Card[]): Promise<void> => {
    const session = getSession();
    await session.join(code, playerName, avatarLetter);
    startStateSync(session);
    startMultiplayer('join', code, 'p2', p1Cards, p2Cards);
  }, [getSession, playerName, avatarLetter, startStateSync, startMultiplayer]);

  /** Tear down the connection and go back to lobby. */
  const disconnect = useCallback(() => {
    unsubGameRef.current?.();
    unsubGameRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    clearBroadcast();
    backToLobby();
  }, [clearBroadcast, backToLobby]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      unsubGameRef.current?.();
      unsubGameRef.current = null;
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, []);

  return { host, join, disconnect };
}
