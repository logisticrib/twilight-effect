import { type CSSProperties } from 'react';
import { CardFace, CardBack } from '../../components/CardFace';
import { TBL, CLASSCLR, GLYPH } from '../../tokens';
import { useGameStore, seatName, type PlayerState, type ClassZoneCard } from '../../store/gameStore';
import { handlePreviewWheel } from './previewScroll';
import { btnProps } from '../../lib/a11y';

const PILE_SCALE = 0.2;  // mini card-pile size in the CZ panel (40×56)

// ─── Shared CZ card slot renderer ─────────────────────────────────────────────
function CzSlot({ cz, who, i }: { cz: ClassZoneCard | undefined; who: string; i: number }) {
  const setHovered = useGameStore(s => s.setHovered);
  if (!cz) {
    return (
      <div key={`cz-empty-${i}`} style={{
        width: 46, height: 64, borderRadius: 4, flexShrink: 0,
        border: `1px dashed ${TBL.matLine}`,
        background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0 4px, transparent 4px 8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: TBL.ink4, fontSize: 11,
      }} title="Empty Class Zone slot">·</div>
    );
  }
  const clr = CLASSCLR[cz.cls] ?? TBL.ink3;
  const cardType = cz.cardData?.type ?? '';
  const cardLevel = cz.cardData?.level ?? null;
  // A face-down card = a spent Special Action. Keep it identifiable (glyph + name)
  // but clearly "spent": muted class tint, dashed border, desaturated, with a SPENT tag.
  return (
    <div
      onMouseEnter={() => { if (cz.cardData) setHovered({ data: cz.cardData, owner: who }); }}
      onMouseLeave={() => setHovered(null)}
      onWheel={handlePreviewWheel}
      style={{
        position: 'relative',
        width: 46, height: 64, borderRadius: 4, flexShrink: 0,
        background: cz.faceDown ? `linear-gradient(180deg, ${clr}66, ${clr}22)` : `linear-gradient(180deg, ${clr}cc, ${clr}44)`,
        border: `1px ${cz.faceDown ? 'dashed' : 'solid'} ${cz.faceDown ? `${clr}aa` : clr}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        color: '#fff',
        opacity: cz.faceDown ? 0.9 : 1,
        filter: cz.faceDown ? 'grayscale(0.45)' : 'none',
        cursor: cz.cardData ? 'pointer' : 'default',
        overflow: 'hidden', padding: '5px 3px 4px',
        transition: 'border-color .12s',
      }}>
      <span style={{ fontFamily: "'Newsreader', serif", fontSize: 16, lineHeight: 1, opacity: cz.faceDown ? 0.7 : 1 }}>
        {GLYPH[cz.cls] ?? '◆'}
      </span>
      <span style={{
        fontFamily: "'Newsreader', serif", fontSize: 8, lineHeight: 1.25,
        color: '#fff', textAlign: 'center',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', width: '100%',
      }}>{cz.name}</span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 6, lineHeight: 1,
        color: cz.faceDown ? TBL.amber2 : `${clr}ff`, letterSpacing: '0.04em', textTransform: 'uppercase',
        textAlign: 'center', width: '100%',
      }}>{cz.faceDown ? '✓ spent' : `${cardType}${cardLevel ? ` · L${cardLevel}` : ''}`}</span>
    </div>
  );
}

// ─── Stats content: player identity + HP + WP (no outer panel chrome) ─────────
interface StatsPanelProps {
  player: PlayerState;
  who: 'p1' | 'p2';
  active: boolean;
}

function StatsContent({ player, who, active }: StatsPanelProps) {
  const localPlayer = useGameStore(s => s.localPlayer);
  const isYou = who === localPlayer;
  const color = isYou ? TBL.violet : TBL.amber;
  // The PC entity is the single source of truth for the player's HP (combat damages
  // it, class bonuses adjust it). It's on the board after placement, else stashed in
  // _pc; fall back to the PlayerState headline before the PC exists.
  const pcEnt = Object.values(player.board).find(e => e?.kind === 'pc') ?? player._pc;
  const hp = pcEnt ? pcEnt.hp : player.hp;
  const maxHp = pcEnt ? pcEnt.maxHp : player.maxHp;
  const low = maxHp > 0 && hp / maxHp < 0.4;
  const displayName = seatName(who, localPlayer);
  const avatarLetter = displayName[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Avatar + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: `linear-gradient(135deg, ${color}, ${color}88)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: "'Newsreader', serif", fontSize: 16, fontWeight: 600,
          boxShadow: active ? `0 0 0 2px ${TBL.amber}, 0 0 10px ${TBL.amber}55` : '0 0 0 1px rgba(255,255,255,0.1)',
        }}>{avatarLetter}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 13, fontWeight: 600, color: TBL.ink, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: active ? TBL.amber2 : TBL.ink3, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
            {active ? '● Active' : 'Waiting'}
          </div>
        </div>
      </div>

      {/* HP medallion */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
          background: low
            ? 'radial-gradient(circle at 38% 32%, #ffd2d2, #7a1f1c)'
            : 'radial-gradient(circle at 38% 32%, #ffe9c2, #8a5a1e)',
          border: '2px solid #ffffffcc',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: low ? '0 0 14px rgba(224,106,106,0.5), 0 2px 6px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{hp}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#ffffffcc', marginTop: 1 }}>/{maxHp}</div>
        </div>
        {/* WP pips column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: TBL.ink3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>WP</span>
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i < player.willpower ? TBL.violet : 'transparent',
                border: `1px solid ${i < player.willpower ? TBL.violet : TBL.ink4}`,
                boxShadow: i < player.willpower ? `0 0 5px ${TBL.violet}` : 'none',
              }} />
            ))}
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: TBL.ink3 }}>{player.willpower}/5</span>
        </div>
      </div>

    </div>
  );
}

// ─── Class-zone content: CZ slots + deck/dead piles (no outer panel chrome) ───
interface CZPanelProps {
  player: PlayerState;
  who: 'p1' | 'p2';
}

function CZContent({ player, who }: CZPanelProps) {
  const game        = useGameStore(s => s.game);
  const localPlayer = useGameStore(s => s.localPlayer);
  const openPile    = useGameStore(s => s.openPile);
  const isYou = who === localPlayer;
  const handN = isYou ? player.hand.length : (player.handCount ?? player.hand.length);
  const topDead = player.dead[player.dead.length - 1] ?? null;
  const pileW = 200 * PILE_SCALE, pileH = 280 * PILE_SCALE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* CZ label */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: TBL.ink3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Class Zone · {player.willpower}/{player.classZone.length}
        {game.currentPhase === 'cz' && game.czExchangeUsed && ' · used'}
      </div>

      {/* 5 CZ slots */}
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <CzSlot key={i} cz={player.classZone[i]} who={who} i={i} />
        ))}
      </div>

      {/* Deck / Dead visual piles */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
        {/* Deck — face-down, not searchable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
          <span style={pileLabel}>Deck</span>
          <div style={{ position: 'relative', width: pileW, height: pileH }} title={`${player.deck.length} cards in deck`}>
            {player.deck.length > 0 ? (
              <CardBack scale={PILE_SCALE} />
            ) : (
              <div style={emptyPileStyle} />
            )}
            <span style={countBadge}>{player.deck.length}</span>
          </div>
        </div>

        {/* Dead Zone — click to browse/search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
          <span style={pileLabel}>Dead ⌕</span>
          <div
            {...btnProps(() => openPile(who, 'dead'))}
            title={`Click to search ${seatName(who, localPlayer) === 'You' ? 'your' : "the opponent's"} Dead Zone (${player.dead.length})`}
            style={{
              position: 'relative', width: pileW, height: pileH, cursor: 'pointer',
              filter: topDead ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' : 'none',
              transition: 'transform .12s',
            }}
          >
            {topDead ? (
              <CardFace data={topDead} scale={PILE_SCALE} />
            ) : (
              <div style={{ ...emptyPileStyle, cursor: 'pointer' }} />
            )}
            <span style={countBadge}>{player.dead.length}</span>
          </div>
        </div>

        {!isYou && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: TBL.ink3, textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center' }}>
            Hand<br />{handN}
          </span>
        )}
      </div>
    </div>
  );
}

const pileLabel: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: TBL.ink3,
  textTransform: 'uppercase', letterSpacing: '0.1em',
};
const countBadge: CSSProperties = {
  position: 'absolute', bottom: -2, right: -6, zIndex: 2,
  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
  color: '#1a1208', background: TBL.amber, borderRadius: 8,
  padding: '1px 6px', minWidth: 12, textAlign: 'center',
  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
};
const emptyPileStyle: CSSProperties = {
  width: '100%', height: '100%', borderRadius: 7,
  border: `1px dashed ${TBL.matLine}`,
  background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.16) 0 5px, transparent 5px 10px)',
};

// ─── Combined left panel: Stats (top) + Class Zone (bottom) in one panel ──────
export function SidePanel({ player, who, active }: StatsPanelProps) {
  return (
    <div style={{
      width: 320, flexShrink: 0,
      alignSelf: 'flex-start',
      display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px',
      borderRadius: 10,
      background: active ? 'rgba(214,160,80,0.06)' : 'rgba(0,0,0,0.20)',
      border: `1px solid ${active ? TBL.matLine2 : TBL.matLine}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    }}>
      <StatsContent player={player} who={who} active={active} />
      <div style={{ height: 1, background: TBL.matLine, margin: '2px 0' }} />
      <CZContent player={player} who={who} />
    </div>
  );
}

// ─── Legacy Tray (kept for compatibility) ─────────────────────────────────────
export function Tray({ player, who, active }: { player: PlayerState; who: 'p1' | 'p2'; active: boolean }) {
  return <SidePanel player={player} who={who} active={active} />;
}
