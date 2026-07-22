// Multiplayer hold banner: whoever does NOT own a live reactive prompt waits while
// the owner resolves it. SINGLE GATE (lesson 2026-07-20 — a UI-side copy of an engine
// rule is a divergence time bomb): the banner derives from the SAME reactiveHold()
// the reducers and the wire-suppression consult, so it covers every hold kind
// automatically. The old hand-enumerated copy in Play.tsx listed 4 of the 9 holds —
// trigger ordering, deck peeks, Coercion, attack choice, and the ownEnter stack head
// showed NO banner (found in the live two-peer MP pass, 2026-07-21).
// Sandbox needs no banner — the prompt's own modal already covers the board for the
// single controller.
import { useGameStore, reactiveHold } from '../../store/gameStore';
import { TBL, Z } from '../../tokens';

export function ReactiveHoldBanner() {
  const source = useGameStore(s => reactiveHold(s.game, s.localPlayer));
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  if (isSolo || !source) return null;
  return (
    <div style={{
      position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: Z.holdBanner,
      background: 'rgba(18,14,10,0.96)', border: `1px solid ${TBL.amber}`, borderRadius: 10,
      padding: '10px 20px', boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${TBL.amber}33`,
      fontFamily: "'Newsreader', serif", fontSize: 15, color: TBL.ink, whiteSpace: 'nowrap',
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.amber2, letterSpacing: '0.18em', textTransform: 'uppercase', marginRight: 10 }}>
        Hold
      </span>
      Waiting for the opponent to resolve {source}…
    </div>
  );
}
