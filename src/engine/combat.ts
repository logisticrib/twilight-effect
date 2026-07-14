// ─── Combat: damage pipeline, attack driver, triggers, prompt arming ────────────
// Moved verbatim from src/store/gameStore.ts (extraction plan, slice 5). The thin
// attack orchestrators (commitAttack / finalizeAttack) stay in the store: they seal
// activation via activationPatch, which the plan keeps store-level (slice 7).
import type { BoardEntity, EquippedItem } from '../types/card';
import type { Effect, Condition, Trigger, Cost } from '../types/effects';
import { CATALOG } from '../data/catalog';
import type { GameState, DamageEvent, PendingDeadPick, ArmorChoiceData, PendingArmor, AttackCtx, PreventItem, PendingPreventOrder } from './state';
import { findEntityAnywhere, updateEntity, setPcHp, destroyEntity, pcIdOf, armNextItemTransfer } from './entities';
import { hasModifier, isCharacter, isPhysicalConstruct, poisonHitPatch, isBaneTarget, grantHitRun } from './stats';
import { resolveActionEffects, actionTargetSpec, eligibleTargets, conditionMet, type EffectCtx } from './interpreter';

// ─── Damage + effect interpreter (shared by combat and Action cards) ───────────

/**
 * Apply `dmg` to one entity: Armor first, then the hpFloor1 modifier, then HP
 * reduction / removal / PC-defeat. Returns the new game and log lines. Reused by
 * resolveAttack and Action-card damage so the rules live in one place.
 *
 * Armor: a hit is fully prevented while any armor piece remains (one counter per
 * hit, on one piece). When the character has 2+ pieces the controlling player
 * chooses which absorbs — the combat driver pauses for that and replays this with
 * `armorPieceId` set. Without a forced id (non-attack damage, or a single piece)
 * the most-worn piece is consumed (spends nearly-sacrificed armor first).
 */
export function armorPiecesOf(ent: BoardEntity): EquippedItem[] {
  return (ent.loadout?.gear.filter((gi): gi is EquippedItem => !!gi && gi.armor !== undefined)) ?? [];
}
/** Default armor choice when the player doesn't pick: the most-worn piece (highest counters). */
export function pickDefaultArmor(pieces: EquippedItem[]): EquippedItem {
  return pieces.reduce((best, p) => ((p.counters ?? 0) > (best.counters ?? 0) ? p : best), pieces[0]);
}
/** Put one armor counter on `pieceId` (sacrifice it at its limit). Shared by the
 *  in-line block in applyDamage and the deferred non-combat choice in resolveArmor. */
export function applyArmorCounter(game: GameState, entityId: string, pieceId: string): { game: GameState; msgs: string[] } {
  const loc = findEntityAnywhere(game, entityId);
  const piece = loc?.ent.loadout?.gear.find(gi => gi?.id === pieceId);
  if (!loc || !piece) return { game, msgs: [] };
  const msgs: string[] = [];
  const newCounters = (piece.counters ?? 0) + 1;
  msgs.push(`${piece.name} blocks! (${newCounters}/${piece.armor} counters)`);
  let gear = loc.ent.loadout!.gear.map(gi => gi?.id === pieceId ? { ...gi, counters: newCounters } : gi);
  if (newCounters >= (piece.armor ?? 0)) {
    gear = gear.map(gi => gi?.id === pieceId ? null : gi);
    msgs.push(`${piece.name} is destroyed!`);
  }
  return { game: updateEntity(game, entityId, { loadout: { ...loc.ent.loadout!, gear } }), msgs };
}
// ─── Damage prevention (capability arc 2, owner-ratified 2026-07-14) ───────────
/** Board-sourced prevention effects covering `ent` (Reflecting Pool: "When a Wizard
 *  companion you control would take damage, prevent 1 of that damage"). Gathered
 *  aura-style from the controller's in-play permanents' static clauses at damage
 *  time — the auraGrantedKeywords discipline. Prevention scopes are character
 *  scopes: constructs are never covered; 'ownCompanions' never covers the PC. */
export function preventionEffectsFor(game: GameState, ent: BoardEntity, controller: 'p1' | 'p2'): { sourceId: string; sourceName: string; amount: number }[] {
  if (ent.kind === 'construct') return [];
  const out: { sourceId: string; sourceName: string; amount: number }[] = [];
  for (const src of Object.values(game[controller].board)) {
    if (!src) continue;
    const card = CATALOG.find(c => c.name === src.name);
    for (const ce of card?.effects ?? []) {
      if (ce.trigger !== 'static') continue;
      for (const e of ce.effects) {
        if (e.op !== 'preventDamage') continue;
        if (e.scope === 'ownCompanions' && ent.kind !== 'companion') continue;
        if (e.where?.cls && e.where.cls !== ent.cls) continue;
        out.push({ sourceId: src.id, sourceName: src.name, amount: e.amount });
      }
    }
  }
  return out;
}

/** Walk prevention items in the chosen order against one damage instance (R3).
 *  prevent-N cuts the running damage (toast names source + amount — no silent
 *  outcomes); an armor piece reached while damage remains prevents ALL of it and
 *  takes its counter; a piece reached at 0 never engages (no counter — R3's
 *  canonical consequence). Returns the damage left after all prevention. */
export function applyPreventionOrder(game: GameState, entityId: string, dmg: number, order: PreventItem[]): { game: GameState; remaining: number; msgs: string[] } {
  const entName = findEntityAnywhere(game, entityId)?.ent.name ?? 'the character';
  let g = game;
  let remaining = dmg;
  const msgs: string[] = [];
  for (const item of order) {
    if (item.kind === 'prevent') {
      const cut = Math.min(remaining, item.amount);
      if (cut > 0) { remaining -= cut; msgs.push(`${item.sourceName} prevents ${cut} of the damage to ${entName}`); }
    } else if (remaining > 0) {
      const r = applyArmorCounter(g, entityId, item.pieceId);
      g = r.game; msgs.push(...r.msgs);
      remaining = 0; // armor prevents all of the remaining damage
    }
  }
  return { game: g, remaining, msgs };
}

export function applyDamage(game: GameState, entityId: string, dmg: number, sourceName: string, sourcePlayer: 'p1' | 'p2', sink?: PendingDeadPick[], armorPieceId?: string, armorSink?: ArmorChoiceData[], preventOrder?: PreventItem[]): { game: GameState; msgs: string[] } {
  const loc = findEntityAnywhere(game, entityId);
  if (!loc) return { game, msgs: [] };
  const ent = loc.ent;
  const msgs: string[] = [];
  let g = game;

  // `dmg` arrives as the FORMED dealt amount — deal-side modifiers (Bane doubling,
  // magic damage bonuses) are already applied. Receipt-side prevention consults it
  // from here (R1, owner 2026-07-14).
  const pools = preventOrder ? [] : preventionEffectsFor(game, ent, loc.player);
  if (preventOrder) {
    // Forced plan (resolvePreventOrder resuming a paused combat hit): walk it.
    const w = applyPreventionOrder(g, entityId, dmg, preventOrder);
    g = w.game; msgs.push(...w.msgs); dmg = w.remaining;
    if (dmg <= 0) return { game: g, msgs }; // fully prevented = no damage at all (R2)
  } else if (pools.length) {
    const pieces = armorPiecesOf(ent);
    if (pools.length === 1 && pieces.length === 0) {
      // Exactly one prevention applies → silently, with its toast (no prompt).
      const w = applyPreventionOrder(g, entityId, dmg, [{ kind: 'prevent', ...pools[0] }]);
      g = w.game; msgs.push(...w.msgs); dmg = w.remaining;
      if (dmg <= 0) return { game: g, msgs }; // fully prevented = no damage at all (R2)
    } else {
      // >1 prevention could apply (R3) — the combat driver pre-pauses in driveAttack
      // and never reaches here, so this is the NON-COMBAT deferral (armorSink
      // discipline). The HP outcome is order-independent — with armor among the
      // items the instance is fully prevented; without, dmg − Σprevent — and lands
      // NOW. The queued choice decides only whether/which armor piece takes the
      // counter, armed at the resolution boundary (armPrompts).
      const total = pools.reduce((s, p) => s + p.amount, 0);
      const outcome = pieces.length ? 0 : Math.max(0, dmg - total);
      g = { ...g, preventOrderQueue: [...(g.preventOrderQueue ?? []), {
        chooser: loc.player, entityId, entityName: ent.name, dmg, sourceName }] };
      msgs.push(`${ent.name}: prevention applies — ${ent.name}'s controller orders the effects`);
      dmg = outcome;
      if (dmg <= 0) return { game: g, msgs }; // fully prevented = no damage at all (R2)
    }
  } else {
    const armorPieces = armorPiecesOf(ent);
    if (armorPieces.length) {
      // 2+ pieces with no forced choice and a sink to defer into → the defender picks
      // which absorbs (armed after this resolution). Damage is fully prevented either way.
      if (armorPieces.length >= 2 && armorSink && !armorPieceId) {
        armorSink.push({ defender: loc.player, entityId, entityName: ent.name,
          candidates: armorPieces.map(p => ({ id: p.id, name: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })) });
        msgs.push(`${ent.name}'s armor blocks! (choose which)`);
        return { game, msgs };
      }
      // Single piece, or a forced/auto choice → apply the counter now.
      const piece = armorPieceId ? armorPieces.find(p => p.id === armorPieceId) ?? pickDefaultArmor(armorPieces) : pickDefaultArmor(armorPieces);
      const r = applyArmorCounter(game, entityId, piece.id);
      return { game: r.game, msgs: [...msgs, ...r.msgs] };
    }
  }

  const floor = hasModifier(ent, 'hpFloor1') ? 1 : 0;
  const newHp = Math.max(floor, ent.hp - dmg);

  // The Player Character's HP is the single source of truth, mirrored to the
  // PlayerState headline HP (stats pane) so combat and the display stay married.
  if (ent.kind === 'pc') {
    const g2 = setPcHp(g, loc.player, entityId, newHp, sourcePlayer);
    msgs.push(newHp <= 0
      ? `💀 ${ent.name} (PC) is defeated!`
      : `${sourceName} hits ${ent.name} for ${dmg} (${newHp} HP left)`);
    return { game: g2, msgs };
  }

  if (newHp <= 0) {
    msgs.push(`${sourceName} destroys ${ent.name}!`);
    const d = destroyEntity(g, entityId, sink, armorSink); // fires death triggers
    msgs.push(...d.msgs);
    return { game: d.game, msgs };
  }
  msgs.push(`${sourceName} hits ${ent.name} for ${dmg} (${newHp} HP left)`);
  return { game: updateEntity(g, entityId, { hp: newHp }), msgs };
}

/** The formed dealt amount for a combat hit on `defender` (R1, owner 2026-07-14):
 *  deal-side modifiers (Bane doubling) form the dealt amount BEFORE receipt-side
 *  prevention consults it. Single source for applyCombatHit and the prevention-
 *  ordering pause. */
export function combatDealt(ctx: AttackCtx, defender: BoardEntity): number {
  return isBaneTarget(ctx.banes, defender) ? ctx.dmg * 2 : ctx.dmg;
}

/** Apply one queued combat hit to `ctx.hitQueue[0]`, recording a DamageEvent for
 *  combat triggers (fully-prevented hits are excluded — they deal no HP damage). */
export function applyCombatHit(game: GameState, ctx: AttackCtx, armorPieceId?: string, preventOrder?: PreventItem[]): GameState {
  const entityId = ctx.hitQueue[0];
  const beforeLoc = findEntityAnywhere(game, entityId);
  if (!beforeLoc) { ctx.hitQueue.shift(); return game; }
  const before = beforeLoc.ent;
  // Bane doubles per hit (primary AND Cleave splash), keyed off each defender.
  const bane = isBaneTarget(ctx.banes, before);
  const dmg = combatDealt(ctx, before);
  if (bane) ctx.msgs.push(`${ctx.attackerName} strikes ${before.name} for double damage (Bane)`);
  const r = applyDamage(game, entityId, dmg, ctx.attackerName, ctx.attackerPlayer, ctx.deadSink, armorPieceId, undefined, preventOrder);
  ctx.msgs.push(...r.msgs);
  const after = findEntityAnywhere(r.game, entityId);
  const tookDamage = !after || after.ent.hp < before.hp; // armor-blocked hits don't count
  if (dmg > 0 && tookDamage) ctx.events.push({
    id: entityId, kind: before.kind, owner: beforeLoc.player,
    physical: before.kind === 'construct' && isPhysicalConstruct(before),
    destroyed: !after,
  });
  let g = r.game;
  // Poison (attacker keyword): a damaged CHARACTER that survives is exhausted and
  // gains a counter — the ready-phase Poison check takes it from there. Armor-blocked
  // hits deal no damage, so they don't poison; constructs aren't characters.
  if (ctx.poison && dmg > 0 && tookDamage && after && isCharacter(after.ent)) {
    const n = (after.ent.poison ?? 0) + 1;
    g = updateEntity(g, entityId, poisonHitPatch(after.ent));
    ctx.msgs.push(`${after.ent.name} is Poisoned — exhausted (${n} counter${n === 1 ? '' : 's'})`);
  }
  ctx.hitQueue.shift();
  return g;
}

/** Drive a (possibly resumed) attack to completion, or pause for an Armor choice.
 *  `ctx` is mutated in place — callers pass a fresh/cloned ctx. Returns either the
 *  finished game, or a `PendingArmor` to arm when a 2+armor character is hit. */
export function driveAttack(game: GameState, ctx: AttackCtx):
  | { done: true; game: GameState; ctx: AttackCtx }
  | { done: false; game: GameState; pendingArmor?: PendingArmor; pendingPreventOrder?: PendingPreventOrder } {
  let g = game;

  if (ctx.phase === 'damage') {
    while (ctx.hitQueue.length > 0) {
      const entityId = ctx.hitQueue[0];
      const loc = findEntityAnywhere(g, entityId);
      if (!loc) { ctx.hitQueue.shift(); continue; } // already removed by an earlier hit
      const pieces = armorPiecesOf(loc.ent);
      const pools = preventionEffectsFor(g, loc.ent, loc.player);
      if (pools.length && pools.length + pieces.length >= 2) {
        // >1 prevention effect could apply to this hit → PAUSE: the affected
        // character's controller orders them (R3, owner 2026-07-14). Each armor
        // piece is its own orderable item — placing a piece first both engages
        // armor AND picks the piece, so this pause subsumes the legacy piece-pick
        // whenever board prevention is present. The head of the queue stays put so
        // resolvePreventOrder resolves it. Gathered per hit — each Cleave splash
        // hit on a covered character gets its own prevention (per-hit application).
        return { done: false, game: g, pendingPreventOrder: {
          chooser: loc.player, entityId, entityName: loc.ent.name,
          dmg: combatDealt(ctx, loc.ent), sourceName: ctx.attackerName,
          items: [
            ...pools.map(p => ({ kind: 'prevent' as const, ...p })),
            ...pieces.map(p => ({ kind: 'armor' as const, pieceId: p.id, pieceName: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })),
          ],
          picked: [], ctx,
        } };
      }
      if (!pools.length && pieces.length >= 2) {
        // Armor-only (legacy, unchanged): the defender chooses which piece absorbs
        // this hit. The head of the queue stays put so the choice resolves it.
        return { done: false, game: g, pendingArmor: {
          defender: loc.player, entityId, entityName: loc.ent.name,
          candidates: pieces.map(p => ({ id: p.id, name: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })),
          ctx,
        } };
      }
      g = applyCombatHit(g, ctx); // 0 or 1 prevention → resolve immediately (a single pool applies silently with its toast)
    }
    ctx.phase = 'after';
  }

  // After-phase (runs once, never pauses): post-damage combat triggers, Reckless,
  // Hit & Run. onAttack is NOT fired here — R2 (owner 2026-07-12): "when/whenever X
  // attacks" is a DECLARATION-window trigger and resolves during the attack step
  // BEFORE damage is ever queued (the store's commitAttack fires it pre-damage).
  const attLoc = findEntityAnywhere(g, ctx.charId);
  if (attLoc) {
    const attacker = attLoc.ent;
    if (combatTriggerEffects(attacker, 'onDealDamage').length || combatTriggerEffects(attacker, 'onKill').length) {
      const ct = resolveCombatTriggers(g, attacker, ctx.attackerPlayer, ctx.events, ctx.armorSink, ['onDealDamage', 'onKill']);
      g = ct.game; ctx.msgs.push(...ct.msgs);
    }
  }
  if (ctx.reckless) {
    const aLoc = findEntityAnywhere(g, ctx.charId);
    if (aLoc) {
      const atkHp = Math.max(0, aLoc.ent.hp - 1);
      ctx.msgs.push(`${ctx.attackerName} takes 1 damage (Reckless)`);
      if (aLoc.ent.kind === 'pc') {
        g = setPcHp(g, aLoc.player, ctx.charId, atkHp); // mirrors the headline; recoil at 0 HP loses the game
      } else if (atkHp <= 0) {
        const d = destroyEntity(g, ctx.charId, ctx.deadSink, ctx.armorSink); // fires death triggers
        g = d.game; ctx.msgs.push(...d.msgs);
      } else {
        g = updateEntity(g, ctx.charId, { hp: atkHp });
      }
    }
  }
  if (ctx.hitRun) {
    const aLoc = findEntityAnywhere(g, ctx.charId);
    if (aLoc) { g = updateEntity(g, ctx.charId, { statuses: grantHitRun(aLoc.ent) }); ctx.msgs.push(`${ctx.attackerName} may move again (Hit & Run)`); }
  }
  return { done: true, game: g, ctx };
}

/** An optional "you may pay HP from your PC: +N attack damage" on-attack ability
 *  (Mara, the Sworn Sword). Returns the cost + bonus if the controller can pay, else null. */
export function optionalAttackAbility(attacker: BoardEntity, game: GameState, side: 'p1' | 'p2'): { sourceName: string; payHP: number; bonus: number } | null {
  for (const clause of combatTriggerEffects(attacker, 'onAttack')) {
    if (!clause.optional || clause.cost?.kind !== 'payHP') continue;
    const bonus = clause.effects.reduce((sum, e) => e.op === 'attackBonus' ? sum + e.amount : sum, 0);
    if (bonus <= 0) continue;
    const pcLoc = pcIdOf(game, side);
    const pc = pcLoc ? findEntityAnywhere(game, pcLoc)?.ent : null;
    if (!pc || pc.hp <= clause.cost.amount) continue; // must keep ≥1 HP — never pay a lethal cost
    return { sourceName: clause.sourceName, payHP: clause.cost.amount, bonus };
  }
  return null;
}

// ─── Attacker-side combat triggers (onAttack / onDealDamage / onKill) ──────────
/** A clause (effects + gate + label) drawn from an entity's combat triggers. */
export interface CombatClause { effects: Effect[]; if?: Condition; sourceName: string; optional?: boolean; cost?: Cost }

/** Combat-trigger clauses from an entity's own card AND its equipped items. */
export function combatTriggerEffects(ent: BoardEntity, trigger: Trigger): CombatClause[] {
  const out: CombatClause[] = [];
  const collect = (name: string) => {
    const card = CATALOG.find(c => c.name === name);
    for (const ce of card?.effects ?? [])
      if (ce.trigger === trigger) out.push({ effects: ce.effects, if: ce.if, sourceName: name, optional: ce.optional, cost: ce.cost });
  };
  collect(ent.name);
  const lo = ent.loadout;
  if (lo) for (const it of [lo.weapon, ...lo.gear]) if (it) collect(it.name);
  return out;
}

/** Does a combat-trigger event satisfy a clause's `if` gate? */
export function eventMatches(cond: Condition | undefined, ev: DamageEvent, attackerOwner: 'p1' | 'p2'): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case 'damagedIsEnemyCompanion': return ev.kind === 'companion' && ev.owner !== attackerOwner;
    case 'killedIsCompanion': return ev.kind === 'companion';
    case 'killedIsPhysicalConstruct': return ev.kind === 'construct' && ev.physical;
    default: return true; // board-state conditions don't gate combat events
  }
}

/**
 * Fire an attacker's onAttack/onDealDamage/onKill triggers. `which` selects the
 * window: onAttack is a DECLARATION-window trigger — R2 (owner 2026-07-12) has it
 * resolve during the attack step before damage is queued — while the per-event
 * triggers fire after damage, once per matching damage event. Interactive targets
 * are auto-picked to the attacker's
 * own side (no mid-combat prompt). `attacker` is a snapshot, so a queued onAttack
 * still resolves if the attacker died to a trap above it on the stack (R1).
 */
export function resolveCombatTriggers(game: GameState, attacker: BoardEntity, attackerOwner: 'p1' | 'p2', events: DamageEvent[], armorSink?: ArmorChoiceData[], which: ('onAttack' | 'onDealDamage' | 'onKill')[] = ['onAttack', 'onDealDamage', 'onKill']): { game: GameState; msgs: string[] } {
  let g = game;
  const msgs: string[] = [];
  const run = (clause: CombatClause, ctx?: EffectCtx) => {
    let targetId: string | undefined;
    const spec = actionTargetSpec(clause.effects);
    if (spec) {
      const elig = eligibleTargets(g, attackerOwner, spec).filter(id => findEntityAnywhere(g, id)?.player === attackerOwner);
      if (elig.length === 0) return; // no own target — fizzle
      targetId = elig[0];
    }
    const r = resolveActionEffects(g, attackerOwner, clause.sourceName, clause.effects, targetId, attacker.id, ctx, undefined, armorSink);
    g = r.game;
    if (r.msgs.length) msgs.push(`${clause.sourceName}: ${r.msgs.join(' | ')}`);
  };

  if (which.includes('onAttack'))
    // Optional clauses (Mara's pay-HP) resolve here as no-ops — their attackBonus
    // effects do nothing in the interpreter (the real choice happened via
    // pendingAttackChoice pre-commit). Kept deliberately: each clause invocation
    // draws the interpreter's per-resolution die, and dropping them would shift the
    // recorded RNG cadence of every committed replay fixture containing such attacks.
    for (const clause of combatTriggerEffects(attacker, 'onAttack'))
      if (!clause.if || conditionMet(g, attackerOwner, clause.if)) run(clause);
  if (which.includes('onDealDamage'))
    for (const clause of combatTriggerEffects(attacker, 'onDealDamage'))
      for (const ev of events) if (eventMatches(clause.if, ev, attackerOwner)) run(clause, { damagedOwner: ev.owner });
  if (which.includes('onKill'))
    for (const clause of combatTriggerEffects(attacker, 'onKill'))
      for (const ev of events) if (ev.destroyed && eventMatches(clause.if, ev, attackerOwner)) run(clause);

  return { game: g, msgs };
}

/**
 * Fire an entity's onDestroy/onLeave triggers (its own card + equipped items, e.g.
 * Memory Stone) as it is removed. Resolved for the entity's controller; interactive
 * targets auto-pick the first own-side eligible. Called from applyDamage's destroy
 * branch (other removal paths — bounce/sacrifice — are not yet hooked).
 */
export function resolveRemovalTriggers(game: GameState, ent: BoardEntity, controller: 'p1' | 'p2', sink?: PendingDeadPick[], armorSink?: ArmorChoiceData[]): { game: GameState; msgs: string[] } {
  let g = game;
  const msgs: string[] = [];
  for (const trig of ['onDestroy', 'onLeave'] as const) {
    for (const clause of combatTriggerEffects(ent, trig)) {
      if (clause.if && !conditionMet(g, controller, clause.if)) continue;
      let targetId: string | undefined;
      const spec = actionTargetSpec(clause.effects);
      if (spec) {
        const elig = eligibleTargets(g, controller, spec).filter(id => findEntityAnywhere(g, id)?.player === controller);
        if (elig.length === 0) continue;
        targetId = elig[0];
      }
      const r = resolveActionEffects(g, controller, clause.sourceName, clause.effects, targetId, ent.id, undefined, sink, armorSink);
      g = r.game;
      if (r.msgs.length) msgs.push(`${clause.sourceName}: ${r.msgs.join(' | ')}`);
    }
  }
  return { game: g, msgs };
}

/** Does this entity have any removal trigger (onDestroy/onLeave) on its card or items? */
export function hasRemovalTrigger(ent: BoardEntity): boolean {
  return combatTriggerEffects(ent, 'onDestroy').length > 0 || combatTriggerEffects(ent, 'onLeave').length > 0;
}

/** +damage on this attacker's attacks from `attackBonus` onAttack clauses (Scorching Brand). */
export function attackDamageBonus(attacker: BoardEntity, game: GameState, side: 'p1' | 'p2'): number {
  let sum = 0;
  for (const clause of combatTriggerEffects(attacker, 'onAttack')) {
    if (clause.optional) continue; // "you may pay…" bonuses are added only if the player opts in
    if (clause.if && !conditionMet(game, side, clause.if)) continue;
    for (const e of clause.effects) if (e.op === 'attackBonus') sum += e.amount;
  }
  return sum;
}

/** Turn a sink of deferred Dead-Zone picks into a store patch: arm the first, queue the
 *  rest. Returns `{}` when empty so spreading it never clobbers an existing prompt. */
export function armDeadPicks(sink: PendingDeadPick[]): { pendingDeadPick?: PendingDeadPick; pendingDeadPickQueue?: PendingDeadPick[] } {
  return sink.length ? { pendingDeadPick: sink[0], pendingDeadPickQueue: sink.slice(1) } : {};
}

/** Arm the next deferred non-combat Armor choice, re-deriving candidates against the
 *  current board (a piece sacrificed by an earlier choice drops out; a lone remaining
 *  piece auto-absorbs with no prompt). Returns the updated game + the PendingArmor to
 *  show, or null when the queue is exhausted. */
export function armNextArmorChoice(game: GameState, queue: ArmorChoiceData[]): { game: GameState; pendingArmor: PendingArmor | null } {
  let g = game;
  const rest = [...queue];
  while (rest.length) {
    const c = rest.shift()!;
    const loc = findEntityAnywhere(g, c.entityId);
    if (!loc) continue; // entity gone since
    const pieces = armorPiecesOf(loc.ent);
    if (pieces.length >= 2) {
      return { game: g, pendingArmor: {
        defender: c.defender, entityId: c.entityId, entityName: loc.ent.name,
        candidates: pieces.map(p => ({ id: p.id, name: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })),
        queue: rest,
      } };
    }
    if (pieces.length === 1) g = applyArmorCounter(g, c.entityId, pieces[0].id).game; // no choice left
    // 0 pieces → nothing to absorb with; skip
  }
  return { game: g, pendingArmor: null };
}

/** Arm the next deferred non-combat prevention ordering from game.preventOrderQueue,
 *  re-deriving items against the current board (the armNextArmorChoice discipline:
 *  a source destroyed since damage time drops out). The HP outcome already landed at
 *  damage time; a collapsed choice leaves at most one mechanical residue: a lone
 *  remaining armor piece must have engaged (the instance was fully prevented), so it
 *  auto-takes its counter. Clears the queue field to undefined when drained (replay-
 *  hash neutrality for prevention-free games). */
export function armNextPreventOrder(game: GameState): { game: GameState; pendingPreventOrder: PendingPreventOrder | undefined; msgs: string[] } {
  let g = game;
  const msgs: string[] = [];
  const rest = [...(g.preventOrderQueue ?? [])];
  while (rest.length) {
    const c = rest.shift()!;
    const loc = findEntityAnywhere(g, c.entityId);
    if (!loc) continue; // entity gone since
    const pools = preventionEffectsFor(g, loc.ent, loc.player);
    const pieces = armorPiecesOf(loc.ent);
    const items: PreventItem[] = [
      ...pools.map(p => ({ kind: 'prevent' as const, ...p })),
      ...pieces.map(p => ({ kind: 'armor' as const, pieceId: p.id, pieceName: p.name, counters: p.counters ?? 0, armor: p.armor ?? 0 })),
    ];
    if (items.length >= 2) {
      const q = rest.length ? rest : undefined;
      return { game: { ...g, preventOrderQueue: q }, pendingPreventOrder: { ...c, items, picked: [] }, msgs };
    }
    if (items.length === 1 && items[0].kind === 'armor') {
      const r = applyArmorCounter(g, c.entityId, items[0].pieceId);
      g = r.game; msgs.push(...r.msgs);
    }
    // a lone prevent (or nothing) → no residue to place
  }
  return { game: { ...g, preventOrderQueue: undefined }, pendingPreventOrder: undefined, msgs };
}

/** End-of-resolution patch arming any deferred Dead-Zone + Armor + prevention prompts. */
export function armPrompts(game: GameState, deadSink: PendingDeadPick[], armorSink: ArmorChoiceData[]): GameState {
  const a = armNextArmorChoice(game, armorSink);
  let g: GameState = { ...a.game, ...armDeadPicks(deadSink), pendingArmor: a.pendingArmor };
  // Deferred prevention orderings arm behind an armor prompt (resolveArmor re-arms
  // when it drains) — dialogs never stack.
  if (!g.pendingArmor && g.preventOrderQueue?.length) {
    const p = armNextPreventOrder(g);
    g = { ...p.game, pendingPreventOrder: p.pendingPreventOrder };
  }
  // Item Transfer windows queued by destroyEntity during this resolution arm LAST —
  // armNextItemTransfer holds itself back while the dead-pick/armor/prevention prompts
  // just armed are up (their resolvers re-call it when they drain).
  return armNextItemTransfer(g);
}
