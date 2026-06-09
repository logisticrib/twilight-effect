import { useState } from 'react';
import { CardFace, BASE_W } from '../../components/CardFace';
import { useGameStore } from '../../store/gameStore';
import { canPlayActionCard, playWillpower } from '../../store/keywords';
import { handlePreviewWheel } from './previewScroll';
import { TBL } from '../../tokens';

const HAND_SCALE = 0.54;
const CARD_W = BASE_W * HAND_SCALE;
const CARD_H = 280 * HAND_SCALE;           // ~151px — card total height
const ZONE_H = 175;                         // hand zone height — must match HAND_H in Playmat
const OVERLAP = CARD_W * 0.42;
const SPREAD_DEG = 14;

export function HandFan() {
  const { game, localPlayer, pendingPlay, beginPlay, setHovered, pushToast } = useGameStore();
  const cards = game[localPlayer].hand;
  const [hovIdx, setHovIdx] = useState<number | null>(null);

  // The character whose activation would play an Action card (character-first economy).
  const selectedEnt = game.selected
    ? Object.values(game[localPlayer].board).find(e => e?.id === game.selected) ?? null
    : null;
  // Effective Willpower for the play-from-hand level requirement.
  const wp = playWillpower(game[localPlayer]);

  const n = cards.length;
  const mid = (n - 1) / 2;

  return (
    <div style={{
      // Centered under the local command zone, which is flanked by the 320px SidePanel (left)
      // and the 440px LoadoutPanel (right). The extra `right` offset (= 440 − 320) shifts the
      // centre left by 60px so the hand sits under the encounter, not the whole mat.
      position: 'absolute', left: 0, right: 120, bottom: 0, height: ZONE_H,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      paddingBottom: 6, boxSizing: 'border-box',
      pointerEvents: 'none', zIndex: 40,
    }}>
      <div style={{
        position: 'relative',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        width: CARD_W + (n - 1) * (CARD_W - OVERLAP),
        pointerEvents: 'none',
      }}>
        {cards.map((card, i) => {
          const rot = (i - mid) * (SPREAD_DEG / Math.max(mid, 1)) * 0.5;
          const isArmed  = pendingPlay?.cardId === card.id;
          const isHov    = hovIdx === i;
          // Small, in-lane lift only — full inspection is handled by the top-right preview pane,
          // so the card never needs to grow up into the encounter / block board cards.
          const lift = isArmed ? -14 : isHov ? -10 : Math.abs(i - mid) * 4;

          const isPlayable   = card.type === 'Companion' || card.type === 'Construct';
          const isAction     = card.type === 'Action';
          const isItem       = card.type === 'Item';
          const playable     = isPlayable || isAction || isItem;
          // Actions are played during a character's activation: gate arming on the selected
          // character's economy (which includes class + the Willpower≥level requirement). For
          // companions/constructs/items, gate on the same Willpower≥level rule. The store
          // re-checks authoritatively either way.
          let blocked = false, blockReason = '';
          if (isAction) {
            const gate = selectedEnt ? canPlayActionCard(game, localPlayer, selectedEnt, card)
                                     : { ok: false, reason: 'Select one of your characters' };
            blocked = !gate.ok; blockReason = gate.reason ?? '';
          } else if (playable && card.level > wp) {
            blocked = true; blockReason = `Willpower ${wp} < level ${card.level}`;
          }
          const cursor = playable && !blocked ? 'pointer' : 'default';
          const actionBlocked = blocked; // drives the dim styling below

          const handleClick = () => {
            if (!playable) return;
            if (blocked) { pushToast(`Can't play ${card.name}: ${blockReason}.`); return; }
            beginPlay(card.id);
          };

          return (
            <div
              key={card.id}
              style={{
                marginLeft: i ? -OVERLAP : 0,
                transform: `translateY(${lift}px) rotate(${isArmed ? 0 : rot}deg) scale(${isArmed || isHov ? 1.04 : 1})`,
                transformOrigin: 'bottom center',
                transition: 'transform .18s cubic-bezier(.2,.8,.3,1)',
                pointerEvents: 'auto',
                zIndex: isArmed ? 35 : isHov ? 30 : i,
                filter: isArmed
                  ? `drop-shadow(0 0 14px rgba(214,160,80,0.7))`
                  : isHov ? 'drop-shadow(0 16px 28px rgba(0,0,0,0.6))' : 'none',
                cursor,
                opacity: actionBlocked ? 0.5 : 1,
                outline: isArmed ? `2px solid ${TBL.amber}` : 'none',
                borderRadius: 8,
                position: 'relative',
              }}
              onClick={handleClick}
              onMouseEnter={() => { setHovIdx(i); setHovered({ data: card, owner: localPlayer }); }}
              onMouseLeave={() => { setHovIdx(null); setHovered(null); }}
              onWheel={handlePreviewWheel}
            >
              <CardFace data={card} scale={HAND_SCALE} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
