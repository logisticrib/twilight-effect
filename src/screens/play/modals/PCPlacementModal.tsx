import { useEffect, type CSSProperties } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { TBL } from '../../../tokens';

interface Props { onClose: () => void; }

/**
 * Non-blocking floating banner — sits above the board so the player
 * can still click the Back Line slots highlighted in purple.
 */
export function PCPlacementModal({ onClose }: Props) {
  const { game } = useGameStore();

  const p1Done = !game.p1._pc;
  const p2Done = !game.p2._pc;
  const allPlaced = p1Done && p2Done;

  // Must be a useEffect — calling onClose inside render (even via setTimeout)
  // fires twice in React StrictMode and corrupts the modal queue.
  useEffect(() => {
    if (allPlaced) onClose();
  }, [allPlaced, onClose]);

  if (allPlaced) return null;

  const current: 'p1' | 'p2' = !p1Done ? 'p1' : 'p2';
  const playerName = game[current].name;
  const step = !p1Done ? '1 of 2' : '2 of 2';

  const banner: CSSProperties = {
    position: 'fixed',
    top: 52,           // just below the top bar
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 200,       // above the board but below full modals
    pointerEvents: 'none',   // let clicks pass through to the board
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  };

  const pill: CSSProperties = {
    background: 'rgba(18,14,10,0.92)',
    backdropFilter: 'blur(10px)',
    border: `1px solid ${TBL.violet}`,
    borderRadius: 10,
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${TBL.violet}33`,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={banner}>
      <div style={pill}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: `linear-gradient(135deg, ${TBL.violet}, ${TBL.violet}88)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: "'Newsreader', serif", fontSize: 14, fontWeight: 700,
          flexShrink: 0,
        }}>
          {current === 'p1' ? '1' : '2'}
        </div>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.amber2, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 2 }}>
            Setup · PC Placement · {step}
          </div>
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 15, color: TBL.ink, fontWeight: 600 }}>
            {playerName} — click a <span style={{ color: TBL.violet }}>Back Line ★ slot</span> to place your Player Character
          </div>
        </div>
        {!p1Done && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink3, letterSpacing: '0.08em' }}>
            P2 places next
          </div>
        )}
      </div>
    </div>
  );
}
