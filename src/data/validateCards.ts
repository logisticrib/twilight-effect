/**
 * Deck-data validator — the data contract for card JSONs, and the MINT-GATE for the
 * card-generation pipeline: a PURE function of (candidate cards, existing card names,
 * keyword contract). Nothing here imports the engine, the store, or the shipped
 * catalog — previously minted names arrive as a PARAMETER (duplicate names are banned;
 * duplicate mechanics are fine). Returns human-readable problems; empty = mintable.
 *
 * HARD BANS enforced here (absolute owner rulings — no exceptions, so they live in
 * the gate, not just in tests that audit the current decks):
 *  - no effect may increase max HP (max HP is fixed; only healing exists);
 *  - no card may reference Initiative in keywords, text, or effects.
 * Softer design constraints (draw limits, mill, token caps…) are generation POLICY,
 * deliberately NOT validator rules.
 *
 * The runtime union mirrors below are kept honest in BOTH directions:
 *  - `satisfies readonly X[]` proves every listed entry is a real union member;
 *  - the exported `AssertNever` aliases prove every union member is listed — this
 *    file FAILS TO COMPILE when types/effects.ts gains a member it doesn't know.
 */
import type { Card } from '../types/card';
import type { Trigger, TargetSpec, Effect, Condition, Cost, Modifier, CardEffect } from '../types/effects';
import { KEYWORDS } from './keywordRegistry';

type AssertNever<T extends never> = T;

const TRIGGERS = [
  'onPlay', 'onEnter', 'equipped', 'static', 'onAttack', 'onDealDamage', 'onDamaged',
  'onKill', 'onDeath', 'onDestroy', 'onLeave', 'startOfTurn', 'endOfTurn',
  'onOpponentAction', 'activated',
] as const satisfies readonly Trigger[];
export type _ExhaustiveTriggers = AssertNever<Exclude<Trigger, (typeof TRIGGERS)[number]>>;

const TARGET_SPECS = [
  'anyCharacter', 'enemyCharacter', 'ownCharacter', 'otherCharacter',
  'anyCompanion', 'enemyCompanion', 'ownCompanion',
  'anyConstruct', 'physicalConstruct', 'magicalConstruct',
  'anyItem', 'targetPlayer',
  'self', 'allEnemies', 'allEnemyCompanions', 'ownCompanions', 'ownPhysicalConstructs', 'ownMagicalConstructs',
  'frontLineOwn', 'frontLineEnemy', 'backLineEnemy', 'sameLineAsTarget', 'ownParty',
  'damagedController',
] as const satisfies readonly TargetSpec[];
export type _ExhaustiveTargets = AssertNever<Exclude<TargetSpec, (typeof TARGET_SPECS)[number]>>;

const OPS = [
  'damage', 'damageSelfPC', 'heal', 'buff', 'draw', 'discard', 'mill', 'shuffleHandRedraw',
  'deckPeek', 'returnFromDead', 'search', 'move', 'bounce', 'extraAttack', 'forceAttack',
  'anchor', 'sacrifice', 'sacrificeItem', 'equipFromHand', 'animate', 'dieCheck',
  'attackDisarm', 'moveAnchor', 'attackBonus', 'magicDamageBonus', 'preventAnchorDecay',
  'lineWard', 'exhaustSelf', 'modal', 'gainControl', 'suppressKeywords', 'counterAction',
] as const satisfies readonly Effect['op'][];
export type _ExhaustiveOps = AssertNever<Exclude<Effect['op'], (typeof OPS)[number]>>;

const MODIFIERS = ['hpFloor1', 'cannotBeMoved', 'cannotAttack', 'doesNotReady'] as const satisfies readonly Modifier[];
export type _ExhaustiveModifiers = AssertNever<Exclude<Modifier, (typeof MODIFIERS)[number]>>;

const COST_KINDS = ['exhaustSelf', 'sacrificeSelf', 'sacrifice', 'payHP', 'discard', 'removeAnchor'] as const satisfies readonly Cost['kind'][];
export type _ExhaustiveCosts = AssertNever<Exclude<Cost['kind'], (typeof COST_KINDS)[number]>>;

const CONDITION_KINDS = [
  'controlsType', 'controlsCount', 'willpowerAtLeast', 'targetIsSubtype',
  'damagedIsEnemyCompanion', 'killedIsCompanion', 'killedIsPhysicalConstruct',
] as const satisfies readonly Condition['kind'][];
export type _ExhaustiveConditions = AssertNever<Exclude<Condition['kind'], (typeof CONDITION_KINDS)[number]>>;

const AMOUNT_KEYS = ['die', 'halfDie', 'halfDieUp', 'perControlled'] as const;

const CARD_TYPES = ['Companion', 'Item', 'Construct', 'Action'] as const;
const ACTION_COSTS = ['', 'Minor', 'Major', 'Special'] as const;
const ITEM_KINDS = ['Weapon', 'Armor', 'Trinket'] as const;

const has = (list: readonly string[], v: unknown): boolean => typeof v === 'string' && list.includes(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Keyword base word — "Armor 2" / "Reinforce 3" carry a printed parameter. */
const keywordBase = (kw: string) => kw.replace(/ \d+$/, '');

function validAmount(a: unknown): boolean {
  if (typeof a === 'number') return Number.isFinite(a);
  if (!a || typeof a !== 'object') return false;
  const keys = Object.keys(a);
  if (keys.length !== 1 || !has(AMOUNT_KEYS, keys[0])) return false;
  const v = (a as Record<string, unknown>)[keys[0]];
  // 'constructs' removed from the contract 2026-07-03 — see the Amount type note.
  if (keys[0] === 'perControlled') return v === 'companions';
  return isInt(v) && (v as number) >= 1;
}

function validCondition(c: unknown): boolean {
  return !!c && typeof c === 'object' && has(CONDITION_KINDS, (c as { kind?: unknown }).kind);
}

function validCost(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const cost = c as Record<string, unknown>;
  if (!has(COST_KINDS, cost.kind)) return false;
  if (cost.kind === 'payHP' && !isInt(cost.amount)) return false;
  if ((cost.kind === 'discard' || cost.kind === 'removeAnchor') && !isInt(cost.count)) return false;
  if (cost.kind === 'sacrifice' && !has(TARGET_SPECS, cost.target)) return false;
  return true;
}

function validateEffect(e: Effect, path: string, p: (msg: string) => void, keywords: Readonly<Record<string, unknown>>): void {
  const raw = e as unknown as Record<string, unknown>;
  if (!has(OPS, raw.op)) { p(`${path}: unknown op "${String(raw.op)}"`); return; }
  const target = (field: string) => {
    if (field in raw && !has(TARGET_SPECS, raw[field])) p(`${path}(${e.op}): bad ${field} "${String(raw[field])}"`);
  };
  const amount = () => { if (!validAmount(raw.amount)) p(`${path}(${e.op}): bad amount ${JSON.stringify(raw.amount)}`); };
  const count = (field: string, min = 1) => {
    if (!isInt(raw[field]) || (raw[field] as number) < min) p(`${path}(${e.op}): ${field} must be an integer ≥ ${min}`);
  };

  switch (e.op) {
    case 'damage':
      amount(); target('target');
      if (e.splash !== undefined && e.splash !== 'line' && e.splash !== 'board') p(`${path}(damage): bad splash "${String(e.splash)}"`);
      break;
    case 'damageSelfPC': amount(); break;
    case 'heal': amount(); target('target'); break;
    case 'buff':
      target('scope');
      // HARD BAN: nothing may increase max HP — max HP is fixed, only healing exists
      // (owner ruling 2026-06-22, re-confirmed 2026-07-03). No exceptions.
      if (e.stat === 'hp') p(`${path}(buff): +HP effects are BANNED — max HP is fixed, only healing exists`);
      else if (e.stat !== undefined && e.stat !== 'atk') p(`${path}(buff): bad stat "${String(e.stat)}"`);
      if (e.duration !== 'endOfTurn' && e.duration !== 'while') p(`${path}(buff): bad duration "${String(e.duration)}"`);
      for (const m of e.modifiers ?? []) if (!has(MODIFIERS, m)) p(`${path}(buff): unknown modifier "${String(m)}"`);
      for (const g of e.grant ?? []) if (!(keywordBase(g) in keywords)) p(`${path}(buff): grants unknown keyword "${g}"`);
      if (e.where?.line !== undefined && e.where.line !== 'front' && e.where.line !== 'back') p(`${path}(buff): bad where.line`);
      break;
    case 'draw':
      count('count');
      if (e.if !== undefined && !validCondition(e.if)) p(`${path}(draw): bad condition ${JSON.stringify(e.if)}`);
      break;
    case 'discard': count('count'); target('target'); break;
    case 'mill': count('count'); target('target'); break;
    case 'shuffleHandRedraw':
      if (e.offset !== undefined && !isInt(e.offset)) p(`${path}(shuffleHandRedraw): offset must be an integer`);
      break;
    case 'deckPeek': {
      count('look');
      const dests = Array.isArray(e.dests) ? e.dests : [];
      if (!dests.length || dests.some(d => !['hand', 'top', 'bottom'].includes(d))) p(`${path}(deckPeek): bad dests`);
      break;
    }
    case 'returnFromDead':
      if (e.to !== 'hand' && e.to !== 'encounter') p(`${path}(returnFromDead): bad to "${String(e.to)}"`);
      break;
    case 'search':
      if (typeof e.cardType !== 'string' || !e.cardType) p(`${path}(search): cardType required`);
      break;
    case 'move':
      target('target');
      if (e.to !== 'anySlot' && e.to !== 'adjacent') p(`${path}(move): bad to "${String(e.to)}"`);
      break;
    case 'bounce': case 'extraAttack': case 'sacrifice': case 'sacrificeItem': case 'equipFromHand':
      target('target'); break;
    case 'forceAttack': target('attackers'); target('target'); break;
    case 'anchor':
      if (!isInt(e.delta) || e.delta === 0) p(`${path}(anchor): delta must be a non-zero integer`);
      target('target'); break;
    case 'animate':
      if (!isInt(e.atk) || e.atk < 0 || !isInt(e.hp) || e.hp < 1) p(`${path}(animate): atk/hp invalid`);
      if (e.max !== undefined && (!isInt(e.max) || e.max < 1)) p(`${path}(animate): bad max`);
      target('target'); break;
    case 'dieCheck':
      if (!isInt(e.threshold) || e.threshold < 1 || e.threshold > 6) p(`${path}(dieCheck): threshold must be 1–6`);
      e.onPass.forEach((sub, i) => validateEffect(sub, `${path}.onPass[${i}]`, p, keywords));
      e.onFail.forEach((sub, i) => validateEffect(sub, `${path}.onFail[${i}]`, p, keywords));
      break;
    case 'attackDisarm': target('attacker'); target('target'); break;
    case 'moveAnchor': count('count'); break;
    case 'attackBonus': case 'magicDamageBonus':
      if (!isInt(e.amount) || e.amount < 1) p(`${path}(${e.op}): amount must be an integer ≥ 1`);
      break;
    case 'preventAnchorDecay': case 'lineWard': case 'exhaustSelf': case 'counterAction':
      break; // no fields
    case 'modal':
      if (!Array.isArray(e.options) || !e.options.length) p(`${path}(modal): options required`);
      else e.options.forEach((o, oi) => o.effects.forEach((sub, i) => validateEffect(sub, `${path}.options[${oi}][${i}]`, p, keywords)));
      break;
    case 'gainControl':
      target('target');
      if (e.duration !== 'while') p(`${path}(gainControl): duration must be "while"`);
      break;
    case 'suppressKeywords':
      target('scope');
      if (e.where?.line !== undefined && e.where.line !== 'front' && e.where.line !== 'back') p(`${path}(suppressKeywords): bad where.line`);
      break;
  }
}

function validateClause(clause: CardEffect, idx: number, p: (msg: string) => void, keywords: Readonly<Record<string, unknown>>): void {
  const path = `effects[${idx}]`;
  if (!has(TRIGGERS, clause.trigger)) p(`${path}: unknown trigger "${String(clause.trigger)}"`);
  if (clause.trigger === 'activated' && !clause.cost && !clause.oncePerTurn) {
    p(`${path}: activated ability needs a cost or oncePerTurn (§11 guard)`);
  }
  if (clause.cost !== undefined && !validCost(clause.cost)) p(`${path}: bad cost ${JSON.stringify(clause.cost)}`);
  if (clause.if !== undefined && !validCondition(clause.if)) p(`${path}: bad condition ${JSON.stringify(clause.if)}`);
  (clause.effects ?? []).forEach((e, i) => validateEffect(e, `${path}.effects[${i}]`, p, keywords));
}

/**
 * Validate a candidate card set. Empty result = mintable; each problem names the card.
 * `existingNames` = names of previously minted cards — a candidate colliding with one is
 * rejected (unique names are the identity rule; duplicated MECHANICS are fine).
 * `keywords` = the keyword contract (defaults to the canonical registry).
 */
export function validateCards(
  cards: readonly Card[],
  existingNames: Iterable<string> = [],
  keywords: Readonly<Record<string, unknown>> = KEYWORDS,
): string[] {
  const problems: string[] = [];
  const ids = new Map<string, string>();
  const minted = new Set(existingNames);
  const names = new Set<string>();
  for (const card of cards) {
    const p = (msg: string) => problems.push(`${card.name}: ${msg}`);
    if (ids.has(card.id)) p(`duplicate id "${card.id}" (also used by ${ids.get(card.id)})`);
    else ids.set(card.id, card.name);
    if (minted.has(card.name)) p('name already taken by a previously minted card (names are unique; mechanics may repeat)');
    else if (names.has(card.name)) p('duplicate name within this set (name-keyed lookups would silently pick the wrong card)');
    else names.add(card.name);

    // HARD BANS: Initiative (undefined in the rules) and Exile (forbidden — the Dead
    // Zone is the only discard pile, Card_Design_Parameters §7) were stripped from the
    // game; no card may reference either. DELIBERATELY BROAD: the sweep covers name,
    // flavor, keywords, rules text, and effects JSON. If a thematic card name ever
    // legitimately needs one of these words, scoping this down to rules-text-only is
    // the intended loosening — until then, broad catches more mistakes.
    const hay = [card.name ?? '', card.flavor ?? '', (card.keywords ?? []).join(' '), card.text ?? '', JSON.stringify(card.effects ?? [])].join(' ');
    if (/initiative/i.test(hay)) p('references Initiative — a banned mechanic');
    if (/exile/i.test(hay)) p('references Exile — a banned mechanic (the Dead Zone is the only discard pile)');

    if (!has(CARD_TYPES, card.type)) p(`unknown card type "${card.type}"`);
    if (!isInt(card.level) || card.level < 1 || card.level > 5) p(`level out of range: ${card.level}`);
    if (card.type === 'Action') {
      if (!has(ACTION_COSTS, card.actionSub)) p(`bad actionSub "${card.actionSub}"`);
      if (!has(ACTION_COSTS, card.actionPM)) p(`bad actionPM "${card.actionPM}"`);
    }
    if (card.type === 'Item' && !has(ITEM_KINDS, card.itemKind)) {
      p(`item needs a classification — itemKind "${card.itemKind}" not in ${ITEM_KINDS.join('/')}`);
    }
    if (card.type === 'Construct' && (!isInt(card.anchor) || (card.anchor as number) < 1)) {
      p(`construct needs anchor ≥ 1, got ${card.anchor}`);
    }
    if (card.type === 'Companion') {
      if (!isInt(card.attack) || (card.attack as number) < 0) p(`companion attack invalid: ${card.attack}`);
      if (!isInt(card.hp) || (card.hp as number) < 1) p(`companion hp must be ≥ 1, got ${card.hp}`);
    }
    for (const kw of card.keywords ?? []) {
      if (!(keywordBase(kw) in keywords)) p(`unknown keyword "${kw}"`);
    }
    (card.effects ?? []).forEach((clause, i) => validateClause(clause, i, p, keywords));
  }
  return problems;
}
