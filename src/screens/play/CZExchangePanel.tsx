import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { TBL, CLASSCLR, GLYPH, Z } from '../../tokens';

/**
 * Floating panel shown during the Class Zone Exchange phase.
 * The player MUST make a choice (CZ→hand, hand→CZ, or Pass)
 * before the Action phase begins. Any choice auto-advances.
 */
export function CZExchangePanel() {
  const game            = useGameStore(s => s.game);
  const localPlayer     = useGameStore(s => s.localPlayer);
  const czToHand        = useGameStore(s => s.czToHand);
  const handToCz        = useGameStore(s => s.handToCz);
  const completeCzPhase = useGameStore(s => s.completeCzPhase);
  // Must be before any early return — Rules of Hooks
  const [mode, setMode] = useState<'choose' | 'cz-to-hand' | 'hand-to-cz'>('choose');

  const isMyTurn = game.activePlayer === localPlayer;
  // Don't show while the serialized setup sequence (mulligan / classbonus / place-pc) is still running
  if (game.currentPhase !== 'cz' || !isMyTurn || game.setupQueue.length > 0) return null;

  const ps = game[localPlayer];

  // After any choice, complete the CZ phase and move to Action
  const doExchangeCzToHand = (czCardId: string) => {
    czToHand(czCardId);
    completeCzPhase();
  };
  const doExchangeHandToCz = (handCardId: string) => {
    handToCz(handCardId);
    completeCzPhase();
  };
  const doPass = () => completeCzPhase();

  // ── Styles ────────────────────────────────────────────────────────────────
  const panel: CSSProperties = {
    position: 'fixed',
    top: 52,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: Z.overlay,
    background: 'rgba(18,14,10,0.96)',
    backdropFilter: 'blur(12px)',
    border: `1px solid ${TBL.matLine2}`,
    borderRadius: 12,
    padding: '14px 18px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
    minWidth: 340,
    maxWidth: 560,
  };
  const header: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  };
  const eyebrow: CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9, color: TBL.amber2, letterSpacing: '0.18em', textTransform: 'uppercase',
  };
  const title: CSSProperties = {
    fontFamily: "'Newsreader', serif",
    fontSize: 16, color: TBL.ink, fontWeight: 600, marginTop: 2,
  };
  const btnRow: CSSProperties = {
    display: 'flex', gap: 8, marginTop: 10,
  };
  const choiceBtn: CSSProperties = {
    flex: 1, padding: '8px 12px', borderRadius: 7, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
    textAlign: 'center',
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${TBL.matLine2}`,
    color: TBL.ink2,
    transition: 'all .12s',
  };
  const cardPill = (clr: string): CSSProperties => ({
    padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: TBL.ink,
    background: `${clr}18`, border: `1px solid ${clr}55`,
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'background .1s',
    whiteSpace: 'nowrap',
  });
  const sectionLbl: CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9, color: TBL.ink3, letterSpacing: '0.12em', textTransform: 'uppercase',
    marginBottom: 6,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={panel}>
      <div style={header}>
        <div>
          <div style={eyebrow}>Class Zone Exchange Phase</div>
          <div style={title}>
            {mode === 'choose'      && 'Choose an action — or pass'}
            {mode === 'cz-to-hand'  && 'Select a CZ card to return to hand'}
            {mode === 'hand-to-cz'  && 'Select a hand card to add to CZ'}
          </div>
        </div>
      </div>

      {/* ── Mode: Choose ── */}
      {mode === 'choose' && (
        <>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, marginBottom: 10 }}>
            Once per turn you may move one card between your hand and Class Zone — or pass.
            {ps.classZone.length >= 5 && <span style={{ color: TBL.amber2 }}> CZ is full (5/5) — can only move out.</span>}
          </div>
          <div style={btnRow}>
            <div style={choiceBtn}
              onClick={() => setMode('cz-to-hand')}>
              ← CZ → Hand
            </div>
            <div
              style={choiceBtn}
              onClick={() => ps.classZone.length < 5 ? setMode('hand-to-cz') : undefined}
            >
              Hand → CZ →
            </div>
            <div style={choiceBtn} onClick={doPass}>
              Pass
            </div>
          </div>
        </>
      )}

      {/* ── Mode: CZ → Hand ── */}
      {mode === 'cz-to-hand' && (
        <>
          <div style={sectionLbl}>Your Class Zone — click a card to return it to hand</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ps.classZone.map(cz => {
              const clr = CLASSCLR[cz.cls] ?? TBL.ink3;
              const canMove = !cz.faceDown && ps.classZone.length > 1;
              return (
                <div
                  key={cz.id}
                  onClick={() => canMove && doExchangeCzToHand(cz.id)}
                  title={canMove ? `Return ${cz.name} to hand` : cz.faceDown ? 'Spent this turn' : 'Last CZ card — cannot remove'}
                  style={{
                    ...cardPill(clr),
                    opacity: canMove ? 1 : 0.4,
                    cursor: canMove ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{GLYPH[cz.cls] ?? '◆'}</span>
                  <span>{cz.name}</span>
                  {cz.faceDown && <span style={{ color: TBL.ink4, fontSize: 10 }}>spent</span>}
                </div>
              );
            })}
          </div>
          <div style={btnRow}>
            <div style={choiceBtn} onClick={() => setMode('choose')}>← Back</div>
            <div style={choiceBtn} onClick={doPass}>Pass</div>
          </div>
        </>
      )}

      {/* ── Mode: Hand → CZ ── */}
      {mode === 'hand-to-cz' && (
        <>
          <div style={sectionLbl}>
            Your Hand — click a card to add it to your Class Zone
            &nbsp;({ps.classZone.length}/5)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ps.hand.length === 0 && (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink4 }}>
                Hand is empty
              </span>
            )}
            {ps.hand.map(card => {
              const clr = CLASSCLR[card.class1] ?? TBL.ink3;
              return (
                <div
                  key={card.id}
                  onClick={() => doExchangeHandToCz(card.id)}
                  title={`Add ${card.name} to Class Zone`}
                  style={cardPill(clr)}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${clr}30`}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${clr}18`}
                >
                  <span style={{ fontSize: 13 }}>{GLYPH[card.class1] ?? '◆'}</span>
                  <span>{card.name}</span>
                  <span style={{ fontSize: 10, color: TBL.ink3 }}>L{card.level}</span>
                </div>
              );
            })}
          </div>
          <div style={btnRow}>
            <div style={choiceBtn} onClick={() => setMode('choose')}>← Back</div>
            <div style={choiceBtn} onClick={doPass}>Pass</div>
          </div>
        </>
      )}
    </div>
  );
}
