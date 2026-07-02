import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMultiplayer } from '../lib/useMultiplayer';
import { CardFace } from '../components/CardFace';
import { CATALOG } from '../data/catalog';
import { TBL } from '../tokens';
import { Lobby } from './play/Lobby';
import { Matching } from './play/Matching';
import { PhaseRail } from './play/PhaseRail';
import { Playmat } from './play/Playmat';
import { PileViewer } from './play/PileViewer';
import { GameOverScreen } from './play/GameOverScreen';
import { ModalHost } from './play/modals/ModalHost';
import { PoisonModal } from './play/modals/PoisonModal';

function GameView() {
  const store = useGameStore();
  const { game, localPlayer, endTurn, endTurnToEndPhase, advancePhase, selectEntity, cancelPending, cancelPlay, cancelTrigger, cancelKit, cancelActionTarget, cancelPeek, pileView, closePile } = store;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Pile viewer takes Escape first (even while its search box is focused)
      if (e.key === 'Escape' && pileView) { closePile(); return; }

      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'Tab') {
        e.preventDefault();
        const yours = Object.values(game.p1.board)
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map(c => c.id);
        if (yours.length === 0) return;
        const cur = game.selected;
        const idx = yours.indexOf(cur ?? '');
        selectEntity(yours[(idx + 1) % yours.length]);
        return;
      }
      if (e.key === 'Escape') { selectEntity(null); cancelPending(); cancelPlay(); cancelTrigger(); cancelKit(); cancelActionTarget(); cancelPeek(); return; }
      if (e.key === 'Enter' && game.activePlayer === localPlayer) {
        const ph = game.currentPhase;
        if (ph === 'draw') advancePhase();
        // CZ phase: Enter does nothing — player must use the CZExchangePanel to choose or pass
        else if (ph === 'action') endTurnToEndPhase();
        else if (ph === 'end') endTurn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.selected, game.activePlayer, game.currentPhase, localPlayer, game.p1.board, endTurn, advancePhase, selectEntity, cancelPending, cancelPlay, cancelTrigger, cancelKit, cancelActionTarget, cancelPeek, pileView, closePile]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <PhaseRail />
      <Playmat />
      <TriggerPrompt />
      <KitPrompt />
      <KitItemModal />
      <ActionPrompt />
      <PeekModal />
      <DeadPickModal />
      <ArmorModal />
      <AttackChoiceModal />
      <PoisonHost />
      <ReactiveHoldBanner />
      <EquipPickModal />
      <ModalHost />
      <PileViewer />
      <GameOverScreen />
    </div>
  );
}

/** Shared on-board-targeting prompt banner (Reinforce/Dismantle, Kit-Master). */
function PromptBanner({ tag, text, onCancel }: { tag: string; text: string; onCancel: () => void }) {
  return (
    <div className="prompt-pulse" style={{
      position: 'fixed', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 250,
      display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderRadius: 9,
      background: 'rgba(36,29,19,0.96)', border: `1px solid ${TBL.amber2}`,
      fontFamily: "'Inter', sans-serif", fontSize: 13, color: TBL.ink,
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase' }}>
        {tag}
      </span>
      <span>{text}</span>
      <button onClick={onCancel} style={{
        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        background: 'rgba(255,255,255,0.05)', color: TBL.ink2, border: `1px solid ${TBL.matLine2}`,
        fontFamily: "'Inter', sans-serif",
      }}>Skip (Esc)</button>
    </div>
  );
}

/** Banner shown while a Reinforce/Dismantle trigger is awaiting a board target. */
function TriggerPrompt() {
  const pt = useGameStore(s => s.pendingTrigger);
  const cancelTrigger = useGameStore(s => s.cancelTrigger);
  if (!pt) return null;
  const verb = pt.kind === 'reinforce' ? 'Reinforce' : 'Dismantle';
  return <PromptBanner tag={`${verb} ${pt.n}`} text={`${pt.sourceName} — click a highlighted Physical Construct.`} onCancel={cancelTrigger} />;
}

/** Banner shown during Kit-Master's two-step item move. */
function KitPrompt() {
  const pk = useGameStore(s => s.pendingKit);
  const cancelKit = useGameStore(s => s.cancelKit);
  if (!pk || pk.step === 'item') return null; // 'item' step is the KitItemModal
  const text = pk.step === 'source'
    ? `${pk.sourceName} — click a character to take an item from.`
    : `Move ${pk.itemName} — click the character to give it to.`;
  return <PromptBanner tag="Kit-Master" text={text} onCancel={cancelKit} />;
}

/** Kit-Master item picker: shown when the source character holds 2+ items. */
function KitItemModal() {
  const pk = useGameStore(s => s.pendingKit);
  const pickKitItem = useGameStore(s => s.pickKitItem);
  const cancelKit = useGameStore(s => s.cancelKit);
  if (!pk || pk.step !== 'item' || !pk.items) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.8), rgba(5,4,2,0.93))',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #221b12, #14100a)', border: `1px solid ${TBL.matLine2}`,
        borderRadius: 14, padding: '22px 24px', maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase', marginBottom: 4 }}>
          {pk.sourceName} — Kit-Master: choose an item to move
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, marginBottom: 14 }}>
          Pick which item to move to another character.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 720 }}>
          {pk.items.map(it => {
            const card = CATALOG.find(c => c.name === it.name) ?? null;
            return (
              <button key={it.id} onClick={() => pickKitItem(it.id)}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 }}
                title={`Move ${it.name}`}>
                {card
                  ? <CardFace data={card} scale={0.62} />
                  : <span style={{ display: 'inline-block', padding: '14px 18px', border: `1px solid ${TBL.matLine2}`, borderRadius: 8, color: TBL.ink, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>{it.name}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={cancelKit} style={{ padding: '9px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: TBL.ink2, border: `1px solid ${TBL.matLine2}`, fontFamily: "'Inter', sans-serif" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Banner shown while an Action card awaits its target. */
function ActionPrompt() {
  const pa = useGameStore(s => s.pendingActionTarget);
  const cancelActionTarget = useGameStore(s => s.cancelActionTarget);
  if (!pa) return null;
  const text = pa.twoStep && !pa.firstId ? 'Click one of your characters.'
    : pa.twoStep === 'reposition' && pa.firstId ? 'Click an empty slot to move to.'
    : pa.twoStep === 'disarm' && pa.firstId ? 'Click an enemy to attack.'
    : 'Click a highlighted target.';
  return <PromptBanner tag={pa.sourceName} text={text} onCancel={cancelActionTarget} />;
}

/** Deck-peek (scry) modal: assign each looked-at card a destination. */
function PeekModal() {
  const pk = useGameStore(s => s.game.pendingPeek);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolvePeek = useGameStore(s => s.resolvePeek);
  const cancelPeek = useGameStore(s => s.cancelPeek);
  const [assign, setAssign] = useState<('hand' | 'top' | 'bottom')[]>([]);

  // Only the player doing the scry sees it (in multiplayer); sandbox shows all.
  const owned = pk != null && (isSolo || pk.lp === localPlayer);

  useEffect(() => {
    if (pk) setAssign(pk.cards.map(() => (pk.dests.includes('top') ? 'top' : pk.dests[0])));
  }, [pk]);

  if (!pk || !owned) return null;
  const handCount = assign.filter(a => a === 'hand').length;
  const overHand = pk.maxHand != null && handCount > pk.maxHand;
  const DEST_LABEL: Record<string, string> = { hand: 'Hand', top: 'Top', bottom: 'Bottom' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.8), rgba(5,4,2,0.93))',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #221b12, #14100a)', border: `1px solid ${TBL.matLine2}`,
        borderRadius: 14, padding: '22px 24px', maxWidth: '92vw', boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase', marginBottom: 4 }}>
          {pk.source} — look at {pk.cards.length}
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, marginBottom: 14 }}>
          Assign a destination to each card{pk.maxHand != null ? ` (up to ${pk.maxHand} to hand)` : ''}.
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          {pk.cards.map((c, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <CardFace data={c} scale={0.62} />
              <div style={{ display: 'flex', gap: 4 }}>
                {pk.dests.map(d => (
                  <button key={d} onClick={() => setAssign(a => a.map((x, j) => j === i ? d : x))}
                    style={{
                      padding: '4px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      fontFamily: "'Inter', sans-serif",
                      background: assign[i] === d ? TBL.amber : 'rgba(255,255,255,0.05)',
                      color: assign[i] === d ? '#1a1208' : TBL.ink2,
                      border: `1px solid ${assign[i] === d ? TBL.amber : TBL.matLine2}`,
                    }}>{DEST_LABEL[d]}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={cancelPeek} style={{ padding: '9px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: TBL.ink2, border: `1px solid ${TBL.matLine2}`, fontFamily: "'Inter', sans-serif" }}>Cancel</button>
          <button disabled={overHand} onClick={() => resolvePeek(assign)}
            style={{ padding: '9px 18px', borderRadius: 7, cursor: overHand ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, background: overHand ? 'rgba(214,160,80,0.4)' : TBL.amber, color: '#1a1208', border: `1px solid ${TBL.amber}`, fontFamily: "'Inter', sans-serif" }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/** Start-of-turn Poison check, routed via game.pendingPoison to the affected player's
 *  client (multiplayer); sandbox shows it regardless of which side is being controlled. */
function PoisonHost() {
  const pendingPoison = useGameStore(s => s.game.pendingPoison);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const setGame = useGameStore(s => s.setGame);
  if (!pendingPoison || (!isSolo && pendingPoison !== localPlayer)) return null;
  return <PoisonModal player={pendingPoison} onClose={() => setGame(g => ({ ...g, pendingPoison: null }))} />;
}

/** Multiplayer: the active player is held while the opponent resolves a reactive
 *  Dead-Zone prompt (e.g. their Memory Stone, fired by our kill). Sandbox needs no
 *  banner — the picker modal already covers the board for the single controller. */
function ReactiveHoldBanner() {
  const dp = useGameStore(s => s.game.pendingDeadPick);
  const pa = useGameStore(s => s.game.pendingArmor);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  if (isSolo) return null;
  // Hold for an opponent-owned reactive prompt: Dead-Zone recovery, or an Armor choice.
  // Only shown to the held (non-owning) peer, so the owner is always "the opponent"
  // (the synced player names are perspective-relative — don't show them here).
  const source = (dp && dp.lp !== localPlayer) ? dp.source
               : (pa && pa.defender !== localPlayer) ? `${pa.entityName}'s armor`
               : null;
  if (!source) return null;
  return (
    <div style={{
      position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 210,
      background: 'rgba(18,14,10,0.96)', border: `1px solid ${TBL.amber}`, borderRadius: 10,
      padding: '10px 20px', boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${TBL.amber}33`,
      fontFamily: "'Newsreader', serif", fontSize: 15, color: TBL.ink, whiteSpace: 'nowrap',
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.amber2, letterSpacing: '0.18em', textTransform: 'uppercase', marginRight: 10 }}>
        Hold
      </span>
      Waiting for the opponent to resolve {source}…
    </div>
  );
}

/** Dead-Zone recovery picker (Library of Memory): pick a card to return to hand. */
function DeadPickModal() {
  const dp = useGameStore(s => s.game.pendingDeadPick);
  const pendingPeek = useGameStore(s => s.game.pendingPeek);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolveDeadPick = useGameStore(s => s.resolveDeadPick);
  const cancelDeadPick = useGameStore(s => s.cancelDeadPick);
  // Only the owning player resolves the recovery (in multiplayer); sandbox shows all.
  const owned = dp != null && (isSolo || dp.lp === localPlayer);
  if (!dp || !owned || pendingPeek) return null; // let any start-of-turn peek resolve first

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.8), rgba(5,4,2,0.93))',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #221b12, #14100a)', border: `1px solid ${TBL.matLine2}`,
        borderRadius: 14, padding: '22px 24px', maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase', marginBottom: 4 }}>
          {dp.source} — return a card from your Dead Zone
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, marginBottom: 14 }}>
          Pick a card to return to your hand{dp.optional ? ', or skip.' : '.'}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 720 }}>
          {dp.options.map(({ card, idx }) => (
            <button key={idx} onClick={() => resolveDeadPick(idx)}
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 }}
              title={`Return ${card.name}`}>
              <CardFace data={card} scale={0.62} />
            </button>
          ))}
        </div>
        {dp.optional && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={cancelDeadPick} style={{ padding: '9px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: TBL.ink2, border: `1px solid ${TBL.matLine2}`, fontFamily: "'Inter', sans-serif" }}>Skip</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Pre-attack optional ability (Mara): the attacker chooses whether to pay HP for
 *  +damage before the attack resolves. */
function AttackChoiceModal() {
  const pac = useGameStore(s => s.game.pendingAttackChoice);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolve = useGameStore(s => s.resolveAttackChoice);
  if (!pac || (!isSolo && pac.lp !== localPlayer)) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.8), rgba(5,4,2,0.93))',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #221b12, #14100a)', border: `1px solid ${TBL.matLine2}`,
        borderRadius: 14, padding: '22px 26px', maxWidth: 420, boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase', marginBottom: 6 }}>
          {pac.sourceName} attacks
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: TBL.ink, marginBottom: 16 }}>
          Pay {pac.payHP} HP from your Player Character to deal {pac.bonus} additional damage?
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => resolve(false)} style={{ padding: '9px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: TBL.ink2, border: `1px solid ${TBL.matLine2}`, fontFamily: "'Inter', sans-serif" }}>No</button>
          <button onClick={() => resolve(true)} style={{ padding: '9px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: TBL.amber, color: '#1a1208', border: `1px solid ${TBL.amber}`, fontFamily: "'Inter', sans-serif" }}>Pay {pac.payHP} HP</button>
        </div>
      </div>
    </div>
  );
}

/** Mid-combat Armor picker: the defender chooses which armor piece absorbs a hit
 *  when the struck character has 2+ pieces (rules: controlling player chooses).
 *  Forced — armor always absorbs, so there is no skip. */
function ArmorModal() {
  const pa = useGameStore(s => s.game.pendingArmor);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolveArmor = useGameStore(s => s.resolveArmor);
  // Only the defender (the hit character's controller) chooses; sandbox shows all.
  if (!pa || (!isSolo && pa.defender !== localPlayer)) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.8), rgba(5,4,2,0.93))',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #221b12, #14100a)', border: `1px solid ${TBL.matLine2}`,
        borderRadius: 14, padding: '22px 24px', maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase', marginBottom: 4 }}>
          {pa.entityName} is hit — choose which armor absorbs it
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, marginBottom: 14 }}>
          The chosen armor prevents the damage and takes a counter (sacrificed at its limit).
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 720 }}>
          {pa.candidates.map(c => {
            const card = CATALOG.find(x => x.name === c.name) ?? null;
            const next = c.counters + 1;
            const willBreak = next >= c.armor;
            return (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <button onClick={() => resolveArmor(c.id)}
                  style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 }}
                  title={`${c.name} absorbs the hit`}>
                  {card
                    ? <CardFace data={card} scale={0.62} />
                    : <span style={{ display: 'inline-block', padding: '14px 18px', border: `1px solid ${TBL.matLine2}`, borderRadius: 8, color: TBL.ink, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>{c.name}</span>}
                </button>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: willBreak ? TBL.amber : TBL.ink2 }}>
                  {next}/{c.armor} counters{willBreak ? ' — breaks!' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Equip-from-hand picker (Veteran of the Ashgrove): choose a hand item to equip. */
function EquipPickModal() {
  const ep = useGameStore(s => s.pendingEquipPick);
  const resolveEquipPick = useGameStore(s => s.resolveEquipPick);
  const cancelEquipPick = useGameStore(s => s.cancelEquipPick);
  if (!ep) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(10,8,5,0.8), rgba(5,4,2,0.93))',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #221b12, #14100a)', border: `1px solid ${TBL.matLine2}`,
        borderRadius: 14, padding: '22px 24px', maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase', marginBottom: 4 }}>
          {ep.source} — equip an item from your hand
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, marginBottom: 14 }}>
          Pick an item to equip to this character, or skip.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 720 }}>
          {ep.items.map(card => (
            <button key={card.id} onClick={() => resolveEquipPick(card.id)}
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8 }}
              title={`Equip ${card.name}`}>
              <CardFace data={card} scale={0.62} />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={cancelEquipPick} style={{ padding: '9px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: TBL.ink2, border: `1px solid ${TBL.matLine2}`, fontFamily: "'Inter', sans-serif" }}>Skip</button>
        </div>
      </div>
    </div>
  );
}

export function Play() {
  const playPhase = useGameStore(s => s.playPhase);
  const connMode  = useGameStore(s => s.conn.mode);
  const oppStatus = useGameStore(s => s.conn.opponentStatus);
  // The PeerJS session lives HERE — Play() stays mounted across lobby→matching→game,
  // so hosting/joining survives the view switch. (Calling useMultiplayer() inside Lobby
  // tied the session to Lobby's lifecycle, so it was destroyed the instant we left the
  // lobby, killing the connection before it could complete.)
  const { host, join, disconnect } = useMultiplayer();

  if (playPhase === 'lobby') return <Lobby host={host} join={join} />;
  // The Matching screen is shown while waiting for an opponent (host/join modes).
  if (playPhase === 'game' && (connMode === 'host' || connMode === 'join') && oppStatus !== 'ready') {
    return <Matching disconnect={disconnect} />;
  }
  return <GameView />;
}
