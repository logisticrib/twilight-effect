import { useGameStore } from '../../../store/gameStore';
import { TBL } from '../../../tokens';
import { MulliganModal }    from './MulliganModal';
import { ClassBonusModal }  from './ClassBonusModal';
import { OathswornModal }   from './OathswornModal';
import { PCPlacementModal } from './PCPlacementModal';

/** Parse "modalId:player" format → { id, player } */
function parseModalId(raw: string): { id: string; player: 'p1' | 'p2' } {
  const [id, player] = raw.split(':');
  return { id, player: (player === 'p2' ? 'p2' : 'p1') };
}

/** Shown to the peer who is waiting for the opponent to finish a setup step. Only
 *  ever rendered for the non-acting peer, so the actor is always "the opponent"
 *  (the synced player names are perspective-relative "You"/"Opponent", so we must
 *  not show game[player].name here — it reads as "You" on the other client). */
function SetupWaiting({ step }: { step: string }) {
  const label = step === 'mulligan' ? 'mulligan' : step === 'classbonus' ? 'choose class bonuses' : 'place their Player Character';
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.78), rgba(5,4,2,0.92))',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #221b12, #14100a)', border: `1px solid ${TBL.matLine2}`,
        borderRadius: 14, padding: '26px 30px', textAlign: 'center', boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase', marginBottom: 8 }}>
          Setup
        </div>
        <div style={{ fontFamily: "'Newsreader', serif", fontSize: 18, color: TBL.ink }}>
          Waiting for the opponent to {label}…
        </div>
      </div>
    </div>
  );
}

export function ModalHost() {
  const { modalQueue, advanceModal, advanceSetup, game, localPlayer, conn } = useGameStore();
  const isSolo = conn.mode === 'solo';

  // ── Setup sequence (serialized via the synced game.setupQueue) ──────────────
  const setupHead = game.setupQueue[0];
  if (setupHead) {
    const { id, player } = parseModalId(setupHead);
    const owned = isSolo || player === localPlayer;
    if (!owned) return <SetupWaiting step={id} />;
    const isSequence = game.setupQueue.length > 1;
    switch (id) {
      case 'mulligan':
        return <MulliganModal   key={setupHead} player={player} onClose={advanceSetup} isSequence={isSequence} />;
      case 'classbonus':
        return <ClassBonusModal key={setupHead} player={player} onClose={advanceSetup} isSequence={isSequence} />;
      case 'place-pc':
        return <PCPlacementModal key={setupHead} player={player} onClose={advanceSetup} />;
      default:
        return null;
    }
  }

  // ── Mid-game modals (oathsworn) via the local modalQueue ────────────────────
  const raw = modalQueue[0];
  if (!raw) return null;
  const { id } = parseModalId(raw);
  switch (id) {
    case 'oathsworn':
      return <OathswornModal onClose={advanceModal} />;
    default:
      return null;
  }
}
