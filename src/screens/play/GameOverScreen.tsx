import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useGameStore, seatName } from '../../store/gameStore';
import { recorder } from '../../replay/recorder';
import { downloadReplay } from '../../replay/download';
import { TBL, Z } from '../../tokens';

/**
 * Full-screen victory/defeat overlay. Shown when `game.gameOver` (the winning SIDE,
 * 'p1' | 'p2') is set. Closes the play loop that previously only fired a toast.
 *
 * No `backdropFilter: blur` here — it hangs the preview screenshot/eval tooling
 * on full-screen overlays (see project notes).
 */
export function GameOverScreen() {
  const winnerSide = useGameStore(s => s.game.gameOver);
  const game = useGameStore(s => s.game);
  const localPlayer = useGameStore(s => s.localPlayer);
  const backToLobby = useGameStore(s => s.backToLobby);
  const rec = useSyncExternalStore(recorder.subscribe, recorder.getStatus, recorder.getStatus);
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!winnerSide || dismissed) return null;

  const localWon = winnerSide === localPlayer;

  const survivors = (side: 'p1' | 'p2') =>
    Object.values(game[side].board).filter(Boolean).length;

  const accent = localWon ? TBL.amber2 : TBL.danger;

  return (
    <div style={S.scrim}>
      <div style={{ ...S.panel, borderColor: `${accent}55` }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.eyebrow, color: accent }}>
          {localWon ? '✦ Victory ✦' : 'Defeat'}
        </div>
        <div style={S.title}>{seatName(winnerSide, localPlayer)} {localWon ? 'win' : 'wins'}</div>
        <div style={S.sub}>
          Claimed the encounter on turn {game.turn}.
        </div>

        <div style={S.stats}>
          <Stat label={seatName('p1', localPlayer)} value={`${survivors('p1')} left`} hi={winnerSide === 'p1'} />
          <div style={S.statDiv} />
          <Stat label={seatName('p2', localPlayer)} value={`${survivors('p2')} left`} hi={winnerSide === 'p2'} />
        </div>

        <div style={S.row}>
          <button style={S.btnPrimary} onClick={backToLobby}>Back to Lobby</button>
          <button style={S.btnGhost} onClick={() => setDismissed(true)}>Review board</button>
        </div>

        {rec.recording && (
          <button
            onClick={() => { if (rec.valid && downloadReplay()) setSaved(true); }}
            disabled={!rec.valid}
            title={rec.valid
              ? 'Save this game as a .replay.json regression fixture'
              : `Recording invalidated — ${rec.reason ?? 'state changed outside a recorded action'}`}
            style={{ ...S.replayBtn, ...(rec.valid ? {} : S.replayBtnBad) }}
          >
            {rec.valid
              ? (saved ? '✓ Replay saved' : `⭳ Download replay (${rec.steps} actions)`)
              : '⚠ Replay invalidated — cannot save'}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hi }: { label: string; value: string; hi: boolean }) {
  return (
    <div style={S.stat}>
      <div style={{ ...S.statLabel, color: hi ? TBL.amber2 : TBL.ink3 }}>{label}</div>
      <div style={{ ...S.statValue, color: hi ? TBL.ink : TBL.ink2 }}>{value}</div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  scrim: {
    position: 'fixed', inset: 0, zIndex: Z.gameOver,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.82), rgba(5,4,2,0.94))',
  },
  panel: {
    width: 'min(440px, 92vw)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '36px 32px 28px', textAlign: 'center',
    background: 'linear-gradient(180deg, #221b12, #14100a)',
    border: '1px solid', borderRadius: 16,
    boxShadow: '0 30px 90px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  eyebrow: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600,
  },
  title: {
    fontFamily: "'Newsreader', serif", fontSize: 34, fontWeight: 600,
    color: TBL.ink, lineHeight: 1.1, marginTop: 12,
  },
  sub: {
    fontFamily: "'Inter', sans-serif", fontSize: 13, color: TBL.ink2,
    marginTop: 8,
  },
  stats: {
    display: 'flex', alignItems: 'stretch', gap: 14,
    margin: '26px 0 28px', width: '100%', justifyContent: 'center',
  },
  stat: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  statDiv: { width: 1, background: TBL.matLine },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  statValue: { fontFamily: "'Newsreader', serif", fontSize: 18 },
  row: { display: 'flex', gap: 10, width: '100%' },
  btnPrimary: {
    flex: 1, padding: '11px 16px', borderRadius: 8, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
    background: TBL.amber, color: '#1a1208', border: `1px solid ${TBL.amber}`,
  },
  btnGhost: {
    flex: 1, padding: '11px 16px', borderRadius: 8, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
    background: 'rgba(255,255,255,0.05)', color: TBL.ink,
    border: `1px solid ${TBL.matLine2}`,
  },
  replayBtn: {
    marginTop: 12, width: '100%', padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.05em',
    background: 'rgba(214,160,80,0.08)', color: TBL.amber2, border: `1px solid ${TBL.matLine2}`,
  },
  replayBtnBad: {
    cursor: 'not-allowed', background: 'rgba(40,18,14,0.5)', color: TBL.danger,
    border: `1px solid ${TBL.danger}55`,
  },
};
