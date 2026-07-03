import { useEffect, useRef, useCallback } from 'react';
import { MultiplayerSession, type NetworkMessage } from './multiplayer';
import { useGameStore, reactiveHold } from '../store/gameStore';
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
  // False on a GUEST from join() until the host's authoritative first STATE_SYNC has
  // been applied: the guest's independently-shuffled local game must never broadcast
  // over the host's (a click or Escape in that window used to overwrite it).
  const syncedRef = useRef(true);
  // Unsubscribe handle for the game-state broadcast subscription.
  const unsubGameRef = useRef<(() => void) | null>(null);
  // Actions only, selected individually (stable references) — a whole-store
  // subscription here would re-render Play(), the root of every play view, on
  // every store change (including each hover).
  const setBroadcast     = useGameStore(s => s.setBroadcast);
  const clearBroadcast   = useGameStore(s => s.clearBroadcast);
  const setConn          = useGameStore(s => s.setConn);
  const backToLobby      = useGameStore(s => s.backToLobby);
  const startMultiplayer = useGameStore(s => s.startMultiplayer);
  const pushToast        = useGameStore(s => s.pushToast);
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
        if (!syncedRef.current) return; // guest pre-sync window — stay silent
        // While an opponent-owned reactive prompt (armor pick / dead-zone pick /
        // attack choice) is outstanding, do NOT broadcast: our snapshot still carries
        // the unresolved prompt, so it would overwrite their in-flight resolution —
        // re-arming their modal and double-applying the effect. The store-level
        // reactiveHold no-ops the action mutators; THIS is the wire-level gate that
        // covers everything else (selection clicks, modal setGame, future mutators).
        if (reactiveHold(g, useGameStore.getState().localPlayer)) return;
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
            // Never apply a malformed snapshot — a corrupted message (or a build with
            // a different GameState schema slipping past the version check) would
            // otherwise crash mid-game with no diagnostic.
            const st = msg.state;
            if (!st || typeof st !== 'object' || !st.p1 || !st.p2 || !st.activePlayer) {
              console.warn('[mp] dropped malformed STATE_SYNC', st);
              return;
            }
            // Apply the sender's authoritative game state. Preserve our own
            // `selected` (a local UI concern) so an opponent's action does not
            // wipe our current selection. The flag stops us echoing it back.
            applyingRemoteRef.current = true;
            try {
              useGameStore.setState((s) => ({
                game: { ...st, selected: s.game.selected },
              }));
            } finally {
              applyingRemoteRef.current = false;
            }
            syncedRef.current = true; // first host snapshot received — guest may broadcast
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
    syncedRef.current = true; // the host's game IS the authoritative one
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
    syncedRef.current = false; // silent until the host's first snapshot arrives
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
    syncedRef.current = true;
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
