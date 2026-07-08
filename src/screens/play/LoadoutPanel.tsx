import type { CSSProperties } from 'react';
import { CardFace } from '../../components/CardFace';
import { CATALOG } from '../../data/catalog';
import { TBL, CLASSCLR, GLYPH } from '../../tokens';
import { btnProps } from '../../lib/a11y';
import { useGameStore, gatherActivated, abilityUsedTag, type GameState } from '../../store/gameStore';
import { canPlayActionCard } from '../../store/keywords';
import { handlePreviewWheel } from './previewScroll';
import type { BoardEntity, EquippedItem } from '../../types/card';

const ITEM_SCALE = 0.38;

const label: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: TBL.ink3,
  textTransform: 'uppercase', letterSpacing: '0.1em',
};

const panelStyle: CSSProperties = {
  width: '100%', height: '100%', boxSizing: 'border-box',
  minHeight: 0, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 12px',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.20)',
  border: `1px solid ${TBL.matLine}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
};

const divider: CSSProperties = { height: 1, background: TBL.matLine, margin: '2px 0' };

function kindLabel(kind: BoardEntity['kind']): string {
  return kind === 'pc' ? 'Player Character' : kind === 'construct' ? 'Construct' : 'Companion';
}

// ─── Action button ────────────────────────────────────────────────────────────
type BtnState = 'available' | 'primary' | 'pending' | 'used';

function ActBtn({ label: text, icon, state, title, onClick }: {
  label: string; icon: string; state: BtnState; title?: string; onClick?: () => void;
}) {
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 9px', borderRadius: 6,
    fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
    cursor: state === 'used' ? 'not-allowed' : 'pointer',
    opacity: state === 'used' ? 0.45 : 1,
    transition: 'opacity .12s',
    background: state === 'pending' ? TBL.amber2
               : state === 'primary' ? TBL.amber
               : state === 'used'    ? 'rgba(255,255,255,0.03)'
               :                       'rgba(255,255,255,0.06)',
    color: (state === 'pending' || state === 'primary') ? '#1a1208'
           : state === 'used' ? TBL.ink3 : TBL.ink,
    border: `1px solid ${
      state === 'pending' ? TBL.amber2
      : state === 'primary' ? TBL.amber
      : state === 'used' ? TBL.matLine
      : TBL.matLine2
    }`,
    boxShadow: state === 'pending' ? `0 0 12px 1px rgba(240,192,116,0.5)` : 'none',
  };
  return (
    <div style={style} title={title} {...btnProps(onClick, state === 'used')}>
      <span>{icon}</span>{text && <span>{text}</span>}
    </div>
  );
}

// ─── Action availability (ported from the old floating ActionBar) ─────────────
function computeActions(
  ent: BoardEntity,
  isYours: boolean,
  pendingAction: string | null,
  entSlot: string | null,
  game: GameState,
) {
  if (!isYours) return null;
  if (ent.kind === 'construct') return 'construct' as const;

  const { acts, tapped, exhausted, fresh, keywords, loadout } = ent;
  const isExhausted = tapped === 'major' || exhausted;
  const anyActTaken = acts.move || acts.minor || acts.major;
  const zealous = keywords.includes('Zealous');
  const isPC = ent.kind === 'pc';
  const hasWeapon = !!(loadout?.weapon);
  const hasTwoHanded = loadout?.weapon?.hands === 2;

  const inFrontLine = entSlot ? ['f1', 'f2', 'f3'].includes(entSlot) : false;
  const hasRanged = keywords.includes('Ranged');
  const canAttackFromPosition = inFrontLine || hasRanged;

  // Atomic activation: once you've activated another character, this one is sealed.
  const sealed = game.finishedActors.includes(ent.id);

  // Hit & Run grants one bonus move after attacking, bypassing the usual
  // "move must come first" / exhausted gates (consumed in resolveMove).
  const hitRunMove = ent.statuses.includes('hit-run-ready');

  // Zealous bypasses the entry-turn ("fresh") restriction for attacks (only).
  const attackOk = !sealed && !acts.major && !isExhausted && (!fresh || zealous) && (!isPC || hasWeapon) && canAttackFromPosition;
  const attackReason = sealed ? 'Activation finished' :
    !canAttackFromPosition ? 'Must be in Front Line (or have Ranged)' :
    isPC && !hasWeapon ? 'Needs a weapon' :
    fresh && !zealous ? 'Cannot attack on its entry turn' :
    acts.major ? 'Major used' : 'Exhausted';

  return {
    move:    { ok: !sealed && (hitRunMove || (!anyActTaken && !isExhausted)), reason: sealed ? 'Activation finished' : hitRunMove ? '' : anyActTaken ? 'Move must come first' : 'Exhausted' },
    attack:  { ok: attackOk, reason: attackReason },
    equip:   { ok: !sealed && !acts.minor, reason: sealed ? 'Activation finished' : 'Minor used' },
    ability: { ok: !sealed && !acts.major && !isExhausted && !fresh && !hasTwoHanded,
               reason: sealed ? 'Activation finished' : hasTwoHanded ? '2H weapon blocks Magic Actions' : fresh ? 'No Major Actions on its entry turn' : acts.major ? 'Major used' : 'Exhausted' },
    pendingAction,
  };
}

// ─── One action-economy pip (Move → Minor → Major), showing used/open/next/off ──
type PipState = 'used' | 'open' | 'next' | 'off';
function Pip({ label, st }: { label: string; st: PipState }) {
  const border = st === 'used' ? TBL.amber : (st === 'open' || st === 'next') ? TBL.good : TBL.matLine2;
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: '2px 6px', borderRadius: 3,
      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
      border: `1px solid ${border}`,
      background: st === 'used' ? TBL.amber : st === 'next' ? 'rgba(116,192,138,0.18)' : 'transparent',
      color: st === 'used' ? '#1a1208' : (st === 'open' || st === 'next') ? TBL.good : TBL.ink4,
      opacity: st === 'off' ? 0.5 : 1,
    }}>{st === 'used' ? '✓ ' : ''}{label}</span>
  );
}

/** The three action pips for a character, in fixed Move → Minor → Major order.
 *  `*Ok` are the live availability flags (already account for Zealous, first-turn,
 *  exhaustion, the activation lock, etc.) so the pips match the buttons exactly. */
function actionPips(ent: BoardEntity, sealed: boolean, moveOk: boolean, minorOk: boolean, majorOk: boolean): { move: PipState; minor: PipState; major: PipState } {
  const a = ent.acts;
  if (sealed) return { move: 'off', minor: 'off', major: 'off' };
  return {
    move:  a.move  ? 'used' : moveOk  ? (!a.minor && !a.major ? 'next' : 'open') : 'off',
    minor: a.minor ? 'used' : minorOk ? 'open' : 'off',
    major: a.major ? 'used' : majorOk ? 'open' : 'off',
  };
}

// ─── A single equipped-item slot rendered as a small, hoverable card ───────────
function ItemSlot({ item, slotName, owner }: { item: EquippedItem | null; slotName: string; owner: string }) {
  const setHovered = useGameStore(s => s.setHovered);
  const w = 200 * ITEM_SCALE, h = 280 * ITEM_SCALE;

  if (!item) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <span style={label}>{slotName}</span>
        <div style={{
          width: w, height: h, borderRadius: 8, flexShrink: 0,
          border: `1px dashed ${TBL.matLine}`,
          background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.16) 0 5px, transparent 5px 10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: TBL.ink4, fontFamily: "'Newsreader', serif", fontSize: 16,
        }}>·</div>
      </div>
    );
  }

  const card = CATALOG.find(c => c.name === item.name) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <span style={label}>
        {slotName}
        {item.armor != null && (
          <span style={{ color: TBL.amber2, marginLeft: 6 }}>
            A{item.armor}{item.counters ? `(${item.counters})` : ''}
          </span>
        )}
      </span>
      {card ? (
        <CardFace
          data={card}
          scale={ITEM_SCALE}
          hoverable
          onMouseEnter={() => setHovered({ data: card, owner })}
          onMouseLeave={() => setHovered(null)}
          onWheel={handlePreviewWheel}
        />
      ) : (
        <div style={{
          width: w, height: h, borderRadius: 8, flexShrink: 0,
          border: `1px solid ${TBL.matLine}`, background: 'rgba(255,255,255,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: TBL.ink2, fontFamily: "'Newsreader', serif", fontSize: 10,
          textAlign: 'center', padding: 6,
        }}>{item.name}</div>
      )}
    </div>
  );
}

const doneBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
  background: TBL.amber, color: '#1a1208', border: `1px solid ${TBL.amber}`,
};
const cancelBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
  background: 'rgba(224,106,106,0.1)', color: TBL.danger, border: `1px solid ${TBL.danger}44`,
};

// ─── Control surface: character status + loadout + actions (local right slot) ──
export function LoadoutPanel() {
  const game            = useGameStore(s => s.game);
  const localPlayer     = useGameStore(s => s.localPlayer);
  const pending         = useGameStore(s => s.pending);
  const pendingPlay     = useGameStore(s => s.pendingPlay);
  const cancelPending   = useGameStore(s => s.cancelPending);
  const cancelPlay      = useGameStore(s => s.cancelPlay);
  const beginMove       = useGameStore(s => s.beginMove);
  const beginAttack     = useGameStore(s => s.beginAttack);
  const markAction      = useGameStore(s => s.markAction);
  const resetActions    = useGameStore(s => s.resetActions);
  const adjustHp        = useGameStore(s => s.adjustHp);
  const selectEntity    = useGameStore(s => s.selectEntity);
  const pushToast       = useGameStore(s => s.pushToast);
  const equipItem       = useGameStore(s => s.equipItem);
  const playAction      = useGameStore(s => s.playAction);
  const activateAbility = useGameStore(s => s.activateAbility);

  const pendingCard = pendingPlay
    ? game[localPlayer].hand.find(c => c.id === pendingPlay.cardId)
    : null;
  const pendingIsItem = pendingCard?.type === 'Item';
  const pendingIsAction = pendingCard?.type === 'Action';

  // Resolve the selected entity + owner (same inline pattern as ActionBar)
  let found: { ent: BoardEntity; owner: 'p1' | 'p2' } | null = null;
  if (game.selected) {
    for (const owner of ['p1', 'p2'] as const) {
      for (const ent of Object.values(game[owner].board)) {
        if (ent?.id === game.selected) { found = { ent, owner }; break; }
      }
      if (found) break;
    }
  }

  // ── Armed Action card → resolve prompt (priority) ──
  if (pendingIsAction && pendingCard) {
    // The activating character was captured at arm time (selection is cleared when a
    // card is armed). Re-check the economy gate against that character.
    const actorId = pendingPlay?.actorId ?? game.selected;
    const actorEnt = actorId
      ? Object.values(game[localPlayer].board).find(e => e?.id === actorId) ?? null
      : null;
    const gate = actorEnt
      ? canPlayActionCard(game, localPlayer, actorEnt, pendingCard)
      : { ok: false, reason: 'Select a character, then re-arm this card' };
    return (
      <div style={panelStyle}>
        <span style={label}>Resolve Action{actorEnt ? ` · ${actorEnt.name}` : ''}</span>
        <div style={{ fontFamily: "'Newsreader', serif", fontSize: 16, color: TBL.amber2, fontWeight: 600 }}>
          ✦ {pendingCard.name}
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, lineHeight: 1.4 }}>
          {pendingCard.text || 'Action — resolves immediately'}
        </div>
        {!gate.ok && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.danger }}>
            {gate.reason}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <ActBtn icon="✓" label="Resolve" state={gate.ok ? 'primary' : 'used'} title={gate.ok ? undefined : gate.reason}
                  onClick={() => { playAction(pendingCard.id); cancelPlay(); }} />
          <ActBtn icon="✕" label="Cancel" state="available" onClick={() => cancelPlay()} />
        </div>
      </div>
    );
  }

  // ── Armed Item card, nothing selected → equip prompt ──
  if (pendingIsItem && pendingCard && !found) {
    return (
      <div style={panelStyle}>
        <span style={label}>Equip Item</span>
        <div style={{ fontFamily: "'Newsreader', serif", fontSize: 16, color: TBL.amber2, fontWeight: 600 }}>
          ◈ {pendingCard.name}
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink2, lineHeight: 1.4 }}>
          Click one of your characters to equip.
        </div>
        <div style={cancelBtn} onClick={() => cancelPlay()}>✕ Cancel</div>
      </div>
    );
  }

  // ── Nothing selected → placeholder ──
  if (!found) {
    return (
      <div style={panelStyle}>
        <span style={label}>Character Loadout</span>
        <div style={{
          flex: 1, minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Inter', sans-serif", fontSize: 12, color: TBL.ink3, textAlign: 'center',
          border: `1px dashed ${TBL.matLine}`, borderRadius: 8, padding: 12,
        }}>
          Select a character to view its loadout and actions.
        </div>
      </div>
    );
  }

  // ── A character is selected ──
  const { ent, owner } = found;
  const isYours = owner === localPlayer;
  const clr = CLASSCLR[ent.cls] ?? TBL.ink2;
  const loadout = ent.loadout ?? { weapon: null, gear: [] };
  const gear0 = loadout.gear[0] ?? null;
  const gear1 = loadout.gear[1] ?? null;
  const gear1Hidden = loadout.weapon?.hands === 2 ? false : gear0?.heavy;

  const entSlot = Object.entries(game[owner].board).find(([, e]) => e?.id === ent.id)?.[0] ?? null;
  const actions = computeActions(ent, isYours, pending?.charId === ent.id ? pending.action : null, entSlot, game);
  const abilities = gatherActivated(ent);
  // Atomic activation: a sealed character (you moved on to another) can't act.
  const sealed = isYours && ent.kind !== 'construct' && game.finishedActors.includes(ent.id);
  // Pips mirror the live button availability (which already accounts for Zealous,
  // first-turn, exhaustion, etc.). Major = any major action (attack or ability).
  const acts2 = actions && actions !== 'construct' ? actions : null;
  const pips = acts2
    ? actionPips(ent, sealed, acts2.move.ok, acts2.equip.ok, acts2.attack.ok || acts2.ability.ok)
    : null;
  const costLabel = (c?: { kind: string; amount?: number; count?: number }) =>
    !c ? '' : c.kind === 'sacrificeSelf' ? 'Sacrifice' : c.kind === 'exhaustSelf' ? 'Exhaust'
        : c.kind === 'payHP' ? `Pay ${c.amount} HP` : c.kind === 'removeAnchor' ? `−${c.count} anchor` : '';
  const hasPending = pending?.charId === ent.id;
  const pendingMsg = hasPending
    ? (pending!.action === 'move' ? 'Click a highlighted slot to move' : 'Click a highlighted enemy to attack')
    : null;

  return (
    <div style={panelStyle}>
      {/* Compact header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: "'Newsreader', serif", fontSize: 18, color: clr, lineHeight: 1 }}>
          {GLYPH[ent.cls] ?? '◆'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Newsreader', serif", fontSize: 15, fontWeight: 600, color: TBL.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ent.name}{!isYours ? ' · enemy' : ''}
          </div>
          <div style={{ ...label, marginTop: 2 }}>
            {ent.cls} · {kindLabel(ent.kind)}
          </div>
        </div>
      </div>

      {/* Compact status */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: "'Newsreader', serif", fontSize: 14, color: ent.hp / ent.maxHp < 0.4 ? TBL.danger : TBL.ink }}>
          ♥ {ent.hp}/{ent.maxHp}
        </span>
        {ent.anchors != null && ent.anchors > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.amber2 }}>⚓ {ent.anchors}</span>
        )}
        {ent.poison != null && ent.poison > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.good }}>☠ {ent.poison}</span>
        )}
        {isYours && ent.id === game.currentActor && !sealed && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.good, border: `1px solid ${TBL.good}66`, borderRadius: 3, padding: '1px 5px' }}>● activating</span>
        )}
        {sealed && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink4, border: `1px solid ${TBL.matLine2}`, borderRadius: 3, padding: '1px 5px' }}>activation finished</span>
        )}
      </div>
      {ent.keywords.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: -4 }}>
          {ent.keywords.map(k => (
            <span key={k} style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: clr,
              border: `1px solid ${clr}66`, borderRadius: 3, padding: '2px 5px',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>{k}</span>
          ))}
        </div>
      )}

      {/* Actions (left) + Loadout (right), side by side */}
      <div style={divider} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* Actions column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={label}>Actions</span>

          {isYours && ent.kind !== 'construct' && pips && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} title="Each character acts in this order, once each, per turn">
              <Pip label="Move" st={pips.move} />
              <span style={{ color: TBL.ink4, fontSize: 10 }}>→</span>
              <Pip label="Minor" st={pips.minor} />
              <span style={{ color: TBL.ink4, fontSize: 10 }}>→</span>
              <Pip label="Major" st={pips.major} />
            </div>
          )}

          {actions && actions !== 'construct' && isYours && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <ActBtn icon="⤢" label="Move"
                  state={hasPending && pending?.action === 'move' ? 'pending' : actions.move.ok ? 'available' : 'used'}
                  title={!actions.move.ok ? actions.move.reason : ''}
                  onClick={() => hasPending && pending?.action === 'move' ? cancelPending() : beginMove(ent.id)}
                />
                <ActBtn icon="⚔" label="Attack"
                  state={hasPending && pending?.action === 'attack' ? 'pending' : actions.attack.ok ? 'available' : 'used'}
                  title={!actions.attack.ok ? actions.attack.reason : ''}
                  onClick={() => hasPending && pending?.action === 'attack' ? cancelPending() : beginAttack(ent.id)}
                />
                <ActBtn icon="◈" label={pendingIsItem ? 'Equip ✦' : 'Equip'}
                  state={pendingIsItem ? 'primary' : actions.equip.ok ? 'available' : 'used'}
                  title={!pendingIsItem && !actions.equip.ok ? actions.equip.reason : pendingIsItem ? `Equip ${pendingCard!.name} to ${ent.name}` : 'Select an Item from your hand, then click Equip'}
                  onClick={() => {
                    if (pendingIsItem && pendingCard && actions.equip.ok) {
                      equipItem(ent.id, pendingCard.id);
                      cancelPlay();
                    } else if (!pendingIsItem) {
                      pushToast('Select an Item card from your hand first, then click Equip');
                    }
                  }}
                />
                {abilities.length > 0
                  ? abilities.map((ab, i) => {
                      const usedUp = !!ab.oncePerTurn && ent.statuses.includes(abilityUsedTag(ab.sourceName));
                      const cl = costLabel(ab.cost);
                      const blocked = usedUp || sealed;
                      return (
                        <ActBtn key={i} icon="✦" label={cl ? `${ab.label} · ${cl}` : ab.label}
                          state={blocked ? 'used' : 'available'}
                          title={sealed ? 'Activation finished' : usedUp ? 'Already used this turn' : `Activate: ${ab.sourceName}${cl ? ` (${cl})` : ''}`}
                          onClick={() => activateAbility(ent.id, i)}
                        />
                      );
                    })
                  : (
                    <ActBtn icon="✦" label="Ability"
                      state={actions.ability.ok ? 'available' : 'used'}
                      title={!actions.ability.ok ? actions.ability.reason : ''}
                      onClick={() => { markAction(ent.id, 'major'); pushToast(`${ent.name} uses an ability — Major action`); }}
                    />
                  )}
              </div>

              {pendingMsg && (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: TBL.amber2 }}>{pendingMsg}</span>
              )}

              {/* Playtest helpers */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <ActBtn icon="−1" label="HP" state="available" onClick={() => adjustHp(ent.id, -1)} />
                <ActBtn icon="+1" label="HP" state="available" onClick={() => adjustHp(ent.id, 1)} />
                <ActBtn icon="↺" label="" state="available" title="Reset action markers" onClick={() => resetActions(ent.id)} />
              </div>
            </>
          )}

          {actions === 'construct' && isYours && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {abilities.map((ab, i) => {
                const usedUp = !!ab.oncePerTurn && ent.statuses.includes(abilityUsedTag(ab.sourceName));
                const cl = costLabel(ab.cost);
                return (
                  <ActBtn key={i} icon="✦" label={cl ? `${ab.label} · ${cl}` : ab.label}
                    state={usedUp ? 'used' : 'available'}
                    title={`Activate: ${ab.sourceName}${cl ? ` (${cl})` : ''}`}
                    onClick={() => activateAbility(ent.id, i)}
                  />
                );
              })}
              <ActBtn icon="✕" label="Sacrifice" state="available"
                onClick={() => { adjustHp(ent.id, -999); selectEntity(null); pushToast(`${ent.name} sacrificed`); }}
              />
            </div>
          )}

          {!isYours && (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: TBL.amber2 }}>
              Opponent’s unit — select yours to act.
            </span>
          )}

          {/* Cancel pending / Done */}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {(hasPending || pendingPlay) && (
              <div style={cancelBtn} onClick={() => { cancelPending(); cancelPlay(); }}>✕ Cancel</div>
            )}
            <div style={{ ...doneBtn, flex: 1 }} onClick={() => { selectEntity(null); cancelPending(); cancelPlay(); }}>
              Done ↵
            </div>
          </div>
        </div>

        {/* Loadout column */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={label}>Loadout</span>
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8 }}>
            <ItemSlot item={loadout.weapon} slotName="⚔ Wpn" owner={owner} />
            <ItemSlot item={gear0} slotName="◈ G1" owner={owner} />
            {!gear1Hidden && <ItemSlot item={gear1} slotName="◈ G2" owner={owner} />}
          </div>
        </div>
      </div>
    </div>
  );
}
