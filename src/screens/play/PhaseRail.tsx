import type { CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { TBL, PHASES } from '../../tokens';

export function PhaseRail() {
  const { game, endTurn, endTurnToEndPhase, advancePhase, backToLobby, conn, localPlayer, switchSides } = useGameStore();
  const isSandbox = conn.mode === 'solo';
  const idx = PHASES.findIndex(p => p.id === game.currentPhase);
  const isMyTurn = game.activePlayer === localPlayer;
  const phase = game.currentPhase;

  // Button label + action per phase
  type BtnConfig = { label: string; hint: string; color: string; action: () => void };
  const btnCfg: BtnConfig = (() => {
    if (!isMyTurn) return { label: 'Waiting', hint: '', color: TBL.ink4, action: () => {} };
    switch (phase) {
      case 'draw':   return { label: 'CZ Phase →',     hint: '',   color: TBL.good,   action: advancePhase };
      case 'cz':     return { label: 'Make a CZ choice ↑', hint: '', color: TBL.ink4, action: () => {} }; // panel handles this phase — button intentionally inert
      case 'action': return { label: 'End Phase →',    hint: '',   color: TBL.amber,  action: endTurnToEndPhase };
      case 'end':    return { label: 'Pass Turn',       hint: '↵', color: TBL.danger, action: endTurn };
      default:       return { label: 'Continue →',     hint: '',   color: TBL.amber,  action: advancePhase };
    }
  })();

  const rail: CSSProperties = {
    height: 40, flexShrink: 0,
    display: 'flex', alignItems: 'center', padding: '0 14px', gap: 14,
    background: 'rgba(0,0,0,0.3)', borderBottom: `1px solid ${TBL.matLine}`,
  };
  const turnPill: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '4px 11px 4px 4px',
    background: 'rgba(214,160,80,0.1)', border: `1px solid ${TBL.matLine2}`, borderRadius: 16,
    fontSize: 11.5, fontWeight: 600, letterSpacing: '0.05em', color: TBL.amber2, textTransform: 'uppercase',
  };
  const turnDot: CSSProperties = {
    width: 22, height: 22, borderRadius: '50%', background: TBL.amber, color: '#1a1208',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Newsreader', serif", fontSize: 13, fontWeight: 700,
  };
  const stepStyle = (s: 'done' | 'current' | 'pending'): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: s === 'current' ? TBL.ink : TBL.ink3, opacity: s === 'pending' ? 0.5 : 1,
  });
  const dotStyle = (s: 'done' | 'current' | 'pending'): CSSProperties => ({
    width: 8, height: 8, borderRadius: '50%',
    background: s === 'current' ? TBL.amber : s === 'done' ? TBL.good : 'transparent',
    border: `1px solid ${s === 'pending' ? TBL.matLine2 : 'transparent'}`,
    boxShadow: s === 'current' ? `0 0 0 3px rgba(214,160,80,0.18)` : 'none',
  });
  const isCzPhase = phase === 'cz' && isMyTurn;
  const btnStyle: CSSProperties = {
    padding: '6px 13px', borderRadius: 5, border: 'none',
    cursor: isCzPhase ? 'not-allowed' : isMyTurn ? 'pointer' : 'not-allowed',
    background: btnCfg.color, color: isCzPhase ? TBL.ink3 : '#1a1208',
    fontSize: 12, fontWeight: 600, opacity: (isMyTurn && !isCzPhase) ? 1 : 0.4,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
  };
  const connBadge: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10, letterSpacing: '0.08em', color: TBL.ink3,
    padding: '3px 9px', border: `1px solid ${TBL.matLine}`, borderRadius: 4,
  };
  const leaveBtn: CSSProperties = {
    width: 27, height: 27, borderRadius: 4,
    background: 'rgba(255,255,255,0.03)', border: `1px solid ${TBL.matLine2}`,
    color: TBL.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 12,
  };

  return (
    <div style={rail}>
      <div style={turnPill}>
        <div style={turnDot}>{game.turn}</div>
        <span>{isMyTurn ? 'Your turn' : `${game[game.activePlayer].name}'s turn`}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {PHASES.map((p, i) => {
          const s: 'done' | 'current' | 'pending' = i < idx ? 'done' : i === idx ? 'current' : 'pending';
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={stepStyle(s)}>
                <div style={dotStyle(s)} />
                <span>{p.label}</span>
              </div>
              {i < PHASES.length - 1 && <span style={{ color: TBL.matLine2, fontSize: 11 }}>›</span>}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Sandbox: switch which side you're controlling */}
      {isSandbox && (
        <button onClick={switchSides} title="Control the other player's side" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          background: 'rgba(138,122,214,0.12)', color: TBL.violet,
          border: `1px solid ${TBL.violet}66`,
        }}>
          ⇄ {localPlayer === 'p1' ? game.p2.name : game.p1.name}
        </button>
      )}

      <div style={connBadge}>
        {conn.mode === 'solo' ? '◐ SANDBOX' : `◉ ${conn.code} · ${conn.latency}ms`}
      </div>
      <div style={leaveBtn} onClick={backToLobby} title="Leave match">⏻</div>
      <button style={btnStyle} onClick={btnCfg.action}>
        {btnCfg.label}
        {btnCfg.hint && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{btnCfg.hint}</span>}
      </button>
    </div>
  );
}
