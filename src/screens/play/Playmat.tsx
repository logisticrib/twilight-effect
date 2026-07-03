import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { CardFace, BASE_H } from '../../components/CardFace';
import { SidePanel } from './Tray';
import { CommandZone } from './CommandZone';
import { HandFan } from './HandFan';
import { LoadoutPanel } from './LoadoutPanel';
import { CZExchangePanel } from './CZExchangePanel';
import { useGameStore } from '../../store/gameStore';
import { previewScrollRef } from './previewScroll';
import { TBL, Z } from '../../tokens';

const SIDE_SLOT_W = 320;  // right-column width — matches the combined left SidePanel
const LOADOUT_W = 440;    // local-row loadout/control panel width (wider, intentionally asymmetric)

// ─── Hover preview pane (sits in the opponent's freed right space) ────────────
// Retains the LAST hovered card (ignores the clear) so the mouse can move onto the
// preview and scroll its rules text (scrollText) without the card vanishing first.
function PreviewPane() {
  const hovered = useGameStore(s => s.hovered);
  const [shown, setShown] = useState(hovered);
  useEffect(() => { if (hovered) setShown(hovered); }, [hovered]);
  // Register the preview textbox so hovering a source card + wheel scrolls it here.
  const setTextboxRef = useCallback((el: HTMLDivElement | null) => { previewScrollRef.current = el; }, []);
  // New card → reset scroll to the top.
  useEffect(() => { if (previewScrollRef.current) previewScrollRef.current.scrollTop = 0; }, [shown]);
  return (
    <div style={{
      width: SIDE_SLOT_W, flexShrink: 0, alignSelf: 'stretch',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {shown ? (
        <CardFace data={shown.data} scale={0.97} scrollText upright textboxRef={setTextboxRef} />
      ) : (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink4,
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>Hover a card</span>
      )}
    </div>
  );
}

const HAND_H = 175;  // dedicated hand zone — keep in sync with ZONE_H in HandFan.tsx
const DIVIDER_H = 32; // horizontal encounter divider between the two boards
// The center line sits lower than halfway: the opponent (top) row is taller so its stat/CZ
// panel fits above the divider; the local (bottom) row is shorter but its panels extend down
// into the empty hand band (like the loadout).
const OPP_ROW_FLEX = 1.18;
const LOCAL_ROW_FLEX = 0.82;

// ─── Toast stack ──────────────────────────────────────────────────────────────
function Toasts() {
  const toasts = useGameStore(s => s.toasts);
  return (
    <div style={{
      position: 'absolute', bottom: 200, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
      pointerEvents: 'none', zIndex: Z.toast,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: 'rgba(18,14,10,0.9)', backdropFilter: 'blur(8px)',
          border: `1px solid ${TBL.matLine2}`, borderRadius: 7,
          padding: '7px 14px',
          fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: TBL.ink,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          animation: 'fadeSlideIn .2s ease',
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Playmat ──────────────────────────────────────────────────────────────────
export function Playmat() {
  const { game } = useGameStore();
  const matRef = useRef<HTMLDivElement>(null);
  const bsRef = useRef(0.52);
  const rafRef = useRef(0);
  const [boardScale, setBoardScale] = useState(0.52);

  const fit = useCallback(() => {
    const mat = matRef.current;
    if (!mat) return;
    // Available height for both boards (excluding hand fan)
    const H = mat.clientHeight - HAND_H - 8;
    // Rows split unevenly (opponent taller); size cards to the SMALLER (local) row so they fit.
    const localRowH = (H - DIVIDER_H - 16) * (LOCAL_ROW_FLEX / (OPP_ROW_FLEX + LOCAL_ROW_FLEX));
    // Two card rows (Front + Back) per player with 8px gap
    const slotH = (localRowH - 8) / 2;
    const s = Math.max(0.40, Math.min(slotH / BASE_H, 1.1));
    if (Math.abs(s - bsRef.current) > 0.005) {
      bsRef.current = s;
      setBoardScale(s);
    }
  }, []);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(fit);
    });
    if (matRef.current) ro.observe(matRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, [fit]);

  const lp = useGameStore.getState().localPlayer;
  const oppPlayer = lp === 'p1' ? 'p2' : 'p1';
  const localActive = game.activePlayer === lp;

  return (
    <div ref={matRef} style={{
      flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
      background: `
        radial-gradient(ellipse 80% 60% at 50% 50%, ${TBL.matGlow}, transparent 70%),
        radial-gradient(ellipse at 50% 0%, rgba(0,0,0,0.4), transparent 50%),
        radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.4), transparent 50%),
        repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 7px),
        linear-gradient(160deg, ${TBL.mat2} 0%, ${TBL.mat1} 45%, ${TBL.mat0} 100%)`,
    }}>
      <CZExchangePanel key={`cz-${game.turn}-${game.activePlayer}`} />
      <Toasts />
      <HandFan />

      {/* Board area: opponent above, local below; info panels flank each board */}
      <div style={{
        position: 'absolute', inset: 0, bottom: HAND_H,
        display: 'flex', flexDirection: 'column', padding: 8, gap: 0,
      }}>

        {/* Opponent row — taller so its stat/CZ panel clears the divider; preview pane on the right */}
        <div style={{ flex: OPP_ROW_FLEX, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: 10 }}>
          <SidePanel player={game[oppPlayer]} who={oppPlayer} active={!localActive} />
          <div style={{ flex: '2 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CommandZone player={game[oppPlayer]} owner={oppPlayer} flip boardScale={boardScale} />
          </div>
          <PreviewPane />
        </div>

        {/* Encounter divider */}
        <div style={{ height: DIVIDER_H, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '0 8px' }}>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${TBL.matLine2}, transparent)` }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: TBL.amber2, letterSpacing: '0.3em', textTransform: 'uppercase', flexShrink: 0 }}>
            ⟡ Encounter ⟡
          </span>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${TBL.matLine2}, transparent)` }} />
        </div>

        {/* Local row — shorter, but both side columns are absolute so the stat/CZ panel (left)
            and loadout (right) extend down into the empty hand band, reaching the screen bottom.
            Width spacers reserve each column so the command zone stays centered. */}
        <div style={{ flex: LOCAL_ROW_FLEX, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: 10, position: 'relative' }}>
          <div style={{ width: 320, flexShrink: 0 }} />
          <div style={{ flex: '2 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CommandZone player={game[lp]} owner={lp} boardScale={boardScale} />
          </div>
          <div style={{ width: LOADOUT_W, flexShrink: 0 }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: -(HAND_H - 8), width: 320 }}>
            <SidePanel player={game[lp]} who={lp} active={localActive} />
          </div>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: -(HAND_H - 8), width: LOADOUT_W }}>
            <LoadoutPanel />
          </div>
        </div>

      </div>
    </div>
  );
}
