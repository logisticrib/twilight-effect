import { useEffect, useState } from 'react';
import { useGameStore, itemTransferCandidates, reactiveLabel } from '../store/gameStore';
import type { BoardEntity } from '../types/card';
import { useMultiplayer } from '../lib/useMultiplayer';
import { CardFace } from '../components/CardFace';
import { TBL, Z } from '../tokens';
import { Lobby } from './play/Lobby';
import { Matching } from './play/Matching';
import { PhaseRail } from './play/PhaseRail';
import { Playmat } from './play/Playmat';
import { PileViewer } from './play/PileViewer';
import { GameOverScreen } from './play/GameOverScreen';
import { ModalHost } from './play/modals/ModalHost';
import { ModalShell, md } from './play/modals/ModalShell';
import { CardPickModal } from './play/modals/CardPickModal';
import { PoisonModal } from './play/modals/PoisonModal';
import { CoercionModal } from './play/modals/CoercionModal';
import { RecorderButton } from './play/RecorderButton';

function GameView() {
  // Deliberately NO store subscription here: GameView is the root of the whole board
  // tree, so a subscription would re-render everything on every store change (each
  // hover sets `hovered`). The keyboard handler reads fresh state via getState()
  // instead — registered once, always current.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGameStore.getState();
      const { game, localPlayer } = s;

      // Pile viewer takes Escape first (even while its search box is focused)
      if (e.key === 'Escape' && s.pileView) { s.closePile(); return; }

      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // While a modal dialog is up, Tab must traverse ITS buttons (not cycle units)
      // and Enter must not advance the phase underneath it. Escape stays live — it
      // cancels/skips prompts by design.
      const modalUp = game.setupQueue.length > 0 || s.modalQueue.length > 0
        || !!game.pendingPeek || !!game.pendingDeadPick || !!game.pendingArmor
        || !!game.pendingAttackChoice || !!game.pendingPoison || !!game.pendingCoercion
        || !!game.pendingItemTransfer || !!game.pendingModalChoice || !!game.gameOver
        || !!game.pendingTriggerOrder
        || !!s.pendingEquipPick || s.pendingKit?.step === 'item' || !!s.pileView;

      if (e.key === 'Tab') {
        if (modalUp) return;                 // let focus traverse the dialog
        e.preventDefault();
        const yours = Object.values(game[localPlayer].board)
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map(c => c.id);
        if (yours.length === 0) return;
        const idx = yours.indexOf(game.selected ?? '');
        s.selectEntity(yours[(idx + 1) % yours.length]);
        return;
      }
      if (e.key === 'Escape') { s.selectEntity(null); s.cancelPending(); s.cancelPlay(); s.cancelTrigger(); s.cancelKit(); s.cancelActionTarget(); s.cancelPeek(); return; }
      if (e.key === 'Enter' && !modalUp && game.activePlayer === localPlayer) {
        const ph = game.currentPhase;
        if (ph === 'draw') s.advancePhase();
        // CZ phase: Enter does nothing — player must use the CZExchangePanel to choose or pass
        else if (ph === 'action') s.endTurnToEndPhase();
        else if (ph === 'end') s.endTurn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      <ModalChoiceHost />
      <ItemTransferModal />
      <ArmorModal />
      <AttackChoiceModal />
      <PoisonHost />
      <CoercionModal />
      <TriggerOrderModal />
      <StackResumeDriver />
      <ReactiveHoldBanner />
      <EquipPickModal />
      <ModalHost />
      <PileViewer />
      <GameOverScreen />
      <RecorderButton />
    </div>
  );
}

/** Shared on-board-targeting prompt banner (Reinforce/Dismantle, Kit-Master). */
function PromptBanner({ tag, text, onCancel }: { tag: string; text: string; onCancel: () => void }) {
  return (
    <div className="prompt-pulse" style={{
      position: 'fixed', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: Z.prompt,
      display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderRadius: 9,
      background: 'rgba(36,29,19,0.96)', border: `1px solid ${TBL.amber2}`,
      fontFamily: "'Inter', sans-serif", fontSize: 13, color: TBL.ink,
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.2em', color: TBL.amber2, textTransform: 'uppercase' }}>
        {tag}
      </span>
      <span>{text}</span>
      <button onClick={() => onCancel()} style={{
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
    <CardPickModal glyph="⇄" eyebrow={`Kit-Master · ${pk.sourceName}`}
      title="Choose an item to move" sub="Pick which item to move to another character."
      picks={pk.items.map(it => ({ key: it.id, name: it.name }))}
      onPick={id => pickKitItem(id as string)}
      pickTitle={n => `Move ${n}`}
      cancel={{ label: 'Cancel', onClick: cancelKit }}
    />
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
    <ModalShell glyph="☾" eyebrow={pk.source}
      title={`Look at ${pk.cards.length} card${pk.cards.length !== 1 ? 's' : ''}${pk.deckSide !== pk.lp ? " — opponent's deck" : ''}`}
      sub={`Assign a destination to each card${pk.maxHand != null ? ` (up to ${pk.maxHand} to hand)` : ''}.`}
      width="min(760px, 94vw)"
      footer={
        <>
          <div style={md.spacer} />
          <button style={md.btn('ghost')} onClick={() => cancelPeek()}>Cancel</button>
          <button disabled={overHand} onClick={() => resolvePeek(assign)}
            style={overHand ? { ...md.btn('primary'), opacity: 0.5, cursor: 'not-allowed' } : md.btn('primary')}>
            Confirm
          </button>
        </>
      }>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
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
    </ModalShell>
  );
}

/** Simultaneous-trigger ordering (trigger stack, owner-ratified 2026-07-12): >1
 *  reactive trigger queued at once — the ACTIVE player decides the order they go on
 *  the stack. Picks are BLIND (nothing resolves between picks); the last unpicked
 *  trigger is implied. Forced choice: no cancel — mandatory triggers must resolve. */
function TriggerOrderModal() {
  const po = useGameStore(s => s.game.pendingTriggerOrder);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolveTriggerOrder = useGameStore(s => s.resolveTriggerOrder);
  if (!po) return null;
  if (!isSolo && po.lp !== localPlayer) return null; // the active player orders; others hold
  const remaining = po.items.map((it, i) => ({ it, i })).filter(x => !po.picked.includes(x.i));
  const nth = po.picked.length + 1;
  return (
    <ModalShell glyph="⧉" eyebrow="Simultaneous triggers"
      title={nth === 1 ? 'Choose which trigger resolves first' : `Choose the trigger to resolve #${nth}`}
      sub="These triggers fired at the same time — as the active player, you decide the order they go on the stack.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {remaining.map(({ it, i }) => (
          <button key={i} onClick={() => resolveTriggerOrder(i)} style={md.btn('primary')}>
            {reactiveLabel(it)}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

/** Multiplayer hand-off driver: a trigger stack resting on an 'ownEnter' owned by
 *  this client (its resolution arms store-LOCAL prompts, so only the controller's
 *  client may run it) is resumed here. Solo stacks drain synchronously inside the
 *  arming reducer, so this effectively fires only after a remote snapshot lands;
 *  resumeStack is idempotent-gated, so a StrictMode double-invoke is harmless. */
function StackResumeDriver() {
  const head = useGameStore(s => {
    const ts = s.game.triggerStack;
    return ts?.length ? ts[ts.length - 1] : null;
  });
  useEffect(() => {
    if (head?.kind !== 'ownEnter') return;
    const s = useGameStore.getState();
    if ((s.conn.mode === 'solo' || head.controller === s.localPlayer)
      && !s.game.pendingPeek && !s.game.pendingTriggerOrder && !s.game.pendingArmor) {
      s.resumeStack();
    }
  }, [head]);
  return null;
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
  const it = useGameStore(s => s.game.pendingItemTransfer);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  if (isSolo) return null;
  // Hold for an opponent-owned reactive prompt: Dead-Zone recovery, an Armor choice,
  // or an Item Transfer window. Only shown to the held (non-owning) peer, so the owner
  // is always "the opponent" (synced player names are perspective-relative).
  const source = (dp && dp.lp !== localPlayer) ? dp.source
               : (pa && pa.defender !== localPlayer) ? `${pa.entityName}'s armor`
               : (it && it.lp !== localPlayer) ? `${it.sourceName}'s Item Transfer`
               : null;
  if (!source) return null;
  return (
    <div style={{
      position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: Z.holdBanner,
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

/** Dead-Zone recovery picker (Library of Memory / Scavenger): pick a card to return
 *  to hand — or, with an attach destination (Scavenger), onto the entering companion. */
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
    <CardPickModal glyph="☠" eyebrow={dp.source}
      title={dp.attachTo ? 'Return an item from your Dead Zone' : 'Return a card from your Dead Zone'}
      sub={dp.attachTo
        ? `Pick an item to attach to ${dp.attachTo.name}${dp.optional ? ', or skip.' : '.'}`
        : `Pick a card to return to your hand${dp.optional ? ', or skip.' : '.'}`}
      picks={dp.options.map(({ card, idx }) => ({ key: idx, name: card.name, card }))}
      onPick={idx => resolveDeadPick(idx as number)}
      pickTitle={n => dp.attachTo ? `Attach ${n}` : `Return ${n}`}
      cancel={dp.optional ? { label: 'Skip', onClick: cancelDeadPick } : undefined}
    />
  );
}

/** Deferred start-of-turn modal choice (Pyre of the Unbound): pick a mode — paying
 *  the clause cost (e.g. sacrifice this construct) — or decline a "you may" clause.
 *  Render-gated behind the earlier turn-start prompts so dialogs never stack. */
function ModalChoiceHost() {
  const pm = useGameStore(s => s.game.pendingModalChoice);
  const blocked = useGameStore(s => !!(s.game.pendingPoison || s.game.pendingPeek || s.game.pendingDeadPick));
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolveModalChoice = useGameStore(s => s.resolveModalChoice);
  const declineModalChoice = useGameStore(s => s.declineModalChoice);
  if (!pm || blocked || (!isSolo && pm.lp !== localPlayer)) return null;

  return (
    <ModalShell glyph="⌥" eyebrow={pm.sourceName}
      title={pm.cost === 'sacrificeSelf' ? `Sacrifice ${pm.sourceName}?` : 'Choose a mode'}
      sub={pm.cost === 'sacrificeSelf'
        ? 'Choosing a mode sacrifices it as the cost — or decline and keep it.'
        : 'Choose one of the modes below.'}
      width="min(560px, 92vw)"
      footer={pm.optional
        ? (<><div style={md.spacer} /><button style={md.btn('ghost')} onClick={() => declineModalChoice()}>Decline — keep it</button></>)
        : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pm.options.map((o, i) => (
          <button key={i} style={md.btn('primary')} onClick={() => resolveModalChoice(i)}>
            {o.label}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

/** Item Transfer on Character Exit (rules §Items; ruled 2026-07-08: ALL exits — death,
 *  fleeing, bounce, sacrifice): the departed character's controller may exhaust a
 *  ready character with a fitting open slot to claim each item out of the Dead Zone;
 *  declined items simply stay there. Items resolve one at a time (head-first); each
 *  character can be exhausted only once per departing character. */
function ItemTransferModal() {
  const it = useGameStore(s => s.game.pendingItemTransfer);
  const game = useGameStore(s => s.game);
  const localPlayer = useGameStore(s => s.localPlayer);
  const isSolo = useGameStore(s => s.conn.mode === 'solo');
  const resolveItemTransfer = useGameStore(s => s.resolveItemTransfer);
  const declineItemTransfer = useGameStore(s => s.declineItemTransfer);
  // Only the departed character's controller chooses; sandbox shows all.
  if (!it || !it.items.length || (!isSolo && it.lp !== localPlayer)) return null;

  const head = it.items[0];
  const eligible = itemTransferCandidates(game, it, head.id);
  const rescuers = (Object.values(game[it.lp].board) as (BoardEntity | undefined)[])
    .filter((e): e is BoardEntity => !!e && eligible.includes(e.id));

  return (
    <CardPickModal glyph="⇄" eyebrow={`Item Transfer · ${it.sourceName} left the encounter`}
      title={`Take up ${head.name}?`}
      sub={`Exhaust a ready character with an open slot to equip it — or decline and it stays in the Dead Zone.`
        + (it.items.length > 1 ? ` (${it.items.length} items to resolve.)` : '')}
      picks={rescuers.map(e => ({
        key: e.id, name: e.name,
        caption: (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TBL.ink2 }}>
            exhausts to equip
          </span>
        ),
      }))}
      onPick={id => resolveItemTransfer(id as string)}
      pickTitle={n => `Exhaust ${n} to equip ${head.name}`}
      cancel={{ label: 'Decline — leave in Dead Zone', onClick: declineItemTransfer }}
    />
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
    <ModalShell glyph="⚔" eyebrow="Optional ability" title={`${pac.sourceName} attacks`}
      width="min(460px, 92vw)"
      footer={
        <>
          <div style={md.spacer} />
          <button style={md.btn('ghost')} onClick={() => resolve(false)}>No</button>
          <button style={md.btn('primary')} onClick={() => resolve(true)}>Pay {pac.payHP} HP</button>
        </>
      }>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: TBL.ink }}>
        Pay {pac.payHP} HP from your Player Character to deal {pac.bonus} additional damage?
      </div>
    </ModalShell>
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
    <CardPickModal glyph="✚" eyebrow={`${pa.entityName} is hit`}
      title="Choose which armor absorbs it"
      sub="The chosen armor prevents the damage and takes a counter (sacrificed at its limit)."
      picks={pa.candidates.map(c => {
        const next = c.counters + 1;
        const willBreak = next >= c.armor;
        return {
          key: c.id, name: c.name,
          caption: (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: willBreak ? TBL.amber : TBL.ink2 }}>
              {next}/{c.armor} counters{willBreak ? ' — breaks!' : ''}
            </span>
          ),
        };
      })}
      onPick={id => resolveArmor(id as string)}
      pickTitle={n => `${n} absorbs the hit`}
    />
  );
}

/** Equip-from-hand picker (Veteran of the Ashgrove): choose a hand item to equip. */
function EquipPickModal() {
  const ep = useGameStore(s => s.pendingEquipPick);
  const resolveEquipPick = useGameStore(s => s.resolveEquipPick);
  const cancelEquipPick = useGameStore(s => s.cancelEquipPick);
  if (!ep) return null;

  return (
    <CardPickModal glyph="⚒" eyebrow={ep.source}
      title="Equip an item from your hand"
      sub="Pick an item to equip to this character, or skip."
      picks={ep.items.map(card => ({ key: card.id, name: card.name, card }))}
      onPick={id => resolveEquipPick(id as string)}
      pickTitle={n => `Equip ${n}`}
      cancel={{ label: 'Skip', onClick: cancelEquipPick }}
    />
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
