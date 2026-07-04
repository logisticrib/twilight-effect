import { useEffect, useRef, useCallback } from 'react';
import { MultiplayerSession, type NetworkMessage } from './multiplayer';
import { useGameStore, reactiveHold } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { CATALOG } from '../data/catalog';
import type { Card } from '../types/card';

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
  // The hold source whose ARMING snapshot has already been sent (or was received from
  // the peer). The snapshot that arms an opponent-owned prompt is how the owner learns
  // the prompt exists — it must go out; only the traffic AFTER it is suppressed.
  const armedHoldRef = useRef<string | null>(null);
  // Unsubscribe handle for the game-state broadcast subscription.
  const unsubGameRef = useRef<(() => void) | null>(null);
  // Host-only: our own deck, retained so we can assemble the authoritative game from BOTH
  // real decks once the guest announces theirs (READY handshake). `isHostRef` gates the
  // assemble/refuse logic in onOpponentJoined (the guest also receives the host's READY).
  const hostDeckRef = useRef<Card[]>([]);
  const isHostRef = useRef(false);
  // Actions only, selected individually (stable references) — a whole-store
  // subscription here would re-render Play(), the root of every play view, on
  // every store change (including each hover).
  const setBroadcast     = useGameStore(s => s.setBroadcast);
  const clearBroadcast   = useGameStore(s => s.clearBroadcast);
  const setConn          = useGameStore(s => s.setConn);
  const backToLobby      = useGameStore(s => s.backToLobby);
  const startMultiplayer = useGameStore(s => s.startMultiplayer);
  const assembleMpGame   = useGameStore(s => s.assembleMpGame);
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
        // EXCEPTION: the snapshot that ARMS the prompt is sent exactly once — the
        // owner only learns their prompt exists from that snapshot (suppressing it
        // deadlocked the match: owner never prompted, armer held forever).
        const hold = reactiveHold(g, useGameStore.getState().localPlayer);
        if (hold) {
          if (armedHoldRef.current === hold) return;
          armedHoldRef.current = hold;
          session.sendStateSync(g);
          return;
        }
        armedHoldRef.current = null;
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
          // HOST: assemble the authoritative game from BOTH real decks now that we know the
          // guest's. Resolve their announced ids against the shared CATALOG. The guest also
          // receives the host's (deckless) READY here, but never assembles (isHostRef false).
          if (isHostRef.current) {
            const ids = peer.deck ?? [];
            const guestCards = ids
              .map(id => CATALOG.find(c => c.id === id))
              .filter((c): c is Card => !!c);
            // Refuse rather than silently substitute a deck. Reject on: no/empty deck, any id
            // that doesn't resolve, or DUPLICATE ids — unique card ids are an engine invariant
            // (id-keyed dead picks, equips, targeting) and the wire is a second entry path.
            const dupes = new Set(ids).size !== ids.length;
            if (ids.length === 0 || guestCards.length !== ids.length || dupes) {
              sessionRef.current?.rejectOpponent(
                `${peer.name}'s deck couldn't be read — they need the same app version and a valid deck. Still hosting; ask them to rejoin.`);
              pushToast(`Rejected ${peer.name}: invalid deck`);
              return; // seat stays empty — keep hosting on the same code
            }
            assembleMpGame(hostDeckRef.current, guestCards); // broadcasts via the game subscription
          }
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
            // Re-derive the hold marker from the applied state: a received snapshot
            // that still carries the prompt was sent by its owner (no re-send needed);
            // a resolved snapshot clears the marker so the next same-named arm sends.
            armedHoldRef.current = reactiveHold(st, useGameStore.getState().localPlayer);
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
  }, [clearBroadcast, setConn, pushToast, assembleMpGame]);

  /** HOST: generate a code and wait. Returns the 6-char code. `oppCards` is a fallback used
   *  ONLY for the provisional (Matching-screen) game — a hosted match always replaces p2 with
   *  the guest's real deck (or refuses), so `oppCards` never reaches live play. */
  const host = useCallback(async (myCards: Card[], oppCards: Card[]): Promise<string> => {
    const session = getSession();
    isHostRef.current = true;
    hostDeckRef.current = myCards; // retained to assemble against the guest's deck later
    const code = await session.host(playerName, avatarLetter);
    syncedRef.current = true; // the host's game IS the authoritative one
    armedHoldRef.current = null;
    startStateSync(session);
    startMultiplayer('host', code, 'p1', myCards, oppCards);
    // NOTE: the initial handoff snapshot is sent by assembleMpGame (in onOpponentJoined) via
    // the game subscription — no separate opponentStatus subscription needed (it would double-send).
    return code;
  }, [getSession, playerName, avatarLetter, startStateSync, startMultiplayer]);

  /** GUEST: connect using the host's code, announcing our own deck (as card ids) so the host
   *  assembles the authoritative game from it. The provisional local game is overwritten by
   *  the host's first STATE_SYNC (syncedRef stays false until then). */
  const join = useCallback(async (code: string, myCards: Card[]): Promise<void> => {
    const session = getSession();
    isHostRef.current = false;
    syncedRef.current = false; // silent until the host's first snapshot arrives
    armedHoldRef.current = null;
    await session.join(code, playerName, avatarLetter, myCards.map(c => c.id));
    startStateSync(session);
    startMultiplayer('join', code, 'p2', myCards, myCards);
  }, [getSession, playerName, avatarLetter, startStateSync, startMultiplayer]);

  /** Tear down the connection and go back to lobby. */
  const disconnect = useCallback(() => {
    unsubGameRef.current?.();
    unsubGameRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    syncedRef.current = true;
    armedHoldRef.current = null;
    isHostRef.current = false;
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
