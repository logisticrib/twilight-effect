// ─── Effect interpreter (declarative layer) ─────────────────────────────────────
// Target specs, condition/amount evaluation, and structured-effect gathering for
// cards and permanents. Moved verbatim from src/store/gameStore.ts (extraction
// plan, slice 4). resolveActionEffects — the imperative resolver — follows in
// slice 5: it is one mutually-recursive group with applyDamage/destroyEntity/
// resolveRemovalTriggers (combat.ts / entities.ts).
import type { BoardEntity, Card } from '../types/card';
import type { Effect, Amount, TargetSpec, Trigger, Cost, CardEffect } from '../types/effects';
import { CATALOG } from '../data/catalog';
import { isFront } from './geometry';
import type { GameState, PendingDeadPick, ArmorChoiceData } from './state';
import { charsOf, companionIds, constructIds, findEntityAnywhere, updateEntity,
         removeEntity, destroyEntity, setPcHp, pcIdOf, itemCardsOf, itemTransferOf, canBeSacrificed,
         gearItemsOf, destroyItemById } from './entities';
import { hasSubtype, cardHasSubtype } from './stats';
import { isPhysicalConstruct, conditionMet, effectiveAttack, effectiveMaxHp, isImmuneToSplash, isCharacter, poisonHitPatch } from './stats';
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
          (!e.cardType || c.type === e.cardType) && (!e.itemKind || c.itemKind === e.itemKind)
          && (!e.subtype || cardHasSubtype(c, e.subtype)))) return true;
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
  // Arc A (2026-08-19): Gear picks resolve to ITEM ids, not board-entity ids — the
  // pick surface is the bearer's loadout panel. 'allGear' is auto-scoped and is
  // deliberately NOT here.
  'anyGear', 'gearOrPhysicalConstruct',
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
    // Arc A (2026-08-19). "Target Gear" carries no controller qualifier in canon, so
    // BOTH sides' Gear is legal. The union spec mixes item ids and construct entity
    // ids in one list — resolution disambiguates by looking for an item first.
    case 'anyGear':               return gearItemsOf(game).map(x => x.itemId);
    case 'gearOrPhysicalConstruct':
      return [...gearItemsOf(game).map(x => x.itemId), ...constructIds(game, isPhysicalConstruct)];
    default: return [];
  }
}

/** RETIRED FROM THIS FILE 2026-08-23 (Arc C) — `conditionMet` MOVED to engine/stats.ts
 *  and is re-exported here so all seven call sites keep working. It had to move down to
 *  the leaf module because the static derive-on-read paths in stats.ts now honour
 *  clause-level `if` (the conditional Untamed carriers), and stats.ts is upstream of
 *  this file. Two condition evaluators is how two readings of `if` drift apart.
 *  Definition and doc comment live at the new site — do not re-add a copy here. */
export { conditionMet } from './stats';

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
    // Arc H (2026-08-04, Whispered Accusation): an interactive exhaust is a targeted
    // pick. Shipped exhaust targets (self / eventSubject) are not interactive → null,
    // exactly as before.
    case 'exhaust':
    case 'ready':
    case 'destroy':
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

/**
 * Op-level eligibility narrowing BEYOND the TargetSpec (Arc H 2026-08-04: bounce's
 * hpAtMost gate, Shade Puppeteer). Applied wherever a spec's eligibleTargets arm an
 * interactive pick, and re-checked at resolution (per-event state). No shipped card
 * carries a narrowing field, so every shipped arm site returns `ids` unchanged.
 */
export function filterEligibleByEffects(game: GameState, ids: string[], effects: Effect[]): string[] {
  let out = ids;
  const cap = effects.find((e): e is Extract<Effect, { op: 'bounce' | 'gainControl' }> =>
    (e.op === 'bounce' || e.op === 'gainControl') && e.hpAtMost != null);
  if (cap) {
    out = out.filter(id => {
      const loc = findEntityAnywhere(game, id);
      return !!loc && loc.ent.hp <= cap.hpAtMost!;
    });
  }
  // Arc B (2026-08-19): subtype narrowing for a targeted pick — "target Beast you
  // control". The controller half is already carried by the TargetSpec (ownCompanion);
  // this adds the subtype half, so the two compose instead of needing a spec per
  // subtype. Set membership over authored tokens, never a derived organism.
  const want = effects.map(e =>
    e.op === 'ready' ? e.subtype
    : e.op === 'buff' ? e.where?.subtype
    : undefined).find((x): x is string => !!x);
  if (want) {
    out = out.filter(id => {
      const loc = findEntityAnywhere(game, id);
      return !!loc && hasSubtype(loc.ent, want);
    });
  }
  return out;
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
export function twoStepKind(effects: Effect[]): 'reposition' | 'disarm' | 'moveAnchor' | 'gainControl' | 'destroyThenHeal' | 'destroyUpTo' | null {
  // Arc A (2026-08-19). Checked FIRST: a destroy card can carry an interactive rider
  // (Sanctify's heal) or an "up to N" cap, and either makes it a two-step pick.
  const destroy = effects.find(e => e.op === 'destroy');
  if (destroy && destroy.op === 'destroy') {
    if ((destroy.max ?? 1) > 1) return 'destroyUpTo';
    const rider = effects.find(e => e !== destroy && isInteractiveSpec(effectTargetSpec(e) ?? 'self'));
    if (rider) return 'destroyThenHeal';
  }
  for (const e of effects) {
    if (e.op === 'move' && e.to === 'anySlot' && e.target === 'ownCharacter') return 'reposition';
    if (e.op === 'attackDisarm') return 'disarm';
    if (e.op === 'moveAnchor') return 'moveAnchor';
    // Arc I (2026-08-11, Command the Broken): pick the companion, then the slot it
    // is placed in on the CASTER's board ("place in any available slot", ruling 2).
    if (e.op === 'gainControl' && e.duration === 'endOfTurn') return 'gainControl';
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
  // How many permanents THIS resolution destroyed — read by a following
  // `draw.perDestroyed` (Let the Wild In). Arc A, 2026-08-19.
  let destroyedThisResolution = 0;

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
            // Arc B: "Beasts you control" narrows the same group scope by subtype.
            if (e.where?.subtype && !hasSubtype(ent, e.where.subtype)) continue;
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
          // its own turn's end-strip). EXTENSION POINT (used by Arc H below): Arc I
          // end-of-turn reversion adds anchor kinds here — never a parallel system.
          // Arc H (2026-08-04, Whispered Accusation): 'controllersNextTurnStart' =
          // the same dormancy + turnEnd expiry but deliberately NO activeDuring —
          // runReadyPhase runs BEFORE endTurn flips activePlayer, so a Doubt-shaped
          // window is not yet live at the ready step it must govern; the armed
          // entry stays inertly live for the rest of that turn instead.
          const timed = e.duration === 'untilYourNextTurn'
            ? { until: { at: 'turnStart' as const, of: lp } }
            : e.duration === 'controllersNextTurn'
              ? { until: { at: 'turnEnd' as const, of: loc.player }, activeDuring: loc.player, pendingUntilTurnOf: loc.player }
              : e.duration === 'controllersNextTurnStart'
                ? { until: { at: 'turnEnd' as const, of: loc.player }, pendingUntilTurnOf: loc.player }
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
        // perDestroyed (Arc A): "draw a card for each Gear destroyed this way" — the
        // count is what THIS resolution actually destroyed, so a destroy that found
        // nothing draws nothing.
        const want = e.perDestroyed ? destroyedThisResolution : e.count;
        let drawn = 0;
        for (let i = 0; i < want; i++) {
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
          // Arc H (2026-08-04, Shade Puppeteer): the hp gate reads CURRENT hp at
          // RESOLUTION (per-event state) — eligibility already filtered at arm time
          // (filterEligibleByEffects); this re-check fizzles loudly, never silently.
          if (e.hpAtMost != null && loc.ent.hp > e.hpAtMost) {
            msgs.push(`${loc.ent.name} has more than ${e.hpAtMost} HP — not returned`);
            continue;
          }
          const owner = loc.ent.stolenFrom ?? loc.player;
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
          // Arc I (2026-08-11, ruling 4): OWNERSHIP routes the zones — a bounced
          // STOLEN companion goes home to its owner's hand, not the controller's.
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
      case 'ready': {
        // Arc B (2026-08-19 — Greywind Courser). The inverse of `exhaust`, and the same
        // mutation extraAttack performs: clear tap/exhaust and free the Major slot.
        // DELIBERATELY does not touch `fresh`: the entry-turn ban and summoning sickness
        // are separate gates (stats.ts:758, the beginAttack Zealous check), so readying a
        // companion that entered this turn restores its state without granting it
        // permission it never had. Diagnosed 2026-08-19; no ambiguity to rule on.
        if (!targetId) break;
        const loc = findEntityAnywhere(g, targetId);
        if (!loc) break;
        g = updateEntity(g, targetId, { acts: { ...loc.ent.acts, major: false }, exhausted: false, tapped: 'none' });
        msgs.push(`${loc.ent.name} readies`);
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
        // Arc B (2026-08-19): `subtype` narrows recovery ("Return target Beast from your
        // Dead Zone"). Dead Zone entries are full Card objects carrying the same authored
        // `subtypes` as the board, so the same matcher serves both — verified, not assumed.
        // Recover a card from the controller's Dead Zone (Memory Stone onDestroy). If a
        // `sink` was supplied, defer to a player-facing picker (the calling reducer arms
        // `pendingDeadPick`); otherwise auto-pick the most-recent eligible card.
        if (e.to !== 'hand') break;
        const dead = g[lp].dead;
        const options = dead.map((card, idx) => ({ card, idx }))
          .filter(o => !e.cardType || o.card.type === e.cardType)
          .filter(o => !e.itemKind || o.card.itemKind === e.itemKind)
          .filter(o => !e.subtype || cardHasSubtype(o.card, e.subtype));
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
      case 'destroy': {
        // DESTROY (Arc A, owner-ratified 2026-08-19) — a DIFFERENT EVENT from sacrifice.
        // Destruction never fires on-sacrifice listeners: destroyEntity only gathers an
        // on-sacrifice eventBoard when cause === 'sacrifice', so threading 'destroy'
        // here is the whole mechanism. Generic leave/death triggers fire for both, and
        // the destroyed card lands in its OWNER's Dead Zone either way.
        //
        // FAMILY C (Untamed) DEPENDENCY: Untamed reads live encounter contents ("no Gear
        // or Physical Constructs in the encounter"). Both removal paths below fully
        // detach — destroyItemById nulls the loadout slot(s) and destroyEntity removes
        // the entity — so no stale reference survives for a future encounter-wide scan
        // to miscount. Do not "soft-remove" here.
        const ids: string[] = e.target === 'allGear'
          ? gearItemsOf(g).map(x => x.itemId)              // symmetric: BOTH players' Gear
          : targetId ? [targetId] : [];
        for (const id of ids) {
          // Items first: the union spec can hand us either kind of id.
          const r = destroyItemById(g, id);
          if (r.destroyed) { g = r.game; msgs.push(...r.msgs); destroyedThisResolution++; continue; }
          const loc = findEntityAnywhere(g, id);
          if (!loc) continue;                              // already gone this resolution
          const d = destroyEntity(g, id, sink, armorSink, 'destroy');
          g = d.game;
          msgs.push(`${loc.ent.name} is destroyed`, ...d.msgs);
          destroyedThisResolution++;
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
      case 'placeArmor': {
        // Arc C (2026-08-23, Elder Shellback) — the G-piece: an op that PLACES armor
        // counters. It places and NOTHING ELSE. Prevention needed zero new work: the
        // universal counter rule (MKL:52, 2026-08-18) already made the counters the
        // ability, and armorCandidatesOf / removeArmorCounter already read and spend an
        // entity's own `armorCounters` without asking where they came from.
        //
        // `armorStart` is deliberately left alone — it records the PRINTED X for display
        // and is documented absent for effect-placed counters. A companion that already
        // holds printed counters simply gains more on the same field; there is one
        // counter pool per entity, not one per source.
        //
        // Group scope only (auto-scoped, no pick), narrowed by authored subtype token —
        // the Arc B enumeration, same `hasSubtype` set membership the buff scope uses.
        // INTERIM (2026-08-20 design-intent note): a resolution that reaches zero
        // eligible companions is a LOUD fizzle, never a silent pass.
        if (e.target !== 'ownCompanions' && e.target !== 'ownParty') break; // engine-supported scopes only
        const recipients: BoardEntity[] = [];
        for (const ent of Object.values(g[lp].board)) {
          if (!ent) continue;
          if (e.target === 'ownCompanions' ? ent.kind !== 'companion' : !(ent.kind === 'companion' || ent.kind === 'pc')) continue;
          if (e.subtype && !hasSubtype(ent, e.subtype)) continue;
          recipients.push(ent);
        }
        if (!recipients.length) {
          msgs.push(`${sourceName} finds no ${e.subtype ? `${e.subtype} ` : ''}companion to armor`);
          break;
        }
        for (const ent of recipients) {
          g = updateEntity(g, ent.id, { armorCounters: (ent.armorCounters ?? 0) + e.count });
        }
        msgs.push(`${recipients.map(r => r.name).join(', ')} ${recipients.length === 1 ? 'gains' : 'gain'} ${e.count} armor counter${e.count === 1 ? '' : 's'}`);
        break;
      }
      case 'applyPoison': {
        // Arc D (2026-07-23 — Poisoned Caltrops): effect-applied Poison counters.
        // Provenance canon (RULED 2026-07-22): counters are counters — this applies
        // the SAME patch the combat keyword applies (poisonHitPatch: counter +
        // POISONED status + exhaust), so the ready-phase check cannot tell the two
        // entry points apart. Choiceless: no prompt, no hold.
        if (e.target !== 'eventSubject' || !ctx?.subjectId) break; // engine-supported scope only (validator-enforced)
        const loc = findEntityAnywhere(g, ctx.subjectId);
        if (!loc || !isCharacter(loc.ent)) break; // subject left / not a character — nothing to poison
        let patched = loc.ent;
        for (let n = 0; n < e.count; n++) patched = { ...patched, ...poisonHitPatch(patched) };
        g = updateEntity(g, loc.ent.id, patched);
        msgs.push(`${loc.ent.name} is exhausted and takes ${e.count} Poison counter${e.count === 1 ? '' : 's'}`);
        break;
      }
      case 'eachPlayerSacrificesOrDiscards': {
        // Arc F (2026-07-24, Siege Rations): each player pays one of the two halves.
        // ORDER: the NON-ACTIVE player's chosen resolution first — the 2026-07-22
        // structural queue applied to one action's two chosen resolutions.
        // RATIFIED (owner 2026-07-24, per the Arc G brief; stamped 2026-08-04): opponent-first for "one action,
        // both players choose" is settled — no longer merely the Note-supported
        // reading. Serialized prompts, never dual-hold: the second prompt arms when
        // the first resolves (its halves evaluated FRESH at that moment — per-event
        // state), via the pendingCoercion chain (`then`) in
        // resolveCoercionDiscard/Sacrifice.
        // DEGENERATES (owner 2026-07-24, RATIFIED as built per the Arc G brief; stamped 2026-08-04):
        // neither half → unaffected, loud toast, no prompt. One half → the
        // WHICH-HALF choice auto-resolves (the modal renders the one available
        // section); WHICH card/permanent stays the player's pick — owner agency,
        // exactly Coercion's shipped handling.
        // The caster's hand still holds the RESOLVING card here (playAction's
        // immediate path resolves effects before burial) — it is on the stack,
        // not in hand, so it never counts toward the caster's discard half.
        // Name-keyed exclusion is safe: unique names are the identity rule.
        const halvesOf = (side: 'p1' | 'p2') => ({
          discard: g[side].hand.filter(c => !(side === lp && c.name === sourceName)).length > 0,
          sac: (Object.values(g[side].board) as (BoardEntity | undefined)[]).some(x => !!x && canBeSacrificed(x)),
        });
        const note = (side: 'p1' | 'p2', h: { discard: boolean; sac: boolean }) =>
          h.discard && h.sac ? `${g[side].name} chooses: sacrifice a permanent or discard a card`
            : h.discard ? `${g[side].name} must discard a card (no permanent to sacrifice)`
            : `${g[side].name} must sacrifice a permanent (no cards in hand)`;
        const oppH = halvesOf(opp);
        if (oppH.discard || oppH.sac) {
          g = { ...g, pendingCoercion: { source: sourceName, victim: opp, generic: true as const, then: lp } };
          msgs.push(note(opp, oppH));
          break;
        }
        msgs.push(`${g[opp].name} is unaffected — nothing to discard or sacrifice`);
        const lpH = halvesOf(lp);
        if (lpH.discard || lpH.sac) {
          g = { ...g, pendingCoercion: { source: sourceName, victim: lp, generic: true as const } };
          msgs.push(note(lp, lpH));
        } else {
          msgs.push(`${g[lp].name} is unaffected — nothing to discard or sacrifice`);
        }
        break;
      }
      case 'forcedSacrifice': {
        // Owner rewording 2026-08-11 (The Final Word): the event subject's
        // CONTROLLER must sacrifice a permanent — their pick, no decline (the only
        // escape was not attacking). Arms the payer-owned prompt; the calling
        // stack driver PAUSES on it (the Arc A trap-discard pattern) so the
        // sacrifice fully resolves before anything beneath — in particular before
        // the queued attack's damage step. Mandatory triggers fire even when the
        // effect no-ops (R4): a payer with nothing sacrificeable is noted loudly
        // and the clause passes through. Single slot: a second demand (another
        // Final Word copy) is its own stack entry and arms after this one resolves.
        if (e.chooser !== 'eventSubjectController' || !ctx?.subjectId) break;
        // The subject's controller — read from the live board, falling back to the
        // listener's OPPONENT when the subject already died (an earlier-ordered
        // Iron Spikes killing a glass-cannon attacker): for this trigger family the
        // subject is always an opposing companion, so its controller IS `opp`. The
        // queued demand still resolves (R1) and must surface loudly, never break
        // silently (no-silent-outcomes, 2026-07-12).
        const payer = findEntityAnywhere(g, ctx.subjectId)?.player ?? opp;
        const canPay = (Object.values(g[payer].board) as (BoardEntity | undefined)[]).some(x => !!x && canBeSacrificed(x));
        if (!canPay) { msgs.push(`${g[payer].name} has nothing left to sacrifice`); break; }
        if (g.pendingForcedSacrifice) break; // single slot — serialized by the stack pause
        g = { ...g, pendingForcedSacrifice: { lp: payer, sourceName } };
        msgs.push(`${g[payer].name} must sacrifice a permanent`);
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
      case 'deckPeek': {
        // Arc G (2026-08-04): the REACTIVE-clause path (Echo-Keeper's own-play
        // listener). Every other consumer special-cases deckPeek UPSTREAM (playAction,
        // activateAbility, runOnEnter) before effects reach this resolver, so this
        // case is shipped-neutral by construction. Arms the standing PendingPeek for
        // the clause's controller; if a peek is already up (an earlier trigger's —
        // e.g. Paranoia's, still pausing the stack), the request joins the
        // start-of-turn peek queue, whose activation RE-SLICES the deck (stale-proof).
        const peekSide: 'p1' | 'p2' = e.deck === 'opp' ? (lp === 'p1' ? 'p2' : 'p1') : lp;
        if (g.pendingPeek) {
          g = { ...g, pendingPeekQueue: [...g.pendingPeekQueue,
            { source: sourceName, lp, deckSide: peekSide, look: e.look, dests: e.dests,
              maxHand: e.maxHand, ...(e.reorder ? { reorder: true as const } : {}) }] };
          msgs.push(`${sourceName}: deck look queued`);
          break;
        }
        const cards = g[peekSide].deck.slice(0, e.look);
        if (!cards.length) { msgs.push(`${sourceName} — the deck is empty`); break; }
        g = { ...g, pendingPeek: { source: sourceName, lp, deckSide: peekSide, cards,
          dests: e.dests, maxHand: e.maxHand, ...(e.reorder ? { reorder: true as const } : {}) } };
        msgs.push(`Look at the top of ${peekSide === lp ? 'your' : `${g[peekSide].name}'s`} deck`);
        break;
      }
      // Remaining ops (move slot-pick, two-target attacks, sacrificeItem, deckPeek…) — later slices.
    }
  }
  return { game: g, msgs };
}
