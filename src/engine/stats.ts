import type { BoardEntity, Card, EquippedItem } from '../types/card';
import type { CardEffect, Modifier } from '../types/effects';
import type { GameState, PlayerState } from './state';
import type { SlotId } from './geometry';
import { isFront } from './geometry';
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
 *   oppPlay   — an OPPONENT of the keyword's controller plays a Companion (placeCard;
 *               Paranoia — the controller gets the choice, not the placing player)
 *
 * Status of the full vocabulary lives in KEYWORDS so the gaps stay visible.
 *
 * The registry itself lives in `data/keywordRegistry.ts` (dependency-free, shared with
 * the deck validator / mint-gate) and is re-exported here for engine code.
 */
export { KEYWORDS, type KeywordSpec, type KwEvent } from '../data/keywordRegistry';

/** Transient status marking an entity that may take its Hit & Run bonus move. */
export const HIT_RUN_STATUS = 'hit-run-ready';

function controlsKeyword(ps: PlayerState, kw: string): boolean {
  return Object.values(ps.board).some((e) => !!e && e.keywords.includes(kw));
}

/**
 * Recompute all static auras from current board state. Idempotent — returns the
 * same reference when nothing changed so callers can wrap returns cheaply.
 *
 * Dismay: a player is Dismayed (−1 Willpower, via currentWillpower) while the
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
export function isImmuneToSplash(ent: BoardEntity, game: GameState): boolean {
  // effectiveKeywords: item-granted Acrobatics dodges too; suppressed doesn't.
  return effectiveKeywords(ent, game).includes('Acrobatics');
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

/** ONE definition of "carries Anchor counters" (Rules Note 2026-07-20 — decay keys
 *  on COUNTERS, not card type): the Ready Phase decay predicate and the UI pip
 *  display both consult this. Constructs always carry counters; an animated
 *  Manifest RETAINS its counters as its remaining lifespan. */
export function hasAnchorCounters(ent: BoardEntity): boolean {
  return ent.anchors != null;
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

/** Keywords granted to `ent` by friendly static `grantKeywords` auras (Bastion Wall:
 *  "Your front-line companions have GUARDIAN"). Scope covers own companions/party,
 *  optionally line-filtered by the AFFECTED entity's position. */
function auraGrantedKeywords(ent: BoardEntity, game: GameState): string[] {
  if (ent.kind === 'construct') return [];
  const side = controllerOf(game, ent.id);
  if (!side) return [];
  const slot = (Object.entries(game[side].board).find(([, e]) => e?.id === ent.id) ?? [])[0] as string | undefined;
  const entLine = slot ? (slot[0] === 'f' ? 'front' : 'back') : null;
  const out: string[] = [];
  for (const src of Object.values(game[side].board)) {
    if (!src) continue;
    for (const ce of effectsOf(src.name) ?? []) {
      if (ce.trigger !== 'static') continue;
      for (const e of ce.effects) {
        if (e.op !== 'grantKeywords') continue;
        if (e.scope === 'ownCompanions' && ent.kind !== 'companion') continue;
        if (e.scope !== 'ownCompanions' && e.scope !== 'ownParty') continue;
        if (e.where?.line && e.where.line !== entLine) continue;
        out.push(...e.keywords);
      }
    }
  }
  return out;
}

/** Keywords currently in effect: printed + granted by buffs + granted by items +
 *  granted by friendly static auras, unless suppressed by an opposing aura (then none). */
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
  auraGrantedKeywords(ent, game).forEach(k => set.add(k));
  return [...set];
}

/** Watchtower — "Your back-line companions may attack as if they had Ranged": a
 *  static permission for ATTACK ELIGIBILITY only. Deliberately NOT a Ranged grant —
 *  cards do what they say, and Watchtower's text grants attack permission, not the
 *  keyword itself (textual fidelity). RATIONALE CORRECTED 2026-07-16: the ruling
 *  stands, but the old comment justified it via a defender-Ranged targetability
 *  downside — that targeting clause was a documentation error removed on this
 *  date (canon RANGED is offensive only; a defender's keywords never affect its
 *  targetability). Eligibility-only remains correct on textual grounds alone. */
export function hasBackLineAttackAura(game: GameState, side: 'p1' | 'p2'): boolean {
  return Object.values(game[side].board).some(src => !!src
    && (effectsOf(src.name) ?? []).some(ce => ce.trigger === 'static'
      && ce.effects.some(e => e.op === 'backLineAttack')));
}

// ─── Attack targeting: the single shared gate (bugfix, owner-reported 2026-07-20) ──
// CommandZone shipped (initial commit) with its OWN copies of attack-position
// eligibility and target legality; the store's rules then evolved (Watchtower
// 2026-07-08, Guardian legality 2026-07-15, Ranged excision 2026-07-16) and the
// copies did not — a Watchtower-granted back-line attacker armed a targeting
// prompt with ZERO highlights. These helpers are now the ONE source of truth:
// beginAttack / resolveAttack and the UI highlight computation all consult them,
// so the prompt and the reducer cannot disagree (ab8a5b0 single-gate discipline).

/** Position eligibility to INITIATE an attack: Front Line, Ranged (canon:
 *  "This character can attack from the Back Line"), or a Watchtower-style aura
 *  covering the controller's back-line COMPANIONS. Uses effectiveKeywords —
 *  item-granted Ranged counts, suppressed Ranged doesn't. */
export function canAttackFromPosition(game: GameState, ent: BoardEntity, controller: 'p1' | 'p2', slot: SlotId): boolean {
  return isFront(slot) || effectiveKeywords(ent, game).includes('Ranged')
    || (ent.kind === 'companion' && hasBackLineAttackAura(game, controller));
}

/** Front-Line-priority legality of ONE target id for `attacker` (corrected rule
 *  2026-07-16): legal iff the target stands in the front line, the front line
 *  holds no characters, or the attacker has Evasive — the defender's keywords
 *  play no role in its targetability. An id not on the opposing board passes
 *  through (outside this rule's scope), matching the gate's prior behavior. */
export function isLegalAttackTarget(game: GameState, attacker: BoardEntity, attackerSide: 'p1' | 'p2', targetId: string): boolean {
  const oppBoard = game[attackerSide === 'p1' ? 'p2' : 'p1'].board;
  const entries = Object.entries(oppBoard) as [SlotId, BoardEntity | undefined][];
  const sl = entries.find(([, e]) => e?.id === targetId)?.[0];
  if (!sl) return true;
  if (isFront(sl)) return true;
  const frontLineOccupied = entries.some(([s, e]) => e && e.kind !== 'construct' && isFront(s));
  return !frontLineOccupied || effectiveKeywords(attacker, game).includes('Evasive');
}

/** Ready opposing Guardians that BIND `attacker` — canon GUARDIAN (quoted
 *  verbatim): "While this character is ready (not exhausted) and a legal
 *  target, opponents must attack it before any other character." Guardian
 *  applies WITHIN the legal set (05b31af). */
export function bindingGuardianIds(game: GameState, attacker: BoardEntity, attackerSide: 'p1' | 'p2'): string[] {
  const oppBoard = game[attackerSide === 'p1' ? 'p2' : 'p1'].board;
  return (Object.values(oppBoard) as (BoardEntity | undefined)[])
    .filter((e): e is BoardEntity => !!e && !e.exhausted && e.kind !== 'construct'
      && effectiveKeywords(e, game).includes('Guardian')
      && isLegalAttackTarget(game, attacker, attackerSide, e.id))
    .map(e => e.id);
}

/** The COMPLETE legal-target set for `attacker` right now. Characters only —
 *  canon (GRU §Targeting Rules, verbatim): "Constructs cannot be attacked and
 *  do not satisfy or interfere with Front Line priority." Composes the same
 *  primitives resolveAttack refuses with: Front-Line-priority legality,
 *  Guardian binding within the legal set, and the Fortification ward filter
 *  (companion attackers only). The UI highlights exactly this set. */
export function legalAttackTargetIds(game: GameState, attacker: BoardEntity, attackerSide: 'p1' | 'p2'): Set<string> {
  const oppBoard = game[attackerSide === 'p1' ? 'p2' : 'p1'].board;
  const binding = bindingGuardianIds(game, attacker, attackerSide);
  const warded = attacker.kind === 'companion' ? wardedLines(oppBoard) : new Set<'front' | 'back'>();
  const ids = new Set<string>();
  for (const [slot, e] of Object.entries(oppBoard) as [SlotId, BoardEntity | undefined][]) {
    if (!e || e.kind === 'construct') continue;
    if (!isLegalAttackTarget(game, attacker, attackerSide, e.id)) continue;
    if (binding.length > 0 && !binding.includes(e.id)) continue;
    if (warded.has(isFront(slot) ? 'front' : 'back')) continue;
    ids.add(e.id);
  }
  return ids;
}

// ─── Standing-restriction auras (arc 3, owner-ratified 2026-07-15) ─────────────
// "Cannot" beats "can" (R1): the legality gates call these AFTER every permission
// (Ranged, Watchtower coverage, Zealous, …), so a restriction always has the final
// word — a structural property of the gate order, not a per-card special case.
// Aura-style detection at check time from the OPPOSING side's in-play statics
// (the preventionEffectsFor / auraGrantedKeywords discipline — no cached state, so
// the restriction lives and dies with its source, R4).

/** The opposing static aura restricting `ent` (a companion in `slot`, controlled by
 *  `controller`) from ATTACKING right now — returns the source card's name for the
 *  player-facing reason, or null when unrestricted. */
export function attackRestrictedBy(game: GameState, ent: BoardEntity, controller: 'p1' | 'p2', slot: SlotId): string | null {
  if (ent.kind !== 'companion') return null; // engine-supported scope: opposing COMPANIONS
  const opp: 'p1' | 'p2' = controller === 'p1' ? 'p2' : 'p1';
  for (const src of Object.values(game[opp].board)) {
    if (!src) continue;
    for (const ce of effectsOf(src.name) ?? []) {
      if (ce.trigger !== 'static') continue;
      for (const e of ce.effects) {
        if (e.op !== 'restrictAttack') continue;
        if (e.where?.line && (e.where.line === 'front') !== isFront(slot)) continue;
        return src.name;
      }
    }
  }
  return null;
}

/** The opposing static aura restricting `ent` from MOVING from `fromSlot` to
 *  `toSlot` — returns the source card's name, or null. Only movement BETWEEN the
 *  front and back lines can be restricted (R4: lateral within-line repositioning is
 *  not "between" lines; entering the encounter is not movement and never consults
 *  this). Covers ALL movement forms — chosen moves and effect-driven repositioning
 *  alike (R3): every mover-execution path calls this. */
export function moveRestrictedBy(game: GameState, ent: BoardEntity, controller: 'p1' | 'p2', fromSlot: SlotId, toSlot: SlotId): string | null {
  if (ent.kind !== 'companion') return null; // engine-supported scope: opposing COMPANIONS
  if (isFront(fromSlot) === isFront(toSlot)) return null; // lateral — not "between" lines
  const opp: 'p1' | 'p2' = controller === 'p1' ? 'p2' : 'p1';
  for (const src of Object.values(game[opp].board)) {
    if (!src) continue;
    for (const ce of effectsOf(src.name) ?? []) {
      if (ce.trigger !== 'static') continue;
      for (const e of ce.effects) {
        if (e.op === 'restrictMove' && e.between === 'lines') return src.name;
      }
    }
  }
  return null;
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

/**
 * Bane — printed as "X's Bane" (Goblin's Bane, Undead's Bane…): this character
 * deals double damage to Companions of the named subtype or class. Parsed from
 * the keyword string, like Reinforce/Dismantle, so card data stays declarative.
 * Returns every named prey (a character could carry more than one Bane).
 */
export function parseBanes(keywords: string[]): string[] {
  const out: string[] = [];
  for (const kw of keywords) {
    const m = /^(.+)'s Bane$/.exec(kw);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Whether an attack carrying these Bane subjects doubles against this defender.
 *  Companions only (per the Master List); matches subtype OR class. */
export function isBaneTarget(banes: string[], defender: BoardEntity): boolean {
  if (defender.kind !== 'companion') return false;
  return banes.some(b => b === defender.subtype || b === defender.cls);
}

/**
 * Animate Magic — printed "Animate Magic X": when this enters, a Magical
 * (Incantation) Construct you control becomes an X/X Manifest companion.
 * Parsed from the keyword string like Reinforce/Dismantle; returns X, or null
 * when the keyword is absent (or printed without its parameter).
 */
export function parseAnimateMagic(keywords: string[]): number | null {
  for (const kw of keywords) {
    const m = /^Animate Magic\s+(\d+)$/.exec(kw);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// (Paranoia needs no parser: the canonical keyword is bare — see docs/Master_Keyword_List.md.
//  It is not an on-enter trigger of the printed card at all; placeCard checks the OPPONENT's
//  board for permanents whose effectiveKeywords include 'Paranoia' when a Companion is played.)

/** Status marking a character that holds Poison counters (`poison` > 0). */
export const POISONED_STATUS = 'Poisoned';

/**
 * Poison — a character damaged by a Poison attacker is exhausted and gains a
 * Poison counter (one per damaging hit; they stack). It does NOT ready at its
 * controller's Ready phase: the start-of-turn Poison check (PoisonModal →
 * resolvePoison) either cleanses it — counters removed, readied — or keeps it
 * exhausted and damages the controller 1 per counter. This is the entity patch
 * for one damaging hit.
 */
export function poisonHitPatch(ent: BoardEntity): Partial<BoardEntity> {
  return {
    poison: (ent.poison ?? 0) + 1,
    statuses: ent.statuses.includes(POISONED_STATUS) ? ent.statuses : [...ent.statuses, POISONED_STATUS],
    tapped: 'major',
    exhausted: true,
  };
}

/** Characters (not constructs) can hold items and be Kit-Master endpoints. */
export function isCharacter(ent: BoardEntity): boolean {
  return ent.kind === 'companion' || ent.kind === 'pc';
}

/**
 * A character's lead item: weapon first, else the first occupied gear slot.
 * Used where a single item is taken without a choice (e.g. Disarming Blow's
 * sacrifice). Kit-Master uses {@link allItemsOf} so the player picks when 2+.
 */
export function firstItemOf(ent: BoardEntity): { item: EquippedItem; isWeapon: boolean } | null {
  const lo = ent.loadout;
  if (!lo) return null;
  if (lo.weapon) return { item: lo.weapon, isWeapon: true };
  const g = lo.gear.find((x): x is EquippedItem => !!x);
  return g ? { item: g, isWeapon: false } : null;
}

/** Every equipped item on a character (weapon first, then occupied gear slots),
 *  deduplicated by id so a `heavy` item — stored in both gear slots — appears once.
 *  Drives the Kit-Master player-choice picker when a source holds 2+ items. */
export function allItemsOf(ent: BoardEntity): { item: EquippedItem; isWeapon: boolean }[] {
  const lo = ent.loadout;
  if (!lo) return [];
  const out: { item: EquippedItem; isWeapon: boolean }[] = [];
  const seen = new Set<string>();
  if (lo.weapon) { out.push({ item: lo.weapon, isWeapon: true }); seen.add(lo.weapon.id); }
  for (const g of lo.gear) if (g && !seen.has(g.id)) { out.push({ item: g, isWeapon: false }); seen.add(g.id); }
  return out;
}

/** A character carries one weapon and up to two gear (a `heavy` item takes both
 *  gear slots). These mirror the placement rules in `equipOnto`. */
export const GEAR_CAP = 2;
export function gearFreeSlots(ent: BoardEntity): number {
  const gear = ent.loadout?.gear ?? [];
  const occ = gear.filter((g): g is EquippedItem => !!g).length;
  return Math.max(0, GEAR_CAP - occ);
}
/** Can `ent` receive an item of the given kind without exceeding its slot capacity? */
export function canHoldItem(ent: BoardEntity, isWeapon: boolean, heavy: boolean): boolean {
  if (isWeapon) return !ent.loadout?.weapon;        // one weapon slot, no swap on transfer
  return gearFreeSlots(ent) >= (heavy ? 2 : 1);
}

// ─── Action economy ───────────────────────────────────────────────────────────
// The cost a card charges when played from hand. The decks author the Minor/Major
// flag in `actionPM` (`actionSub` — same domain plus 'Special' — takes precedence if
// ever set; it is empty on every current card). Unauthored cards default to 'Major' —
// the canonical category for spells and combat maneuvers.
export type ActionCost = 'Minor' | 'Major' | 'Special';
export function actionTypeOf(card: Card): ActionCost {
  const s = card.actionSub || card.actionPM;
  if (s === 'Minor' || s === 'Major' || s === 'Special') return s;
  return 'Major';
}

/** True if a character is equipped with a Two-Handed weapon (blocks Magic Actions). */
export function hasTwoHanded(ent: BoardEntity): boolean {
  return ent.loadout?.weapon?.hands === 2;
}

/**
 * THE one "current Willpower" (owner ruling 2026-07-04): the Class-Zone card count
 * (player.willpower — face-down cards still count; Special Actions don't lower it)
 * minus 1 while Dismayed, floored at 0. EVERY Willpower reader goes through this
 * accessor — the play-from-hand level gate, the Poison check, the fleeing check, and
 * card conditions (willpowerAtLeast). Never read player.willpower raw in a check;
 * that field is the base stat, not the current value. A consequence the owner ruled
 * intended: Dismay pressure alone can push companions over the fleeing threshold.
 */
export function currentWillpower(player: PlayerState): number {
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
/**
 * Gate for a SPECIAL ACTION play — placing a Companion/Construct from hand (Rules
 * Note 2026-07-15: Special Actions are part of the Player Character's atomic
 * activation; §24 atomicity is policed across characters, not within the PC's own
 * activation). Returns the PC's entity id (the acting character — callers apply
 * the activation patch with it, which also seals a companion mid-activation) plus
 * a refusal reason when the PC's activation is already sealed. Shared by the store
 * reducers AND the hand UI so the two can never disagree. Special-cost ACTION
 * cards need no extra wiring: they route through canPlayActionCard with the PC as
 * actor (Specials are PC-only) and playAction applies the activation patch.
 */
/**
 * The single legality gate for a MINOR ACTION (owner-ratified 2026-07-15 —
 * §24 "During activation, in order" is STRICT): a character that has taken its
 * Major (or is otherwise at 90°/exhausted) has no 45° state left to enter —
 * rotation only advances, so a Minor after the Major is untrackable and illegal.
 * Shared by every Minor-cost path (equip, Minor Action cards, Minor activated
 * abilities) so no reducer can disagree. Returns the refusal reason or null.
 */
export function minorActionReason(ent: BoardEntity): string | null {
  if (ent.acts.major || ent.tapped === 'major' || ent.exhausted) {
    return 'Already fully exhausted — Minor Actions must come before the Major';
  }
  if (ent.acts.minor) return 'Minor action already used';
  return null;
}

export function specialActionActor(game: GameState, lp: 'p1' | 'p2'): { pcId: string | null; reason?: string } {
  const pc = (Object.values(game[lp].board) as (BoardEntity | undefined)[]).find(e => e?.kind === 'pc');
  if (!pc) return { pcId: null }; // no PC on the board (setup edges) — nothing to seal
  if (game.finishedActors.includes(pc.id)) return { pcId: pc.id, reason: 'Activation already finished' };
  return { pcId: pc.id };
}

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
  const wp = currentWillpower(game[lp]);
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
    const reason = minorActionReason(ent); // strict §24 order (2026-07-15): no Minor after the Major
    if (reason) return { ok: false, reason };
    return { ok: true };
  }
  // Major (default): consumes the character's Major; needs them ready & settled in.
  const isExhausted = ent.tapped === 'major' || ent.exhausted;
  if (ent.fresh) return { ok: false, reason: 'No Major Actions on its entry turn' };
  if (ent.acts.major) return { ok: false, reason: 'Major action already used' };
  if (isExhausted) return { ok: false, reason: 'Exhausted' };
  return { ok: true };
}
