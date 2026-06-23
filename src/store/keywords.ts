import type { BoardEntity, Card, EquippedItem } from '../types/card';
import type { CardEffect, Modifier } from '../types/effects';
import type { GameState, PlayerState } from './gameStore';
import { CATALOG } from '../data/catalog';

/**
 * Keyword effect engine.
 *
 * Built around the canonical vocabulary in `Master_Keyword_List.md`, NOT around
 * whichever cards happen to exist — the decks are fixtures that exercise this.
 * Each keyword resolves at one of these lifecycle events, wired into the matching
 * seam in gameStore:
 *
 *   static    — recomputed whenever the board changes (auras)
 *   enter     — a permanent enters the encounter (placeCard / placePc)
 *   attack    — a character resolves an attack (resolveAttack)
 *   damaged   — a character would take damage (applyDamageToEntity)
 *   turnStart — the Ready phase of a controller's turn (endTurn)
 *
 * Status of the full vocabulary lives in KEYWORDS so the gaps stay visible.
 */
export type KwEvent = 'static' | 'enter' | 'attack' | 'damaged' | 'turnStart';

export interface KeywordSpec {
  event: KwEvent;
  done: boolean;
  /** Where the rule currently lives (engine fn or existing combat code). */
  note: string;
}

export const KEYWORDS: Record<string, KeywordSpec> = {
  // Combat & positioning (resolved in resolveAttack today)
  Ranged:    { event: 'attack',  done: true,  note: 'beginAttack eligibility' },
  Cleave:    { event: 'attack',  done: true,  note: 'resolveAttack splash' },
  Evasive:   { event: 'attack',  done: true,  note: 'targeting rules' },
  Zealous:   { event: 'attack',  done: true,  note: 'summoning-sickness bypass' },
  Guardian:  { event: 'attack',  done: true,  note: 'targeting rules' },
  Reckless:  { event: 'attack',  done: true,  note: 'resolveAttack self-damage' },
  'Hit & Run': { event: 'attack', done: true, note: 'grantHitRun + resolveMove gate' },
  // Items / defence
  'Armor':   { event: 'damaged', done: true,  note: 'applyDamageToEntity counters' },
  Acrobatics:{ event: 'damaged', done: true,  note: 'isImmuneToSplash' },
  // Static auras
  Dismay:    { event: 'static',  done: true,  note: 'recomputeStatics' },
  // Set-specific
  Oathsworn: { event: 'enter',   done: true,  note: 'oathsworn modal' },

  // ── Not yet implemented (need targeting UI or structured card data) ──────────
  Reinforce:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (add anchors)' },
  Dismantle:      { event: 'enter',   done: true,  note: 'pendingTrigger -> resolveTrigger (remove anchors / sacrifice)' },
  'Kit-Master':   { event: 'enter',   done: true,  note: 'pendingKit two-step (source item -> dest char)' },
  Scavenger:      { event: 'enter',   done: false, note: 'return item from Dead Zone' },
  Coercion:       { event: 'enter',   done: false, note: 'opponent discards or sacrifices' },
  'Animate Magic':{ event: 'enter',   done: false, note: 'construct -> companion' },
  Poison:         { event: 'damaged', done: false, note: 'exhaust + poison counter' },
  Untamed:        { event: 'static',  done: false, note: 'per-card text bonus (needs card data)' },
  Bane:           { event: 'attack',  done: false, note: 'double damage vs subtype/class' },
  Paranoia:       { event: 'enter',   done: false, note: 'peek/reorder opponent deck' },
};

/** Transient status marking an entity that may take its Hit & Run bonus move. */
export const HIT_RUN_STATUS = 'hit-run-ready';

function controlsKeyword(ps: PlayerState, kw: string): boolean {
  return Object.values(ps.board).some((e) => !!e && e.keywords.includes(kw));
}

/**
 * Recompute all static auras from current board state. Idempotent — returns the
 * same reference when nothing changed so callers can wrap returns cheaply.
 *
 * Dismay: a player is Dismayed (−1 Willpower, via effectiveWillpower) while the
 * OPPONENT controls one or more permanents with the Dismay keyword.
 */
export function recomputeStatics(game: GameState): GameState {
  const p1Dismayed = controlsKeyword(game.p2, 'Dismay');
  const p2Dismayed = controlsKeyword(game.p1, 'Dismay');
  if (game.p1.dismayed === p1Dismayed && game.p2.dismayed === p2Dismayed) return game;
  return {
    ...game,
    p1: { ...game.p1, dismayed: p1Dismayed },
    p2: { ...game.p2, dismayed: p2Dismayed },
  };
}

/**
 * Acrobatics — this character cannot be damaged by any source that does not
 * target it directly (splash/area/indirect). The primary target of an attack is
 * "targeted directly" and is unaffected; only splash (e.g. Cleave) is prevented.
 */
export function isImmuneToSplash(ent: BoardEntity): boolean {
  return ent.keywords.includes('Acrobatics');
}

/** Add the Hit & Run bonus-move marker to an entity's statuses (no duplicates). */
export function grantHitRun(ent: BoardEntity): string[] {
  return ent.statuses.includes(HIT_RUN_STATUS)
    ? ent.statuses
    : [...ent.statuses, HIT_RUN_STATUS];
}

/**
 * Physical Construct — the only legal target for Reinforce / Dismantle.
 * Per the Master List, Physical Constructs are the Trap and Fortification
 * subtypes (Builders/Rogues), as opposed to Magic (Incantation) or Vocal ones.
 */
export function isPhysicalConstruct(ent: BoardEntity): boolean {
  return ent.kind === 'construct' && (ent.subtype === 'Trap' || ent.subtype === 'Fortification');
}

/**
 * An on-enter keyword that needs a target chosen from the board. Parsed from the
 * keyword string ("Reinforce 2", "Dismantle 3") so card data stays declarative.
 *   reinforce — add N Anchor counters to a Physical Construct you control
 *   dismantle — remove up to N Anchor counters from an enemy Physical Construct;
 *               if it hits 0 counters it is sacrificed
 */
export type EnterTriggerKind = 'reinforce' | 'dismantle';
export interface EnterTrigger { kind: EnterTriggerKind; n: number; }

// ─── Effective attack ──────────────────────────────────────────────────────────
// Damage everywhere (combat + action cards + display) flows through this so that
// item bonuses, buffs, and auras are honoured in one place. With no card authoring
// the structured-effect lookups all sum to 0, so this returns the printed attack
// (identical to current behaviour) — it lights up as cards are wired.

function effectsOf(name: string): CardEffect[] | undefined {
  return CATALOG.find(c => c.name === name)?.effects;
}

/** Sum of `buff <stat>` with scope 'self' from an item's equipped/static clauses. */
function selfItemStat(item: EquippedItem, stat: 'atk' | 'hp'): number {
  const effects = effectsOf(item.name);
  if (!effects) return 0;
  let sum = 0;
  for (const ce of effects) {
    if (ce.trigger !== 'equipped' && ce.trigger !== 'static') continue;
    for (const e of ce.effects) {
      if (e.op === 'buff' && e.stat === stat && e.scope === 'self') sum += e.amount ?? 0;
    }
  }
  return sum;
}

function controllerOf(game: GameState, entId: string): 'p1' | 'p2' | null {
  if (Object.values(game.p1.board).some(e => e?.id === entId)) return 'p1';
  if (Object.values(game.p2.board).some(e => e?.id === entId)) return 'p2';
  return null;
}

/** Static `buff` effects projected by a source permanent: its own card's static
 *  clauses plus those of its equipped items (e.g. a Banner trinket's team aura). */
function staticBuffsOf(src: BoardEntity): import('../types/effects').Effect[] {
  const lists = [effectsOf(src.name)];
  const lo = src.loadout;
  if (lo) for (const it of [lo.weapon, ...lo.gear]) if (it) lists.push(effectsOf(it.name));
  const out: import('../types/effects').Effect[] = [];
  for (const effs of lists) {
    if (!effs) continue;
    for (const ce of effs) if (ce.trigger === 'static') for (const e of ce.effects) if (e.op === 'buff') out.push(e);
  }
  return out;
}

/** +stat from static-aura permanents you control (e.g. "your companions have +1
 *  attack", "your Warrior companions have +1 attack while in the front line"). */
function staticAuraStat(ent: BoardEntity, game: GameState, stat: 'atk' | 'hp'): number {
  const side = controllerOf(game, ent.id);
  if (!side) return 0;
  const isCompanion = ent.kind === 'companion';
  const slot = (Object.entries(game[side].board).find(([, e]) => e?.id === ent.id) ?? [])[0] as string | undefined;
  const entLine = slot ? (slot[0] === 'f' ? 'front' : 'back') : null;
  let sum = 0;
  for (const src of Object.values(game[side].board)) {
    if (!src) continue;
    for (const e of staticBuffsOf(src)) {
      if (e.op !== 'buff' || e.stat !== stat) continue;
      const scopeHit = e.scope === 'ownParty' || (e.scope === 'ownCompanions' && isCompanion);
      if (!scopeHit) continue;
      if (e.where?.line && e.where.line !== entLine) continue;
      if (e.where?.cls && e.where.cls !== ent.cls) continue;
      sum += e.amount ?? 0;
    }
  }
  return sum;
}

/** Sum of temporary +stat buffs on an entity (Action-card buffs etc.). */
function buffStat(ent: BoardEntity, stat: 'atk' | 'hp'): number {
  return ent.buffs?.reduce((s, b) => s + (stat === 'atk' ? (b.atk ?? 0) : 0), 0) ?? 0;
}

/** Combined +stat from items + static auras (no base, no temp). */
function itemAndAuraStat(ent: BoardEntity, game: GameState, stat: 'atk' | 'hp'): number {
  let sum = 0;
  const lo = ent.loadout;
  if (lo) {
    if (lo.weapon) sum += selfItemStat(lo.weapon, stat);
    for (const g of lo.gear) if (g) sum += selfItemStat(g, stat);
  }
  return sum + staticAuraStat(ent, game, stat);
}

/**
 * The attack value used for all damage: printed base + equipped item bonuses +
 * static auras you control + temporary buffs.
 */
export function effectiveAttack(ent: BoardEntity, game: GameState): number {
  return Math.max(0, (ent.atk ?? 0) + itemAndAuraStat(ent, game, 'atk') + buffStat(ent, 'atk'));
}

/**
 * The max HP used for healing caps + display: printed maxHp + equipped item +HP +
 * static aura +HP. (Per rules, HP bonuses only come as continuous statics; there
 * are no temporary +HP buffs.)
 */
export function effectiveMaxHp(ent: BoardEntity, game: GameState): number {
  return Math.max(1, ent.maxHp + itemAndAuraStat(ent, game, 'hp'));
}

/** Combat keywords an equipped item grants to its bearer (rules: "Equipped
 *  character has CLEAVE/RANGED/…"). Excludes item-bookkeeping keywords like
 *  Armor X and the equip-variant Kit-Master. */
const ITEM_GRANTED_KEYWORDS = new Set(['Cleave', 'Ranged', 'Hit & Run', 'Guardian', 'Evasive', 'Reckless', 'Zealous', 'Acrobatics']);

/** Is this companion under an opposing keyword-suppression aura (Binding Sigil)? */
function isKeywordSuppressed(ent: BoardEntity, game: GameState): boolean {
  if (ent.kind !== 'companion') return false;
  const side = controllerOf(game, ent.id);
  if (!side) return false;
  const opp: 'p1' | 'p2' = side === 'p1' ? 'p2' : 'p1';
  const slot = (Object.entries(game[side].board).find(([, e]) => e?.id === ent.id) ?? [])[0] as string | undefined;
  const entLine = slot ? (slot[0] === 'f' ? 'front' : 'back') : null;
  for (const src of Object.values(game[opp].board)) {
    if (!src) continue;
    for (const ce of effectsOf(src.name) ?? []) {
      if (ce.trigger !== 'static') continue;
      for (const e of ce.effects) {
        if (e.op !== 'suppressKeywords') continue;
        if (e.scope !== 'allEnemyCompanions') continue;     // affects the source's opponents
        if (e.where?.line && e.where.line !== entLine) continue;
        return true;
      }
    }
  }
  return false;
}

/**
 * Lines (front/back) a player's `lineWard` Fortifications protect: opposing
 * companions cannot attack the controller's characters on the line OPPOSITE the
 * ward. A Wall on the Front Line shields the Back Line, and vice-versa.
 */
export function wardedLines(board: PlayerState['board']): Set<'front' | 'back'> {
  const out = new Set<'front' | 'back'>();
  for (const [slot, ent] of Object.entries(board)) {
    if (!ent || ent.kind !== 'construct') continue;
    const hasWard = (effectsOf(ent.name) ?? []).some(ce => ce.trigger === 'static' && ce.effects.some(e => e.op === 'lineWard'));
    if (!hasWard) continue;
    out.add(slot[0] === 'f' ? 'back' : 'front'); // protects the opposite line
  }
  return out;
}

/** Keywords currently in effect: printed + granted by buffs + granted by items,
 *  unless suppressed by an opposing aura (then none). */
export function effectiveKeywords(ent: BoardEntity, game: GameState): string[] {
  if (isKeywordSuppressed(ent, game)) return [];
  const set = new Set(ent.keywords);
  if (ent.buffs) for (const b of ent.buffs) (b.grant ?? []).forEach(k => set.add(k));
  const lo = ent.loadout;
  if (lo) {
    for (const it of [lo.weapon, ...lo.gear]) {
      if (!it) continue;
      const card = CATALOG.find(c => c.name === it.name);
      card?.keywords.forEach(k => { if (ITEM_GRANTED_KEYWORDS.has(k)) set.add(k); });
    }
  }
  return [...set];
}

/** Whether a flag modifier (e.g. 'hpFloor1') is currently active on an entity. */
export function hasModifier(ent: BoardEntity, m: Modifier): boolean {
  return !!ent.buffs?.some(b => b.modifiers?.includes(m));
}

export function parseEnterTrigger(keywords: string[]): EnterTrigger | null {
  for (const kw of keywords) {
    const m = /^(Reinforce|Dismantle)\s+(\d+)$/.exec(kw);
    if (m) return { kind: m[1].toLowerCase() as EnterTriggerKind, n: parseInt(m[2], 10) };
  }
  return null;
}

/** Characters (not constructs) can hold items and be Kit-Master endpoints. */
export function isCharacter(ent: BoardEntity): boolean {
  return ent.kind === 'companion' || ent.kind === 'pc';
}

/**
 * The item Kit-Master will move from a source character: weapon first, else the
 * first occupied gear slot. (Player item-choice when multiple exist is future
 * work — the same simplification the Armor auto-select makes today.)
 */
export function firstItemOf(ent: BoardEntity): { item: EquippedItem; isWeapon: boolean } | null {
  const lo = ent.loadout;
  if (!lo) return null;
  if (lo.weapon) return { item: lo.weapon, isWeapon: true };
  const g = lo.gear.find((x): x is EquippedItem => !!x);
  return g ? { item: g, isWeapon: false } : null;
}

// ─── Action economy ───────────────────────────────────────────────────────────
// The cost a card charges when played from hand. `actionSub` is the authored field
// ('Minor' | 'Major' | 'Special'); it is empty on every current card, so we default
// to 'Major' — every Action card in the decks is a spell or combat maneuver, the
// canonical Major-Action category. Authored values override the default.
export type ActionCost = 'Minor' | 'Major' | 'Special';
export function actionTypeOf(card: Card): ActionCost {
  const s = card.actionSub;
  if (s === 'Minor' || s === 'Major' || s === 'Special') return s;
  return 'Major';
}

/** True if a character is equipped with a Two-Handed weapon (blocks Magic Actions). */
export function hasTwoHanded(ent: BoardEntity): boolean {
  return ent.loadout?.weapon?.hands === 2;
}

/** Effective Willpower for the play-from-hand level requirement: total Class Zone
 *  card count (player.willpower) minus Dismayed. Spending a Special Action flips a card
 *  face-down as a used-marker but does not lower this. */
export function playWillpower(player: PlayerState): number {
  return Math.max(0, player.willpower - (player.dismayed ? 1 : 0));
}

/**
 * Whether a card's required classes are present in the player's Class Zone. An
 * empty class slot imposes no requirement (the generic/cross-class pool). Dual-class
 * cards require BOTH classes to be present.
 */
export function classInZone(player: PlayerState, card: Card): boolean {
  const classes = new Set(player.classZone.map(c => c.cls));
  if (card.class1 && !classes.has(card.class1)) return false;
  if (card.class2 && !classes.has(card.class2)) return false;
  return true;
}

/**
 * The single action-economy gate for playing an Action card from hand, shared by
 * the store (playAction) and the UI (HandFan / LoadoutPanel) so they never disagree.
 * `ent` is the activating character whose budget is spent.
 */
export function canPlayActionCard(
  game: GameState,
  lp: 'p1' | 'p2',
  ent: BoardEntity,
  card: Card,
): { ok: boolean; reason?: string } {
  if (!isCharacter(ent)) return { ok: false, reason: 'Only a character can play an action' };

  // Atomic activation: a character whose activation is sealed cannot act again.
  if (game.finishedActors.includes(ent.id)) return { ok: false, reason: 'Activation already finished' };

  // Class requirement (always applies).
  if (!classInZone(game[lp], card)) {
    const need = card.class2 ? `${card.class1} & ${card.class2}` : card.class1;
    return { ok: false, reason: `Needs ${need} in Class Zone` };
  }
  // Willpower requirement: must have Willpower ≥ the card's Level to play it.
  const wp = playWillpower(game[lp]);
  if (wp < card.level) return { ok: false, reason: `Willpower ${wp} < level ${card.level}` };
  // Two-Handed weapon blocks Magic Actions (Major or Special).
  if (card.subtype === 'Magic' && hasTwoHanded(ent)) {
    return { ok: false, reason: '2H weapon blocks Magic Actions' };
  }

  const cost = actionTypeOf(card);
  if (cost === 'Special') {
    if (ent.kind !== 'pc') return { ok: false, reason: 'Special Actions are Player Character only' };
    if (!game[lp].classZone.some(c => !c.faceDown)) {
      return { ok: false, reason: 'No face-up Class Zone card to spend' };
    }
    return { ok: true };
  }
  if (cost === 'Minor') {
    if (ent.acts.minor) return { ok: false, reason: 'Minor action already used' };
    return { ok: true };
  }
  // Major (default): consumes the character's Major; needs them ready & settled in.
  const isExhausted = ent.tapped === 'major' || ent.exhausted;
  if (game.turn === 1 && lp === 'p1' && game.activePlayer === 'p1') {
    return { ok: false, reason: 'No Major Actions on Turn 1' };
  }
  if (ent.fresh) return { ok: false, reason: 'Summoning sickness' };
  if (ent.acts.major) return { ok: false, reason: 'Major action already used' };
  if (isExhausted) return { ok: false, reason: 'Exhausted' };
  return { ok: true };
}
