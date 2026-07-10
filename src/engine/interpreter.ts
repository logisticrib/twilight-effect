// ─── Effect interpreter (declarative layer) ─────────────────────────────────────
// Target specs, condition/amount evaluation, and structured-effect gathering for
// cards and permanents. Moved verbatim from src/store/gameStore.ts (extraction
// plan, slice 4). resolveActionEffects — the imperative resolver — follows in
// slice 5: it is one mutually-recursive group with applyDamage/destroyEntity/
// resolveRemovalTriggers (combat.ts / entities.ts).
import type { BoardEntity, Card } from '../types/card';
import type { Effect, Amount, Condition, TargetSpec, Trigger, Cost, CardEffect } from '../types/effects';
import { CATALOG } from '../data/catalog';
import type { GameState } from './state';
import { charsOf, companionIds, constructIds } from './entities';
import { isPhysicalConstruct, currentWillpower } from './stats';

export function amountValue(a: Amount, die: number, controlled: number): number {
  if (typeof a === 'number') return a;
  if ('die' in a) return die;
  if ('halfDie' in a) return Math.floor(die / 2);
  if ('halfDieUp' in a) return Math.ceil(die / 2);
  if ('perControlled' in a) return controlled;
  return 0;
}

/** Would ANY of these NON-INTERACTIVE effects affect something right now? Ruled
 *  2026-07-08: an ability that would affect nothing cannot be activated — this is the
 *  pre-cost recipient check for auto-scoped group targets (interactive targets are
 *  checked via eligibleTargets). Deliberately conservative: ops/scopes this doesn't
 *  model count as "yes" so a new op can never be falsely refused. */
export function effectsWouldAffectSomething(game: GameState, lp: 'p1' | 'p2', effects: Effect[], selfId?: string): boolean {
  const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
  for (const e of effects) {
    switch (e.op) {
      case 'damage':
      case 'heal': {
        const t = e.target;
        if (t === 'allEnemies') { if (charsOf(game, opp).length) return true; break; }
        if (t === 'frontLineEnemy') { if (charsOf(game, opp, 'front').length) return true; break; }
        if (t === 'backLineEnemy') { if (charsOf(game, opp, 'back').length) return true; break; }
        if (t === 'ownParty') { if (charsOf(game, lp).length) return true; break; }
        if (t === 'ownCompanions') { if (companionIds(game, lp).length) return true; break; }
        if (t === 'self') { if (selfId) return true; break; }
        return true; // interactive / unmodeled scope — handled by the eligibleTargets path
      }
      case 'anchor': {
        if (e.target === 'ownPhysicalConstructs') {
          // The group op excludes the source itself (owner ruling 2026-07-03).
          if ((Object.values(game[lp].board) as (BoardEntity | undefined)[])
            .some(x => !!x && isPhysicalConstruct(x) && x.id !== selfId)) return true;
          break;
        }
        return true;
      }
      default:
        return true; // draw, buffs, dice, peeks… always meaningful (or unmodeled)
    }
  }
  return false;
}

/** Target specs that require clicking a single board entity. */
const INTERACTIVE_SPECS: TargetSpec[] = [
  'anyCharacter', 'enemyCharacter', 'ownCharacter', 'otherCharacter',
  'anyCompanion', 'enemyCompanion', 'ownCompanion',
  'anyConstruct', 'physicalConstruct', 'magicalConstruct',
];
export function isInteractiveSpec(spec: TargetSpec): boolean { return INTERACTIVE_SPECS.includes(spec); }

/** Eligible target ids for an interactive TargetSpec (used to highlight the board). */
export function eligibleTargets(game: GameState, lp: 'p1' | 'p2', spec: TargetSpec): string[] {
  const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
  switch (spec) {
    case 'anyCharacter':   return [...charsOf(game, lp), ...charsOf(game, opp)];
    case 'enemyCharacter': return charsOf(game, opp);
    case 'ownCharacter':   return charsOf(game, lp);
    case 'anyCompanion':   return [...companionIds(game, lp), ...companionIds(game, opp)];
    case 'enemyCompanion': return companionIds(game, opp);
    case 'ownCompanion':   return companionIds(game, lp);
    case 'physicalConstruct': return constructIds(game, isPhysicalConstruct);
    case 'magicalConstruct':  return constructIds(game, e => e.subtype === 'Incantation');
    case 'anyConstruct':      return constructIds(game, () => true);
    default: return [];
  }
}

export function conditionMet(game: GameState, lp: 'p1' | 'p2', cond: Condition): boolean {
  switch (cond.kind) {
    case 'controlsType': {
      return Object.values(game[lp].board).some(e => {
        if (!e) return false;
        const typeOk = cond.cardType === 'Construct' ? e.kind === 'construct' : e.kind === 'companion';
        return typeOk && (!cond.subtype || e.subtype === cond.subtype);
      });
    }
    case 'controlsCount': {
      const n = Object.values(game[lp].board).filter(e => e && (cond.of === 'companions' ? e.kind === 'companion' : e.kind === 'construct')).length;
      return n >= cond.min;
    }
    case 'willpowerAtLeast': return currentWillpower(game[lp]) >= cond.value;
    default: return true;
  }
}

/** The interactive target an effect needs (the single board pick), or null. */
export function effectTargetSpec(e: Effect): TargetSpec | null {
  switch (e.op) {
    case 'damage': return e.splash === 'board' ? null : (isInteractiveSpec(e.target) ? e.target : null);
    case 'heal':
    case 'bounce':
    case 'extraAttack':
    case 'anchor':
    case 'sacrificeItem':
    case 'animate':
    case 'forceAttack': return isInteractiveSpec(e.target) ? e.target : null;
    case 'dieCheck': {
      // The branch effects choose the target up-front (declared before the roll).
      for (const sub of [...e.onPass, ...e.onFail]) { const t = effectTargetSpec(sub); if (t) return t; }
      return null;
    }
    default: return null;
  }
}

/** Extra context threaded into the interpreter (combat triggers, Magic-Action mods). */
export interface EffectCtx {
  damagedOwner?: 'p1' | 'p2';   // for target:'damagedController'
  damageBonus?: number;         // +dmg per enemy character a Magic Action damages
}

// ─── Damage modifiers (passive, consulted by the damage pipeline) ──────────────
/** Sum of static `magicDamageBonus` from an entity's own card + its equipped items. */
export function staticMagicBonusOf(ent: BoardEntity): number {
  let sum = 0;
  const names = [ent.name];
  const lo = ent.loadout;
  if (lo) for (const it of [lo.weapon, ...lo.gear]) if (it) names.push(it.name);
  for (const name of names)
    for (const ce of CATALOG.find(c => c.name === name)?.effects ?? [])
      if (ce.trigger === 'static') for (const e of ce.effects) if (e.op === 'magicDamageBonus') sum += e.amount;
  return sum;
}

/** Total Magic-Action damage bonus a player's board projects (Burning Eye etc.). */
export function magicActionDamageBonus(game: GameState, lp: 'p1' | 'p2'): number {
  let sum = 0;
  for (const ent of Object.values(game[lp].board)) if (ent) sum += staticMagicBonusOf(ent);
  return sum;
}

/** EffectCtx carrying a Magic-Action damage bonus, when the source is a Magic Action. */
export function magicCtx(game: GameState, lp: 'p1' | 'p2', card?: Card): EffectCtx | undefined {
  if (!card || card.subtype !== 'Magic') return undefined;
  const b = magicActionDamageBonus(game, lp);
  return b > 0 ? { damageBonus: b } : undefined;
}

/** A permanent's structured effects for a given trigger (looked up from CATALOG by name). */
export function permanentEffects(ent: BoardEntity, trigger: Trigger): Effect[] {
  const card = CATALOG.find(c => c.name === ent.name);
  return (card?.effects ?? []).filter(c => c.trigger === trigger).flatMap(c => c.effects);
}

export interface ActivatedAbility {
  sourceName: string;      // the card the ability comes from (entity or equipped item)
  itemId?: string;         // set when the ability is on an equipped item
  cost?: Cost;
  effects: Effect[];
  oncePerTurn?: boolean;
  label: string;           // short button label
}

/** Gather an entity's activated abilities: its own card's + its equipped items'. */
export function gatherActivated(ent: BoardEntity): ActivatedAbility[] {
  const out: ActivatedAbility[] = [];
  const push = (name: string, itemId: string | undefined, fromName: string) => {
    const card = CATALOG.find(c => c.name === name);
    for (const ce of card?.effects ?? []) {
      if (ce.trigger !== 'activated') continue;
      out.push({ sourceName: fromName, itemId, cost: ce.cost, effects: ce.effects, oncePerTurn: ce.oncePerTurn, label: fromName });
    }
  };
  push(ent.name, undefined, ent.name);
  const lo = ent.loadout;
  // Dedup by item id — a heavy item occupies BOTH gear slots as the same object, and
  // without this its ability would be listed (and offered) twice.
  const seen = new Set<string>();
  if (lo) for (const it of [lo.weapon, ...lo.gear]) {
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    push(it.name, it.id, it.name);
  }
  return out;
}

/** Status marker (in ent.statuses) recording a once-per-turn ability has fired. */
export function abilityUsedTag(sourceName: string): string { return `ability-used:${sourceName}`; }

/** A card's clauses by name (un-flattened — clause-level fields like cost/optional intact). */
export function effectsOfCard(name: string): CardEffect[] {
  return CATALOG.find(c => c.name === name)?.effects ?? [];
}

/** Does this Action need an interactive target chosen on the board before resolving? */
export function actionTargetSpec(effects: Effect[]): TargetSpec | null {
  for (const e of effects) {
    const t = effectTargetSpec(e);
    if (t) return t;
  }
  return null;
}

/** A two-step action (pick own char, then a slot or an enemy), or null. */
export function twoStepKind(effects: Effect[]): 'reposition' | 'disarm' | 'moveAnchor' | null {
  for (const e of effects) {
    if (e.op === 'move' && e.to === 'anySlot' && e.target === 'ownCharacter') return 'reposition';
    if (e.op === 'attackDisarm') return 'disarm';
    if (e.op === 'moveAnchor') return 'moveAnchor';
  }
  return null;
}
