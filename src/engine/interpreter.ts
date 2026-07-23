// ─── Effect interpreter (declarative layer) ─────────────────────────────────────
// Target specs, condition/amount evaluation, and structured-effect gathering for
// cards and permanents. Moved verbatim from src/store/gameStore.ts (extraction
// plan, slice 4). resolveActionEffects — the imperative resolver — follows in
// slice 5: it is one mutually-recursive group with applyDamage/destroyEntity/
// resolveRemovalTriggers (combat.ts / entities.ts).
import type { BoardEntity, Card } from '../types/card';
import type { Effect, Amount, Condition, TargetSpec, Trigger, Cost, CardEffect } from '../types/effects';
import { CATALOG } from '../data/catalog';
import { isFront } from './geometry';
import type { GameState, PendingDeadPick, ArmorChoiceData } from './state';
import { charsOf, companionIds, constructIds, findEntityAnywhere, updateEntity,
         removeEntity, destroyEntity, setPcHp, pcIdOf, itemCardsOf, itemTransferOf } from './entities';
import { isPhysicalConstruct, currentWillpower, effectiveAttack, effectiveMaxHp, isImmuneToSplash } from './stats';
// Function-level cycle with combat.ts (resolveActionEffects deals damage; combat
// triggers resolve effects). Safe: hoisted functions, called only at runtime.
import { applyDamage } from './combat';
import { rollD6, shuffle } from './lifecycle';

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
      case 'returnFromDead': {
        // Universal pre-cost refusal (RULED 2026-07-08 — the Quill precedent),
        // aligned 2026-07-22 for Fence's Ledger (owner-confirmed): a recovery with
        // no eligible Dead-Zone card affects nothing — refuse BEFORE any cost is
        // paid. Filters mirror the interpreter's (cardType, itemKind).
        if (e.to !== 'hand') return true; // 'encounter' unimplemented — stay conservative
        if (game[lp].dead.some(c =>
          (!e.cardType || c.type === e.cardType) && (!e.itemKind || c.itemKind === e.itemKind))) return true;
        break;
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
    // Arc B (2026-07-23): a buff with an interactive scope is a targeted stamp
    // (Whispers of the West / Doubt). Shipped buff scopes (ownParty/ownCompanions/
    // self) are not interactive → null, exactly as before.
    case 'buff': return isInteractiveSpec(e.scope) ? e.scope : null;
    default: return null;
  }
}

/** Extra context threaded into the interpreter (combat triggers, Magic-Action mods,
 *  reactive-trigger events). */
export interface EffectCtx {
  damagedOwner?: 'p1' | 'p2';   // for target:'damagedController'
  damageBonus?: number;         // +dmg per enemy character a Magic Action damages
  subjectId?: string;           // for target:'eventSubject' — the reactive event's companion
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
  // The entity's own card AND its equipped items' clauses (2026-07-16 — Lens of
  // Foretelling's start-of-turn peek lived on an EQUIPPED item and was silently
  // dead: this helper only read the body card). Matches combatTriggerEffects'
  // long-standing card+items discipline.
  const lists = [CATALOG.find(c => c.name === ent.name)?.effects];
  const lo = ent.loadout;
  if (lo) {
    const seen = new Set<string>();
    for (const it of [lo.weapon, ...lo.gear]) {
      if (!it || seen.has(it.id)) continue;
      seen.add(it.id);
      lists.push(CATALOG.find(c => c.name === it.name)?.effects);
    }
  }
  return lists.flatMap(effs => (effs ?? []).filter(c => c.trigger === trigger).flatMap(c => c.effects));
}

export interface ActivatedAbility {
  sourceName: string;      // the card the ability comes from (entity or equipped item)
  itemId?: string;         // set when the ability is on an equipped item
  cost?: Cost;
  effects: Effect[];
  oncePerTurn?: boolean;
  actionCost?: 'minor' | 'major'; // character action economy (default 'major') — 2026-07-15
  label: string;           // short button label
}

/** Gather an entity's activated abilities: its own card's + its equipped items'. */
export function gatherActivated(ent: BoardEntity): ActivatedAbility[] {
  const out: ActivatedAbility[] = [];
  const push = (name: string, itemId: string | undefined, fromName: string) => {
    const card = CATALOG.find(c => c.name === name);
    for (const ce of card?.effects ?? []) {
      if (ce.trigger !== 'activated') continue;
      out.push({ sourceName: fromName, itemId, cost: ce.cost, effects: ce.effects, oncePerTurn: ce.oncePerTurn, actionCost: ce.actionCost, label: fromName });
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

/**
 * Resolve a list of onPlay effects. `targetId` (if present) binds the single
 * interactive target. A single d6 is rolled per card and shared across die/halfDie
 * effects (e.g. Wrath of the Untamed Sky). Returns the new game + log lines.
 */
export function resolveActionEffects(game: GameState, lp: 'p1' | 'p2', sourceName: string, effects: Effect[], targetId?: string, sourceId?: string, ctx?: EffectCtx, sink?: PendingDeadPick[], armorSink?: ArmorChoiceData[]): { game: GameState; msgs: string[] } {
  const opp: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
  const die = rollD6();
  const usesDie = effects.some(e => (e.op === 'damage' || e.op === 'damageSelfPC') && typeof e.amount === 'object' && ('die' in e.amount || 'halfDie' in e.amount));
  const controlledCompanions = Object.values(game[lp].board).filter(e => e?.kind === 'companion').length;
  const msgs: string[] = [];
  if (usesDie) msgs.push(`Rolled ${die}`);
  let g = game;

  for (const e of effects) {
    switch (e.op) {
      case 'buff': {
        // 'while' buffs are never stamped — they live as static auras (staticAuraStat).
        if (e.duration === 'while') break;
        // Recipients: own groups (shipped), every opposing companion (Chorus of
        // Doubt), or the clicked interactive target (Whispers of the West / Doubt).
        const recipients: string[] = [];
        if (e.scope === 'ownParty' || e.scope === 'ownCompanions') {
          for (const ent of Object.values(g[lp].board)) {
            if (!ent) continue;
            if (e.scope === 'ownParty' ? (ent.kind === 'companion' || ent.kind === 'pc') : ent.kind === 'companion') recipients.push(ent.id);
          }
        } else if (e.scope === 'allEnemyCompanions') {
          for (const ent of Object.values(g[opp].board)) if (ent?.kind === 'companion') recipients.push(ent.id);
        } else if (isInteractiveSpec(e.scope) && targetId) {
          recipients.push(targetId);
        }
        let touched = 0;
        for (const id of recipients) {
          const loc = findEntityAnywhere(g, id);
          if (!loc) continue;
          // Duration anchors (Arc B, 2026-07-23): 'untilYourNextTurn' strips at the
          // CASTER's next turn start; 'controllersNextTurn' is a WINDOW — dormant
          // until the recipient's controller's next turn starts, live during it,
          // stripped at its end (pendingUntilTurnOf guards an own-turn cast from
          // its own turn's end-strip). EXTENSION POINT: Arc H skip-refresh / Arc I
          // end-of-turn reversion add anchor kinds here — never a parallel system.
          const timed = e.duration === 'untilYourNextTurn'
            ? { until: { at: 'turnStart' as const, of: lp } }
            : e.duration === 'controllersNextTurn'
              ? { until: { at: 'turnEnd' as const, of: loc.player }, activeDuring: loc.player, pendingUntilTurnOf: loc.player }
              : { until: 'endOfTurn' as const };
          g = updateEntity(g, id, { buffs: [...(loc.ent.buffs ?? []), {
            ...(e.stat === 'atk' && e.amount != null ? { atk: e.amount } : {}),
            ...(e.grant ? { grant: e.grant } : {}),
            ...(e.modifiers ? { modifiers: e.modifiers } : {}),
            ...timed, source: sourceName,
          }] });
          touched++;
        }
        if (touched) {
          const amt = e.stat === 'atk' && e.amount != null ? `${e.amount > 0 ? '+' : ''}${e.amount} attack` : null;
          const parts = [amt, ...(e.grant ?? []), ...(e.modifiers ?? [])].filter(Boolean);
          const what = isInteractiveSpec(e.scope) ? (touched === 1 ? 'target' : 'targets')
            : e.scope === 'ownParty' ? 'characters'
            : e.scope === 'allEnemyCompanions' ? 'opposing companions' : 'companions';
          const durLabel = e.duration === 'untilYourNextTurn' ? 'until the start of your next turn'
            : e.duration === 'controllersNextTurn' ? "during its controller's next turn" : 'until end of turn';
          msgs.push(`${parts.join(', ')} to ${touched} ${what} (${durLabel})`);
        }
        break;
      }
      case 'damage': {
        let amt = amountValue(e.amount, die, controlledCompanions);
        // Magic-Action damage modifiers (Burning Eye/Wildfire Sigil/Heart of the
        // Convergence): +N to each enemy character this action would damage.
        if (amt > 0 && e.target !== 'self') amt += ctx?.damageBonus ?? 0;
        let targets: string[] = [];
        if (e.splash === 'board' || e.target === 'allEnemies') targets = charsOf(g, opp);
        else if (e.target === 'frontLineEnemy') targets = charsOf(g, opp, 'front');
        else if (e.target === 'backLineEnemy') targets = charsOf(g, opp, 'back');
        else if (e.target === 'allEnemyCompanions') targets = (Object.values(g[opp].board) as (BoardEntity | undefined)[])
          .filter((x): x is BoardEntity => !!x && x.kind === 'companion').map(x => x.id); // Arc C: The Names of the Lost
        else if (e.target === 'self') { if (sourceId) targets = [sourceId]; }
        else if (e.target === 'eventSubject') { if (ctx?.subjectId && findEntityAnywhere(g, ctx.subjectId)) targets = [ctx.subjectId]; }
        else if (e.target === 'damagedController') { if (ctx?.damagedOwner) { const pid = pcIdOf(g, ctx.damagedOwner); if (pid) targets = [pid]; } }
        else if (e.splash === 'line' && targetId) {
          const slot = findEntityAnywhere(g, targetId)?.slot;
          if (slot) targets = charsOf(g, opp, isFront(slot) ? 'front' : 'back');
        } else if (targetId) targets = [targetId];
        // Acrobatics (Arc C, 2026-07-23): "cannot be damaged by any source that does
        // not target it directly" — every GROUP recipient here is untargeted (the
        // Cleave-splash gate reused: isImmuneToSplash). The clicked target of a
        // line splash IS directly targeted; single-target paths (targetId /
        // eventSubject / self / damagedController) are direct and never gated.
        const untargeted = e.splash === 'board' || e.splash === 'line'
          || e.target === 'allEnemies' || e.target === 'frontLineEnemy'
          || e.target === 'backLineEnemy' || e.target === 'allEnemyCompanions';
        for (const tid of targets) {
          if (untargeted && tid !== targetId) {
            const tloc = findEntityAnywhere(g, tid);
            if (tloc && isImmuneToSplash(tloc.ent, g)) {
              msgs.push(`${tloc.ent.name} is untouched (Acrobatics)`);
              continue;
            }
          }
          const r = applyDamage(g, tid, amt, sourceName, lp, sink, undefined, armorSink);
          g = r.game; msgs.push(...r.msgs);
        }
        break;
      }
      case 'damageSelfPC': {
        const amt = amountValue(e.amount, die, controlledCompanions);
        const pcId = pcIdOf(g, lp);
        if (pcId && amt > 0) { const r = applyDamage(g, pcId, amt, sourceName, opp, sink, undefined, armorSink); g = r.game; msgs.push(...r.msgs); }
        break;
      }
      case 'heal': {
        const amt = amountValue(e.amount, die, controlledCompanions);
        let ids: string[] = [];
        if (e.target === 'self') { if (sourceId) ids = [sourceId]; }
        else if (e.target === 'ownParty') ids = charsOf(g, lp);
        else if (isInteractiveSpec(e.target) && targetId) ids = [targetId];
        for (const id of ids) {
          const loc = findEntityAnywhere(g, id);
          if (!loc) continue;
          const healed = Math.min(effectiveMaxHp(loc.ent, g), loc.ent.hp + amt);
          if (healed !== loc.ent.hp) {
            // A healed PC mirrors to the headline HP (PC entity = source of truth).
            g = loc.ent.kind === 'pc' ? setPcHp(g, loc.player, id, healed) : updateEntity(g, id, { hp: healed });
            msgs.push(`${loc.ent.name} heals to ${healed} HP`);
          }
        }
        break;
      }
      case 'draw': {
        if (e.if && !conditionMet(g, lp, e.if)) break;
        let drawn = 0;
        for (let i = 0; i < e.count; i++) {
          const ps = g[lp];
          if (ps.deck.length === 0) break;
          const [d, ...rest] = ps.deck;
          g = { ...g, [lp]: { ...ps, deck: rest, hand: [...ps.hand, d] } };
          drawn++;
        }
        if (drawn) msgs.push(`Draw ${drawn}`);
        break;
      }
      case 'shuffleHandRedraw': {
        // "Target opponent shuffles their hand into their deck and draws that many
        //  cards minus one." (Convergence Sigil — offset -1.)
        const ops = g[opp];
        const n = ops.hand.length;
        const drawN = Math.max(0, n + (e.offset ?? 0));
        const reshuffled = shuffle([...ops.deck, ...ops.hand]);
        g = { ...g, [opp]: { ...ops, hand: reshuffled.slice(0, drawN), deck: reshuffled.slice(drawN) } };
        msgs.push(`Opponent shuffles ${n} card${n !== 1 ? 's' : ''} away, draws ${drawN}`);
        break;
      }
      case 'bounce': {
        // Return permanents (companions or constructs) to their owner's hand: a
        // single clicked target, or a group scope.
        let ids: string[] = [];
        if (isInteractiveSpec(e.target)) { if (targetId) ids = [targetId]; }
        else if (e.target === 'ownCompanions') ids = companionIds(g, lp);
        else if (e.target === 'allEnemyCompanions') ids = companionIds(g, opp);
        for (const id of ids) {
          const loc = findEntityAnywhere(g, id);
          if (!loc || loc.ent.kind === 'pc') continue; // can't bounce the Player Character
          const owner = loc.player;
          // Manifest (animated construct): sacrificed instead of returning to hand.
          // Via destroyEntity so its card AND any equipped items reach the Dead Zone
          // (the old inline removal LOST the items) and an Item Transfer window queues.
          if (loc.ent.statuses.includes('manifest')) {
            const d = destroyEntity(g, id, sink, armorSink, 'sacrifice'); // sacrifice = death (fires triggers + on-sacrifice listeners)
            g = d.game;
            msgs.push(`${loc.ent.name} is sacrificed (Manifest)`, ...d.msgs);
            continue;
          }
          const cardObj = CATALOG.find(c => c.name === loc.ent.name);
          // Companions drop their items to the Dead Zone; constructs have none. A bounce
          // is an exit, so it opens an Item Transfer window too (ruled 2026-07-08).
          const items = itemCardsOf(loc.ent);
          const transfer = itemTransferOf(loc.ent, owner);
          g = removeEntity(g, id);
          g = { ...g,
            pendingItemTransferQueue: transfer ? [...g.pendingItemTransferQueue, transfer] : g.pendingItemTransferQueue,
            [owner]: { ...g[owner],
              hand: cardObj ? [...g[owner].hand, cardObj] : g[owner].hand,
              dead: items.length ? [...g[owner].dead, ...items] : g[owner].dead,
            } };
          msgs.push(`${loc.ent.name} returns to ${owner === lp ? 'your' : "owner's"} hand`);
        }
        break;
      }
      case 'extraAttack': {
        if (!targetId) break;
        const loc = findEntityAnywhere(g, targetId);
        if (!loc) break;
        g = updateEntity(g, targetId, { acts: { ...loc.ent.acts, major: false }, exhausted: false, tapped: 'none' });
        msgs.push(`${loc.ent.name} may attack an additional time`);
        break;
      }
      case 'forceAttack': {
        if (!targetId) break;
        const attackers = charsOf(g, lp, 'front').filter(id => findEntityAnywhere(g, id)?.ent.kind === 'companion');
        for (const aid of attackers) {
          if (!findEntityAnywhere(g, targetId)) break; // target already removed
          const aloc = findEntityAnywhere(g, aid);
          if (!aloc) continue;
          const dmg = effectiveAttack(aloc.ent, g);
          const r = applyDamage(g, targetId, dmg, aloc.ent.name, lp, sink, undefined, armorSink);
          g = r.game; msgs.push(...r.msgs);
          g = updateEntity(g, aid, { acts: { ...aloc.ent.acts, major: true }, exhausted: true, tapped: 'major' });
        }
        break;
      }
      case 'anchor': {
        // Group: add/remove anchors on every OTHER Physical Construct you control (Grudrik,
        // Stone Rampart). The source excludes itself — owner ruling 2026-07-03: a construct
        // buffing its own group on enter would just be hidden printed-anchor inflation.
        if (e.target === 'ownPhysicalConstructs') {
          const ids = (Object.values(g[lp].board) as (BoardEntity | undefined)[])
            .filter((x): x is BoardEntity => !!x && isPhysicalConstruct(x) && x.id !== sourceId).map(x => x.id);
          let touched = 0;
          for (const id of ids) {
            const loc = findEntityAnywhere(g, id);
            if (!loc) continue;
            const next = Math.max(0, (loc.ent.anchors ?? 0) + e.delta);
            if (e.delta < 0 && next <= 0) g = removeEntity(g, id);
            else g = updateEntity(g, id, { anchors: next });
            touched++;
          }
          if (touched) msgs.push(`${e.delta > 0 ? '+' : ''}${e.delta} anchor to ${touched} Physical Construct${touched > 1 ? 's' : ''}`);
          break;
        }
        if (!targetId) break;
        const loc = findEntityAnywhere(g, targetId);
        if (!loc) break;
        const cur = loc.ent.anchors ?? 0;
        const next = Math.max(0, cur + e.delta);
        if (e.delta < 0 && next <= 0) {
          const d = destroyEntity(g, targetId, sink, armorSink, 'sacrifice'); // sacrifice = death (fires triggers + on-sacrifice listeners)
          g = d.game;
          msgs.push(`${loc.ent.name} loses its last anchor — sacrificed!`, ...d.msgs);
        }
        else { g = updateEntity(g, targetId, { anchors: next }); msgs.push(`${loc.ent.name} anchors ${cur} → ${next}`); }
        break;
      }
      case 'animate': {
        // Animate Magic X: a Magical (Incantation) Construct you control becomes an X/X
        // Manifest companion, retaining its text and Anchor counters. (Leave-sacrifice
        // handled via the 'manifest' status in bounce.) Target is either a single clicked
        // construct, or the group 'ownMagicalConstructs' (up to `max`, excluding the
        // source — e.g. The Verdant Still animates up to two; interim auto-picks).
        let ids: string[] = [];
        if (e.target === 'ownMagicalConstructs') {
          ids = (Object.values(g[lp].board) as (BoardEntity | undefined)[])
            .filter((x): x is BoardEntity => !!x && x.kind === 'construct' && x.subtype === 'Incantation' && x.id !== sourceId)
            .map(x => x.id);
          if (e.max != null) ids = ids.slice(0, e.max);
        } else if (targetId) {
          ids = [targetId];
        }
        for (const id of ids) {
          const loc = findEntityAnywhere(g, id);
          if (!loc || loc.ent.kind !== 'construct' || loc.ent.subtype !== 'Incantation') continue;
          // Type-changing is NOT "entering the encounter" (Rules Note 2026-07-15):
          // the permanent's entry time is unchanged, so the Manifest keeps the
          // construct's own `fresh` — in the encounter since a prior turn → it may
          // attack this turn; played this turn → gated like any new companion.
          g = updateEntity(g, id, {
            kind: 'companion', atk: e.atk, hp: e.hp, maxHp: e.hp, subtype: 'Manifest',
            fresh: loc.ent.fresh ?? false, statuses: [...loc.ent.statuses, 'manifest'],
          });
          // The retained counters are the Manifest's remaining lifespan (Rules Note
          // 2026-07-20 — decay keys on counters, not card type): say so out loud.
          msgs.push(`${loc.ent.name} animates as a ${e.atk}/${e.hp} Manifest${
            loc.ent.anchors != null ? ` — ${loc.ent.anchors} Anchor${loc.ent.anchors === 1 ? '' : 's'} remain, and it keeps decaying` : ''}`);
        }
        break;
      }
      case 'dieCheck': {
        const roll = rollD6();
        const pass = roll >= e.threshold;
        msgs.push(`Rolled ${roll} — ${pass ? 'success' : 'fail'}`);
        const r = resolveActionEffects(g, lp, sourceName, pass ? e.onPass : e.onFail, targetId, sourceId, ctx, sink, armorSink);
        g = r.game; msgs.push(...r.msgs);
        break;
      }
      case 'returnFromDead': {
        // Recover a card from the controller's Dead Zone (Memory Stone onDestroy). If a
        // `sink` was supplied, defer to a player-facing picker (the calling reducer arms
        // `pendingDeadPick`); otherwise auto-pick the most-recent eligible card.
        if (e.to !== 'hand') break;
        const dead = g[lp].dead;
        const options = dead.map((card, idx) => ({ card, idx }))
          .filter(o => !e.cardType || o.card.type === e.cardType)
          .filter(o => !e.itemKind || o.card.itemKind === e.itemKind);
        if (options.length === 0) { msgs.push('Dead Zone has no eligible card'); break; }
        if (sink) {
          sink.push({ source: sourceName, lp, sourceId, options, postEffects: [], optional: e.optional ?? false });
          msgs.push('Choose a card to return from the Dead Zone');
          break;
        }
        const pick = options[options.length - 1].idx;
        const card = dead[pick];
        g = { ...g, [lp]: { ...g[lp], dead: dead.filter((_, i) => i !== pick), hand: [...g[lp].hand, card] } };
        msgs.push(`Returned ${card.name} from the Dead Zone to hand`);
        break;
      }
      case 'exhaustSelf': {
        if (!sourceId) break;
        const loc = findEntityAnywhere(g, sourceId);
        if (!loc) break;
        g = updateEntity(g, sourceId, { exhausted: true, tapped: 'major' });
        msgs.push(`${loc.ent.name} is exhausted`);
        break;
      }
      case 'exhaust': {
        // Exhaust the target (Pit Trap: 'eventSubject'). A mandatory trigger's exhaust
        // on an already-exhausted target is a NO-OP but the clause still ran (R4,
        // 2026-07-12) — the message keeps the outcome non-silent either way.
        let ids: string[] = [];
        if (e.target === 'eventSubject') { if (ctx?.subjectId) ids = [ctx.subjectId]; }
        else if (e.target === 'self') { if (sourceId) ids = [sourceId]; }
        else if (isInteractiveSpec(e.target) && targetId) ids = [targetId];
        for (const id of ids) {
          const loc = findEntityAnywhere(g, id);
          if (!loc) continue; // subject already left the encounter — nothing to exhaust
          if (loc.ent.exhausted || loc.ent.tapped === 'major') { msgs.push(`${loc.ent.name} is already exhausted`); continue; }
          g = updateEntity(g, id, { exhausted: true, tapped: 'major' });
          msgs.push(`${loc.ent.name} is exhausted`);
        }
        break;
      }
      case 'sacrifice': {
        // Implemented for target:'self' only (trap self-sacrifice, e.g. "Sacrifice
        // this construct"). A self-sacrifice IS a death (locked ruling 2026-07-08):
        // it routes through destroyEntity, fires death triggers, and opens no
        // exceptions. Other targets remain documented safe no-ops until a card
        // needs them (see tier4_ops "declared-but-uninterpreted ops").
        if (e.target !== 'self' || !sourceId) break;
        const loc = findEntityAnywhere(g, sourceId);
        if (!loc) break; // source already gone (e.g. destroyed while its trigger was queued)
        const d = destroyEntity(g, sourceId, sink, armorSink, 'sacrifice'); // sacrifice = death (fires triggers + on-sacrifice listeners)
        g = d.game;
        msgs.push(`${loc.ent.name} is sacrificed`, ...d.msgs);
        break;
      }
      case 'discard': {
        // Arc A (2026-07-22). The DISCARDING player chooses the card (owner agency —
        // the Coercion precedent), so this arms a victim-owned prompt rather than
        // auto-picking. Writes pendingDiscard directly (single slot + queue): callers
        // need no sink threading, and the shipped call sites stay byte-identical
        // (no shipped card carries the op). Victim resolution by target scope:
        let victim: 'p1' | 'p2' | null = null;
        if (e.target === 'targetPlayer') victim = lp === 'p1' ? 'p2' : 'p1';
        else if (e.target === 'damagedController') victim = ctx?.damagedOwner ?? null;
        else if (e.target === 'eventSubject' && ctx?.subjectId) victim = findEntityAnywhere(g, ctx.subjectId)?.player ?? null;
        if (!victim) break; // unmodeled scope / subject gone — validator bars the former
        if (g[victim].hand.length === 0) { msgs.push(`${g[victim].name} has no cards to discard`); break; }
        for (let n = 0; n < e.count; n++) {
          const pd = { source: sourceName, victim };
          g = g.pendingDiscard
            ? { ...g, pendingDiscardQueue: [...(g.pendingDiscardQueue ?? []), pd] }
            : { ...g, pendingDiscard: pd };
        }
        msgs.push(`${g[victim].name} must discard ${e.count === 1 ? 'a card' : `${e.count} cards`}`);
        break;
      }
      case 'revealHand': {
        // Arc A (2026-07-22): the acting player looks at the opponent's hand. Both
        // clients hold full game state (established info model) — the prompt is UI
        // entitlement: only the looker's client renders it, the hand's owner is held.
        const other: 'p1' | 'p2' = lp === 'p1' ? 'p2' : 'p1';
        if (g[other].hand.length === 0) { msgs.push(`${g[other].name} has no cards in hand`); break; }
        if (g.pendingHandReveal) break; // single slot — no consumer arms two in one resolution
        g = { ...g, pendingHandReveal: { source: sourceName, lp, handSide: other, ...(e.pick ? { pick: e.pick } : {}) } };
        msgs.push(`Look at ${g[other].name}'s hand`);
        break;
      }
      // Remaining ops (move slot-pick, two-target attacks, sacrificeItem, deckPeek…) — later slices.
    }
  }
  return { game: g, msgs };
}
