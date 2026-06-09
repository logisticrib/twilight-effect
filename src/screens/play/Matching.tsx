import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useMultiplayer } from '../../lib/useMultiplayer';
import { TBL } from '../../tokens';

export function Matching() {
  const conn = useGameStore(s => s.conn);
  const { playerName, avatarLetter } = useSettingsStore();
  const { disconnect } = useMultiplayer();
  const [copied, setCopied] = useState(false);

  const seatStyle = (filled: boolean, color: string): CSSProperties => ({
    width: 150, height: 196, borderRadius: 14,
    border: `1.5px ${filled ? 'solid' : 'dashed'} ${filled ? color : TBL.matLine2}`,
    background: filled
      ? `radial-gradient(ellipse at 50% 30%, ${color}28, transparent 70%), rgba(0,0,0,0.25)`
      : 'rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: filled ? `0 0 24px ${color}33, inset 0 0 20px rgba(0,0,0,0.4)` : 'inset 0 0 18px rgba(0,0,0,0.4)',
    transition: 'all .3s',
  });
  const avStyle = (color: string): CSSProperties => ({
    width: 60, height: 60, borderRadius: '50%',
    background: `linear-gradient(135deg, ${color}, ${color}88)`, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Newsreader', serif", fontSize: 28, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  });
  const statusStyle = (ready: boolean): CSSProperties => ({
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: ready ? TBL.good : TBL.amber2,
    display: 'flex', alignItems: 'center', gap: 5,
  });

  const opponentJoined = conn.opponentStatus === 'ready';

  const copyLink = () => {
    navigator.clipboard?.writeText(`twilight://join/${conn.code}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      flex: 1, minHeight: 0,
      background: `
        radial-gradient(ellipse 70% 50% at 50% 46%, ${TBL.matGlow}, transparent 70%),
        linear-gradient(160deg, ${TBL.mat2}, ${TBL.mat0})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'rgba(20,16,12,0.8)', backdropFilter: 'blur(12px)',
        border: `1px solid ${TBL.matLine2}`, borderRadius: 12,
        padding: '28px 36px', minWidth: 480,
        display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.amber2, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          {conn.mode === 'host' ? 'Hosting' : 'Joining'} · Invite Code
        </div>

        {/* Invite code */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 600,
          letterSpacing: '0.4em', color: TBL.amber2, padding: '12px 0', textAlign: 'center', width: '100%',
          background: 'rgba(214,160,80,0.06)', border: `1px solid ${TBL.matLine2}`, borderRadius: 6,
        }}>
          {conn.code.split('').join(' ')}
        </div>

        {/* Seats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          {/* Local seat */}
          <div style={seatStyle(true, TBL.violet)}>
            <div style={avStyle(TBL.violet)}>{avatarLetter}</div>
            <div style={{ fontFamily: "'Newsreader', serif", fontSize: 17, color: TBL.ink }}>{playerName}</div>
            <div style={statusStyle(true)}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: TBL.good }} />
              Ready
            </div>
          </div>

          <div style={{ fontFamily: "'Newsreader', serif", fontStyle: 'italic', fontSize: 26, color: TBL.amber2 }}>vs</div>

          {/* Opponent seat */}
          <div style={seatStyle(opponentJoined, TBL.amber)}>
            {opponentJoined ? (
              <>
                <div style={avStyle(TBL.amber)}>{conn.opponentAvatar || '?'}</div>
                <div style={{ fontFamily: "'Newsreader', serif", fontSize: 17, color: TBL.ink }}>{conn.opponentName}</div>
                <div style={statusStyle(true)}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: TBL.good }} />
                  Ready
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'Newsreader', serif", fontSize: 36, color: TBL.ink4 }}>◌</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink3, letterSpacing: '0.16em', textTransform: 'uppercase', textAlign: 'center' }}>
                  Waiting…
                </div>
              </>
            )}
          </div>
        </div>

        {/* Latency */}
        {conn.latency !== null && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.good, letterSpacing: '0.08em' }}>
            ◉ LINK · {conn.latency}ms · STARTING SOON
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
          <button onClick={disconnect} style={{
            padding: '8px 14px', background: 'transparent', color: TBL.ink2,
            border: `1px solid ${TBL.matLine2}`, borderRadius: 5, cursor: 'pointer', fontSize: 12,
            fontFamily: "'Inter', sans-serif",
          }}>
            ← Cancel
          </button>
          {conn.mode === 'host' && (
            <button onClick={copyLink} style={{
              padding: '8px 14px',
              background: 'rgba(214,160,80,0.1)', color: TBL.amber2,
              border: `1px solid ${TBL.amber}`, borderRadius: 5, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif",
            }}>
              {copied ? '✓ Copied' : '⎘ Copy invite link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
