import type { CSSProperties } from 'react';
import { CardFace, BASE_W, BASE_H } from '../../components/CardFace';
import { TBL } from '../../tokens';
import { btnProps } from '../../lib/a11y';
import { useGameStore, ADJ, type SlotId, type PlayerState, type Board, type GameState } from '../../store/gameStore';
import { effectiveKeywords, wardedLines, moveRestrictedBy } from '../../store/keywords';
import { handlePreviewWheel } from './previewScroll';
import type { BoardEntity } from '../../types/card';

const DEFAULT_BOARD_SCALE = 0.56;
const BACK_LINE: SlotId[] = ['b1', 'b2', 'b3'];

type SlotState = 'empty' | 'filled' | 'move-target' | 'play-target' | 'attack-target' | 'pc-placement' | 'trigger-target';

function slotStyle(state: SlotState, boardScale: number): CSSProperties {
  const base: CSSProperties = {
    width: BASE_W * boardScale, height: BASE_H * boardScale, borderRadius: 10,
    flexShrink: 0, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'border-color .15s, background .15s, box-shadow .15s',
  };
  switch (state) {
    case 'move-target': return { ...base, border: `2px dashed ${TBL.amber}`, background: 'rgba(214,160,80,0.08)', boxShadow: `0 0 14px 1px rgba(214,160,80,0.25)`, cursor: 'pointer' };
    case 'play-target': return { ...base, border: `2px dashed ${TBL.good}`, background: 'rgba(116,192,138,0.08)', boxShadow: `0 0 14px 1px rgba(116,192,138,0.2)`, cursor: 'pointer' };
    case 'attack-target': return { ...base, border: `2px dashed ${TBL.danger}`, background: 'rgba(224,106,106,0.10)', boxShadow: `0 0 16px 1px rgba(224,106,106,0.3)`, cursor: 'crosshair' };
    case 'pc-placement': return { ...base, border: `2px dashed ${TBL.violet}`, background: 'rgba(138,122,214,0.10)', boxShadow: `0 0 14px 1px rgba(138,122,214,0.25)`, cursor: 'pointer' };
    case 'trigger-target': return { ...base, border: `2px dashed ${TBL.amber2}`, background: 'rgba(240,192,116,0.10)', boxShadow: `0 0 16px 1px rgba(240,192,116,0.3)`, cursor: 'pointer' };
    case 'empty': return { ...base, border: `1.5px solid ${TBL.matLine}`, background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0 6px, transparent 6px 12px)', boxShadow: 'inset 0 0 14px rgba(0,0,0,0.4)', cursor: 'default' };
    case 'filled': return { ...base, border: `1.5px solid ${TBL.matLine}`, background: 'transparent', cursor: 'default' };
  }
}

const badgeStyle = (danger?: boolean, purple?: boolean): CSSProperties => ({
  position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)',
  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
  color: purple ? '#fff' : danger ? '#fff' : '#1a1208',
  background: purple ? TBL.violet : danger ? TBL.danger : TBL.amber,
  padding: '2px 7px', borderRadius: 3, letterSpacing: '0.08em',
  pointerEvents: 'none', zIndex: 5, whiteSpace: 'nowrap',
});

const slotLabel: CSSProperties = {
  position: 'absolute', fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10, color: TBL.ink4, letterSpacing: '0.2em', pointerEvents: 'none',
};

// Activation-state pill, pinned to the bottom so it doesn't collide with the
// top-centre targeting badges (Move here / Attack / Place PC).
const actorBadge = (color: string): CSSProperties => ({
  position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
  fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700,
  color: '#0e0e12', background: color, padding: '2px 6px', borderRadius: 3,
  letterSpacing: '0.08em', pointerEvents: 'none', zIndex: 6, whiteSpace: 'nowrap',
});

/** Determine legal attack targets given targeting rules. */
function legalAttackTargets(oppBoard: Board, game: GameState, attacker?: BoardEntity | null): Set<string> {
  const entities = Object.values(oppBoard).filter((e): e is BoardEntity => !!e);
  const chars = entities.filter(e => e.kind === 'companion' || e.kind === 'pc');
  if (chars.length === 0) return new Set();

  // 1. Guardian takes priority
  const guardians = chars.filter(e => effectiveKeywords(e, game).includes('Guardian') && !e.exhausted);
  let result: Set<string>;
  if (guardians.length > 0) {
    result = new Set(guardians.map(e => e.id));
  } else {
    // 2. Front Line takes priority (companions only, not constructs)
    const frontLineIds = new Set(
      Object.entries(oppBoard)
        .filter(([slot, e]) => e && ['f1','f2','f3'].includes(slot) && (e.kind === 'companion' || e.kind === 'pc'))
        .map(([, e]) => e!.id)
    );
    // 3. Back Line / all legal chars
    result = frontLineIds.size > 0 ? frontLineIds : new Set(chars.map(e => e.id));
  }

  // 4. Long-Quiet Wall: a companion attacker can't hit a warded (opposite) line.
  if (attacker?.kind === 'companion') {
    const warded = wardedLines(oppBoard);
    if (warded.size > 0) {
      for (const [slot, e] of Object.entries(oppBoard)) {
        if (e && warded.has(slot[0] === 'f' ? 'front' : 'back')) result.delete(e.id);
      }
    }
  }
  return result;
}

interface CommandZoneProps {
  player: PlayerState;
  owner: 'p1' | 'p2';
  flip?: boolean;
  boardScale?: number;
}

export function CommandZone({ player, owner, flip, boardScale = DEFAULT_BOARD_SCALE }: CommandZoneProps) {
  // Individual selectors (not a whole-store subscription) — the board grid is the
  // heaviest render in the app and must not re-render on hover/toast changes.
  // Actions are referentially stable; `game` re-renders only on real game changes.
  const game                = useGameStore(s => s.game);
  const pending             = useGameStore(s => s.pending);
  const pendingPlay         = useGameStore(s => s.pendingPlay);
  const pendingTrigger      = useGameStore(s => s.pendingTrigger);
  const pendingKit          = useGameStore(s => s.pendingKit);
  const pendingActionTarget = useGameStore(s => s.pendingActionTarget);
  const localPlayer         = useGameStore(s => s.localPlayer);
  const selectEntity        = useGameStore(s => s.selectEntity);
  const setHovered          = useGameStore(s => s.setHovered);
  const resolveMove         = useGameStore(s => s.resolveMove);
  const resolveAttack       = useGameStore(s => s.resolveAttack);
  const placeCard           = useGameStore(s => s.placeCard);
  const placePc             = useGameStore(s => s.placePc);
  const equipItem           = useGameStore(s => s.equipItem);
  const cancelPlay          = useGameStore(s => s.cancelPlay);
  const resolveTrigger      = useGameStore(s => s.resolveTrigger);
  const resolveKit          = useGameStore(s => s.resolveKit);
  const resolveActionTarget = useGameStore(s => s.resolveActionTarget);
  const resolveActionSlot   = useGameStore(s => s.resolveActionSlot);
  const oppPlayer: 'p1' | 'p2' = localPlayer === 'p1' ? 'p2' : 'p1';

  // PC placement mode: show placement slots only for the player whose serialized
  // place-pc step is current (and who still has an unplaced _pc).
  const awaitingPcPlacement = !!game[owner]._pc && game.setupQueue[0] === `place-pc:${owner}`;

  const rows: [string, SlotId, SlotId, SlotId][] = flip
    ? [['B', 'b3', 'b2', 'b1'], ['F', 'f3', 'f2', 'f1']]
    : [['F', 'f1', 'f2', 'f3'], ['B', 'b1', 'b2', 'b3']];

  // Resolve attacker slot for move adjacency check
  const attackerSlot = pending?.action === 'move'
    ? findEntitySlot(game[localPlayer].board, pending.charId)
    : null;

  // Attacker slot eligibility — must be in Front Line or have Ranged
  const attackerEnt = pending?.action === 'attack' && pending.charId
    ? findEntityById(game[localPlayer].board, pending.charId)
    : null;

  // Legal attack targets (enforces Guardian + Front Line priority + Fortification wards)
  const legalTargets = pending?.action === 'attack'
    ? legalAttackTargets(game[oppPlayer].board, game, attackerEnt)
    : new Set<string>();
  const attackerInFrontLine = attackerEnt
    ? ['f1','f2','f3'].includes(findEntitySlot(game[localPlayer].board, attackerEnt.id) ?? '')
    : false;
  const attackerHasRanged = attackerEnt ? effectiveKeywords(attackerEnt, game).includes('Ranged') : false;
  const attackerCanAttack = attackerInFrontLine || attackerHasRanged;

  // Pending play: companions → back line only; constructs → any; items/actions don't go on board
  const pendingCard = pendingPlay
    ? game[localPlayer].hand.find(c => c.id === pendingPlay.cardId)
    : null;
  const playIsCompanion = pendingCard?.type === 'Companion';
  const playGoesOnBoard = pendingCard?.type === 'Companion' || pendingCard?.type === 'Construct';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
      {rows.map(([lineKey, s1, s2, s3]) => (
        <div key={lineKey} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            width: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
            color: TBL.ink3, letterSpacing: '0.14em', textTransform: 'uppercase',
            writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center',
          }}>
            {lineKey === 'F' ? 'Front' : 'Back'}
          </div>

          {[s1, s2, s3].map(sid => {
            const card = player.board[sid];
            const isSel = card?.id === game.selected;
            const isChar = card && (card.kind === 'companion' || card.kind === 'pc');
            const isBackLine = BACK_LINE.includes(sid);

            // Atomic activation cues: glow the character mid-activation, dim sealed ones.
            const isCurrentActor = !!card && owner === localPlayer && card.id === game.currentActor;
            const isSealedActor  = !!card && owner === localPlayer && card.kind !== 'construct' && game.finishedActors.includes(card.id);

            // PC placement mode
            const isPcPlacement = awaitingPcPlacement && !card && isBackLine;

            const isMoveTarget   = !awaitingPcPlacement && pending?.action === 'move' && owner === localPlayer && !card
              && attackerSlot != null && ADJ[attackerSlot]?.includes(sid)
              // Standing movement restrictions (R1/R3, 2026-07-15): a destination an
              // opposing aura bars is never highlighted as clickable.
              && !(game[localPlayer].board[attackerSlot]
                && moveRestrictedBy(game, game[localPlayer].board[attackerSlot]!, localPlayer, attackerSlot, sid));
            const isPlayTarget   = !awaitingPcPlacement && !!pendingPlay && playGoesOnBoard && owner === localPlayer && !card
              && (!playIsCompanion || isBackLine);
            const isAttackTarget = !awaitingPcPlacement && pending?.action === 'attack' && attackerCanAttack
              && owner === oppPlayer && !!isChar && legalTargets.has(card.id);
            const isTriggerTarget = !!pendingTrigger && !!card && pendingTrigger.eligibleIds.includes(card.id);
            const isKitTarget = !!pendingKit && !!card && pendingKit.eligibleIds.includes(card.id);
            const isActionTarget = !!pendingActionTarget && !!card && pendingActionTarget.eligibleIds.includes(card.id);
            const isActionSlot = !!pendingActionTarget && !card && owner === localPlayer
              && !!pendingActionTarget.eligibleSlots?.includes(sid);

            const state: SlotState = isPcPlacement   ? 'pc-placement'
                                   : (isTriggerTarget || isKitTarget) ? 'trigger-target'
                                   : isActionTarget  ? 'attack-target'
                                   : isActionSlot    ? 'move-target'
                                   : isMoveTarget    ? 'move-target'
                                   : isPlayTarget    ? 'play-target'
                                   : isAttackTarget  ? 'attack-target'
                                   : card            ? 'filled'
                                   :                   'empty';

            const pendingIsItem = pendingCard?.type === 'Item';
            const handleClick = () => {
              if (isTriggerTarget && card) { resolveTrigger(card.id); return; }
              if (isKitTarget && card)     { resolveKit(card.id); return; }
              if (isActionTarget && card)  { resolveActionTarget(card.id); return; }
              if (isActionSlot)            { resolveActionSlot(sid); return; }
              if (isPcPlacement)  { placePc(sid, owner); return; }
              if (isMoveTarget)   { resolveMove(sid); return; }
              if (isPlayTarget)   { placeCard(sid); return; }
              if (isAttackTarget && card) { resolveAttack(card.id); return; }
              if (card && owner === localPlayer && pendingIsItem && pendingPlay) {
                equipItem(card.id, pendingPlay.cardId);
                cancelPlay();
                return;
              }
              if (card && owner === localPlayer) selectEntity(card.id);
            };

            // Pulse the glow on slots the player is being asked to click, so the
            // "choose a target" step is hard to miss (matches the prompt banner pulse).
            const pulseTarget = state === 'attack-target' || state === 'trigger-target'
              || state === 'move-target' || state === 'pc-placement';

            // Keyboard: a slot joins the tab order only while it actually responds
            // to a click (a target of some pending action, or an own card to select).
            const slotInteractive = pulseTarget || state === 'play-target'
              || (!!card && owner === localPlayer);
            const pulseCol = state === 'attack-target' ? 'rgba(224,106,106,0.65)'
              : state === 'pc-placement' ? 'rgba(138,122,214,0.65)'
              : 'rgba(240,192,116,0.65)';

            return (
              <div key={sid}
                className={pulseTarget ? 'target-pulse' : undefined}
                style={{
                  ...slotStyle(state, boardScale),
                  ...(pulseTarget ? ({ ['--pulse-col']: pulseCol } as CSSProperties) : {}),
                  ...(isCurrentActor ? { boxShadow: `0 0 0 2px ${TBL.good}, 0 0 18px 3px rgba(116,192,138,0.5)` } : {}),
                  ...(isSealedActor ? { opacity: 0.5, filter: 'grayscale(0.55)' } : {}),
                }} {...btnProps(handleClick, !slotInteractive)}
                aria-label={card ? `${sid.toUpperCase()}: ${card.name}` : `Empty slot ${sid.toUpperCase()}`}>
                {card ? (
                  <CardFace
                    data={card}
                    scale={boardScale}
                    selected={isSel}
                    hoverable={owner === localPlayer && !isAttackTarget}
                    onMouseEnter={() => setHovered({ data: card, owner })}
                    onMouseLeave={() => setHovered(null)}
                    onWheel={handlePreviewWheel}
                  />
                ) : (
                  <span style={slotLabel}>{sid.toUpperCase()}</span>
                )}
                {isPcPlacement  && <div style={badgeStyle(false, true)}>Place PC here ★</div>}
                {isMoveTarget   && <div style={badgeStyle()}>Move here ⤢</div>}
                {isPlayTarget   && <div style={badgeStyle()}>Play here ↓</div>}
                {isAttackTarget && <div style={badgeStyle(true)}>Attack ⚔</div>}
                {isCurrentActor && <div style={actorBadge(TBL.good)}>▶ activating</div>}
                {isSealedActor  && <div style={actorBadge(TBL.ink3)}>done</div>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function findEntitySlot(board: PlayerState['board'], entityId: string): SlotId | null {
  for (const [slot, ent] of Object.entries(board)) {
    if (ent?.id === entityId) return slot as SlotId;
  }
  return null;
}

function findEntityById(board: PlayerState['board'], entityId: string): BoardEntity | null {
  for (const ent of Object.values(board)) {
    if (ent?.id === entityId) return ent;
  }
  return null;
}
