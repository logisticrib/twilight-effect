/**
 * Structured card-effect schema for The Twilight Effect.
 *
 * Effects live ON the card (the `effects` field of a Card), authored alongside
 * the card's stats and text — one source of truth, churn-proof. A card-agnostic
 * interpreter resolves these descriptors against game events; the engine knows
 * primitives, never specific cards.
 *
 * This vocabulary is derived from Game_Rules_Updated.md + Card_Design_Parameters.md.
 * Slice 1 defines the schema; later slices implement the interpreter primitive by
 * primitive. NOT-yet-modeled future mechanics (Blueprint modal, Overkill, Warded,
 * gain-control) have stubs marked `future`. Stripped per design owner: Initiative,
 * Exile (Dead Zone is the only discard pile).
 */

// ─── WHEN an effect fires ──────────────────────────────────────────────────────
export type Trigger =
  | 'onPlay'        // Action card resolves
  | 'onEnter'       // companion/construct enters the encounter
  | 'equipped'      // item becomes attached (continuous while equipped)
  | 'static'        // continuous aura while this permanent is in play
  | 'onAttack'      // this character declares an attack
  | 'onDealDamage'  // after this character deals damage
  | 'onDamaged'     // this character is dealt damage
  | 'onKill'        // this character reduces another to 0 HP
  | 'onDeath'       // this is reduced to 0 HP
  | 'onDestroy'     // this is removed by a destroy effect
  | 'onLeave'       // this leaves the encounter (any removal — catch-all)
  | 'startOfTurn'
  | 'endOfTurn'
  | 'onOpponentAction' // reactive: the opponent plays an Action card (counter wards)
  | 'activated'     // player-initiated; see `cost`
  // Reactive trap windows (trigger-stack arc, owner-ratified 2026-07-12). These queue
  // onto the trigger stack (src/engine/stack.ts) and resolve LIFO — see the dated
  // Rules Notes in docs/Game_Rules_Updated.md §Timing. Their effects may target
  // 'eventSubject' (the entering / moving / attacking companion).
  | 'oppCompanionEnters'            // an opposing companion enters the encounter (Tripwire Snare)
  | 'oppCompanionMovesToFront'      // an opposing companion MOVES into the front line — movement only,
                                    // NOT direct entry onto the front line (R4, owner 2026-07-12) (Pit Trap)
  | 'oppCompanionAttacksCompanion'; // an opposing companion declares an attack on one of YOUR companions
                                    // ("attacks" = declaration; resolves before damage — R2) (Iron Spikes)

// ─── WHO/WHAT an effect targets ────────────────────────────────────────────────
// Interactive specs require a board selection step (reuses the pendingTrigger layer).
// Per rules: "companion" excludes the Player Character; "character" includes it.
export type TargetSpec =
  // interactive single targets
  | 'anyCharacter' | 'enemyCharacter' | 'ownCharacter' | 'otherCharacter'
  | 'anyCompanion' | 'enemyCompanion' | 'ownCompanion'
  | 'anyConstruct' | 'physicalConstruct' | 'magicalConstruct'
  | 'anyItem' | 'targetPlayer'
  // auto-scoped groups (no selection)
  | 'self' | 'allEnemies' | 'allEnemyCompanions' | 'ownCompanions' | 'ownPhysicalConstructs' | 'ownMagicalConstructs'
  | 'frontLineOwn' | 'frontLineEnemy' | 'backLineEnemy' | 'sameLineAsTarget' | 'ownParty'
  // combat-trigger context (resolved from the event, not the board)
  | 'damagedController'    // the Player Character of the just-damaged entity's owner
  // reactive-trigger context (resolved from the queued trigger's event, not the board)
  | 'eventSubject';        // the companion the reactive event is about (the enterer / mover / attacker)

// ─── Conditions for `if`/`while` ───────────────────────────────────────────────
export type Condition =
  | { kind: 'controlsType'; cardType: 'Companion' | 'Construct'; subtype?: string }
  | { kind: 'controlsCount'; of: 'companions' | 'constructs'; min: number }
  | { kind: 'willpowerAtLeast'; value: number }
  | { kind: 'targetIsSubtype'; subtype: string }
  // combat-trigger event gates (checked against the damage/kill event, not the board)
  | { kind: 'damagedIsEnemyCompanion' }
  | { kind: 'killedIsCompanion' }
  | { kind: 'killedIsPhysicalConstruct' };

// ─── Amounts (fixed or derived/random) ─────────────────────────────────────────
// perControlled 'constructs' was REMOVED 2026-07-03 (owner): no card authored it and the
// engine only counted companions — the contract must not advertise unimplemented design
// space. Re-add it together with engine support when a future card needs it.
export type Amount = number | { die: number } | { halfDie: number } | { halfDieUp: number } | { perControlled: 'companions' };

// ─── Activated-ability costs ───────────────────────────────────────────────────
// 'sacrifice' (targeted) and 'discard' were REMOVED 2026-07-08 (owner ruling): no
// engine path paid them — a card carrying one resolved its ability COST-FREE. The
// contract must not advertise unimplemented design space (perControlled precedent);
// re-add together with engine support when a card needs them.
export type Cost =
  | { kind: 'exhaustSelf' }
  | { kind: 'sacrificeSelf' }
  | { kind: 'payHP'; amount: number }
  | { kind: 'removeAnchor'; count: number };

// ─── WHAT an effect does (the primitive vocabulary) ────────────────────────────
export type Effect =
  // damage / healing
  | { op: 'damage'; amount: Amount; target: TargetSpec; splash?: 'line' | 'board' }
  | { op: 'damageSelfPC'; amount: Amount }
  | { op: 'heal'; amount: Amount; target: TargetSpec }
  // attack/stat modification (HP buffs ONLY as continuous statics — no temp +HP per rules §8)
  | { op: 'buff'; stat?: 'atk' | 'hp'; amount?: number; grant?: string[]; modifiers?: Modifier[]; scope: TargetSpec; duration: 'endOfTurn' | 'while'; where?: { line?: 'front' | 'back'; cls?: string } }
  // card / zone movement
  | { op: 'draw'; count: number; if?: Condition }
  | { op: 'discard'; count: number; target: TargetSpec; random?: boolean }
  | { op: 'mill'; count: number; target: TargetSpec }
  | { op: 'shuffleHandRedraw'; offset?: number }  // opponent shuffles hand into deck, redraws (handSize + offset); Convergence Sigil uses offset -1
  | { op: 'deckPeek'; look: number; dests: ('hand' | 'top' | 'bottom')[]; maxHand?: number }  // scry/select
  | { op: 'returnFromDead'; cardType?: string; to: 'hand' | 'encounter' }
  | { op: 'search'; cardType: string }
  // board manipulation
  | { op: 'move'; target: TargetSpec; to: 'anySlot' | 'adjacent'; forced?: boolean }
  | { op: 'bounce'; target: TargetSpec }                    // return permanent to hand
  | { op: 'extraAttack'; target: TargetSpec }               // attack an additional time
  | { op: 'forceAttack'; attackers: TargetSpec; target: TargetSpec }
  | { op: 'anchor'; delta: number; target: TargetSpec }     // Reinforce/Dismantle/Shore Up/Demolish
  | { op: 'sacrifice'; target: TargetSpec }
  | { op: 'sacrificeItem'; target: TargetSpec }
  | { op: 'equipFromHand'; target: TargetSpec }
  | { op: 'animate'; atk: number; hp: number; target: TargetSpec; max?: number }  // Animate Magic X (max caps a group target, e.g. "up to two")
  | { op: 'dieCheck'; threshold: number; onPass: Effect[]; onFail: Effect[] }  // roll d6, branch
  | { op: 'attackDisarm'; attacker: TargetSpec; target: TargetSpec }  // two-step: your char attacks, then sac an item on the target
  | { op: 'moveAnchor'; count: number }  // two-step: move N anchors from one of your Physical Constructs to another
  // damage MODIFIERS (passive, consulted by the damage pipeline — not standalone instances)
  | { op: 'attackBonus'; amount: number }        // (onAttack, gated by clause `if`) +dmg to the bearer's attack
  // (static) receipt-side damage prevention aura (Reflecting Pool): while this
  // permanent is in play, prevent `amount` of each damage instance a covered
  // character would take. Deal-side modifiers form the dealt amount FIRST; prevention
  // then applies to it (R1, owner 2026-07-14). Scope is exactly what the card names —
  // 'ownCompanions' never covers the PC (R-scope); `where.cls` narrows by class.
  // Engine-supported scopes only (contract must not advertise unimplemented space).
  | { op: 'preventDamage'; amount: number; scope: 'ownCompanions' | 'ownParty'; where?: { cls?: string } }
  | { op: 'magicDamageBonus'; amount: number }   // (static) +dmg to each enemy your Magic Actions damage
  | { op: 'preventAnchorDecay' }                 // (static) your Physical Constructs skip start-of-turn anchor decay
  | { op: 'lineWard' }                           // (static) opposing companions can't attack characters on the line opposite this construct
  | { op: 'exhaustSelf' }                        // exhaust the source permanent (e.g. Library of Memory's "if you do")
  | { op: 'exhaust'; target: TargetSpec }        // exhaust the target (Pit Trap: 'eventSubject'). Mandatory triggers
                                                 // still fire when this is a no-op (already-exhausted target — R4)
  // future (declared so authored cards validate; interpreter support added later)
  | { op: 'modal'; options: { label: string; effects: Effect[] }[] }  // Blueprint
  | { op: 'gainControl'; target: TargetSpec; duration: 'while' }
  | { op: 'suppressKeywords'; scope: TargetSpec; where?: { line?: 'front' | 'back' } }  // static aura: affected lose all keywords
  | { op: 'grantKeywords'; keywords: string[]; scope: TargetSpec; where?: { line?: 'front' | 'back' } }  // static aura: affected GAIN keywords (Bastion Wall)
  | { op: 'backLineAttack' }  // static: your back-line COMPANIONS may attack as if they had Ranged — attack eligibility ONLY, no defensive Ranged targetability (Watchtower)
  // (static) standing-restriction auras (arc 3, owner-ratified 2026-07-15). "Cannot"
  // beats "can" (R1): legality gates consult these AFTER permissions, so a restriction
  // always has the final word. Checked when the action is attempted (R2) — never
  // retroactive. Scope is the aura controller's OPPOSING companions only
  // (engine-supported scopes only; the controller's own side is never restricted).
  | { op: 'restrictAttack'; scope: 'oppCompanions'; where?: { line?: 'front' | 'back' } }  // Crystalline Sentinel
  // 'lines' = between front and back. Covers ALL movement between them — chosen moves
  // and effect-driven repositioning alike (R3). Entering the encounter is not movement,
  // and lateral within-line repositioning is not "between" lines (R4 / 2026-07-13 note).
  | { op: 'restrictMove'; scope: 'oppCompanions'; between: 'lines' }  // Reinforced Gate
  | { op: 'counterAction' };  // sacrifice this; the opponent's Action is countered to their Dead Zone

/** Non-stat continuous modifiers a buff can grant (rules-flavored flags). */
export type Modifier = 'hpFloor1' | 'cannotBeMoved' | 'cannotAttack' | 'doesNotReady';

/** One trigger→effects clause on a card. */
export interface CardEffect {
  trigger: Trigger;
  effects: Effect[];
  optional?: boolean;          // "you may"
  oncePerTurn?: boolean;
  if?: Condition;              // gate the whole clause
  cost?: Cost;                 // required when trigger === 'activated'
  uncounterable?: boolean;     // (on an Action's onPlay clause) cannot be countered
}
