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
  | 'oppCompanionAttacksCompanion'  // an opposing companion declares an attack on one of YOUR companions
                                    // ("attacks" = declaration; resolves before damage — R2) (Iron Spikes)
  | 'oppCompanionAttacks'           // an opposing companion declares an attack on ANY of your characters —
                                    // PC included (owner rewording 2026-08-11, The Final Word: "whenever an
                                    // opposing companion attacks" carries no target scope; the R4
                                    // companion-vs-companion reading stays with the trap window above)
  | 'onEquippedAttacked'            // ITEM-hosted (Arc E 2026-07-23, Caltrop Pouch): the equipped character is
                                    // the target of a DECLARED attack — fires in the declaration window (R2),
                                    // any attacker, PC bearer included; gathered from the target's live loadout
  | 'oppCompanionFlees'             // an opposing companion FLEES (Ready Phase Willpower exit). NARROW is
                                    // OWNER-RULED (2026-07-23): "flees" means flees — never other sacrifices
                                    // (flee-is-a-sacrifice governs what a flee IS, not what "flees" wording
                                    // listens to). Fired per flee event (Dread Chorister)
  // On-play window (arc 4, owner-ratified 2026-07-15). "Play" means FROM HAND,
  // universally (R1 2026-07-15, generalizing the 2026-07-04 Paranoia ruling):
  // placements, Animate Magic conversions, and every other entry-into-play route
  // never emit a play event. Queues ABOVE the played card on the stack, so it
  // resolves BEFORE the played card enters ("plays" and "enters" are distinct
  // sequential events — Trigger Stack note 2026-07-12).
  | 'ownPlaysMagicalConstruct'      // YOU (the listener's controller) play a Magical
                                    // (Incantation) Construct from hand (Patient Conjurer)
  | 'ownPlaysCompanion'             // YOU (the listener's controller) play a COMPANION
                                    // from hand (Arc G 2026-08-04, Echo-Keeper). Same
                                    // play-window discipline; per-event evaluation
                                    // (2026-07-21) means the listener must be on the
                                    // board AS OF the play — a companion entering from
                                    // this very play never hears itself.
  // On-sacrifice window (arc 5, owner-ratified 2026-07-15). Fires on every event
  // canon words as SACRIFICE — anchor decay reaching zero, Dismantle, sacrifice
  // costs, trap self-sacrifice, Coercion, and (re-rule 2026-07-20) companion
  // FLEEING — regardless of which player caused it;
  // NEVER on destruction by damage or non-sacrifice removal (the cause is threaded
  // through destroyEntity, not inferred from death generally). R3: the sacrificed
  // permanent's OWN listener fires too — gathered at event time (pre-removal),
  // resolved after it leaves (2026-07-12 queued-trigger canon).
  | 'ownPhysicalConstructSacrificed'  // one of YOUR (the listener's controller's)
                                      // Physical (Trap/Fortification) Constructs is
                                      // sacrificed (Siegeworks)
  // Item-hosted play rider (2026-07-16, partial-gaps closeout): fires when the
  // EQUIPPED character plays a Magic Action — on the PLAY itself (a countered
  // action was still played). Printed per-turn limits stay on triggers (the
  // exhaust-cost guideline governs activated abilities only).
  | 'onEquippedPlaysMagicAction';     // Embercast Wand

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
  // Gear targeting (Arc A, 2026-08-19). Items are NOT board entities — they live in a
  // character's `loadout` — so these resolve to ITEM ids, and the pick surface is the
  // bearer's loadout panel. 'anyGear' is deliberately un-sided: canon's "target Gear"
  // carries no controller qualifier, so either player's Gear is legal.
  // 'gearOrPhysicalConstruct' is the first UNION spec (Unmake the Works / Consecrate
  // the Ground) and can resolve to either an item id or a construct entity id.
  | 'anyGear' | 'gearOrPhysicalConstruct'
  // auto-scoped mass Gear (Let the Wild In) — SYMMETRIC, both players' Gear (owner
  // 2026-08-19). No selection.
  | 'allGear'
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
  // UNTAMED (Arc C, 2026-08-23) — "no Gear or Physical Constructs in the encounter"
  // (Master_Keyword_List.md:133). ENCOUNTER-WIDE and controller-agnostic: it carries no
  // side, and conditionMet ignores its `lp`. KEYWORD-INDEPENDENT (owner ruling
  // 2026-08-23): the condition asks about the encounter, not about whether the asking
  // card prints UNTAMED — which is what lets Elder Shellback's "if it is Untamed" work
  // while the card prints Guardian and Oathsworn.
  //   · on a `static` clause  → CONTINUOUS: re-read on every stat/keyword read, so the
  //     bonus tracks the board in both directions with nothing stamped.
  //   · on an `onEnter` clause → ENTRY SNAPSHOT: read once, when the trigger resolves.
  //     Deliberately never re-evaluated — an encounter that clears later places nothing
  //     retroactively (the dd000066 exception shape, owner-ratified).
  | { kind: 'untamed' }
  // combat-trigger event gates (checked against the damage/kill event, not the board)
  | { kind: 'damagedIsEnemyCompanion' }
  | { kind: 'killedIsCompanion' }
  | { kind: 'killedIsPhysicalConstruct' }
  // Death-cause gate (Arc C, 2026-07-23 — Cult Fanatic's "if it died to damage"):
  // evaluated in resolveRemovalTriggers against destroyEntity's REQUIRED cause,
  // never by conditionMet (whose default-true covers board-state kinds).
  | { kind: 'diedToDamage' };

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
  // Exhaust the ITEM hosting this activated clause (owner-ratified 2026-07-15 —
  // Anchor Stone: "exhaust this trinket"). Item exhaustion is a real mechanic:
  // it travels with the item (a Kit-Master move does not refresh it) and readies
  // at the start of the controller's turn. Item-hosted clauses only.
  | { kind: 'exhaustItem' }
  | { kind: 'sacrificeSelf' }
  | { kind: 'payHP'; amount: number }
  | { kind: 'removeAnchor'; count: number };

// ─── WHAT an effect does (the primitive vocabulary) ────────────────────────────
export type Effect =
  // damage / healing
  | { op: 'damage'; amount: Amount; target: TargetSpec; splash?: 'line' | 'board' }
  | { op: 'damageSelfPC'; amount: Amount }
  | { op: 'heal'; amount: Amount; target: TargetSpec }
  // attack/stat modification (HP buffs ONLY as continuous statics — no temp +HP per rules §8).
  // Durations (Arc B, 2026-07-23): 'endOfTurn' (shipped stamp) · 'while' (static aura,
  // never stamped — negative amounts with scope allEnemyCompanions are hostile debuff
  // auras, e.g. Pale Confessor) · 'untilYourNextTurn' (stamped; strips at the CASTER's
  // next turn start) · 'controllersNextTurn' (stamped WINDOW: dormant until the
  // target's controller's next turn, live during it, gone at its end — Doubt).
  // amount may be negative (debuffs); the value clamp lives in effectiveAttack.
  // Durations (Arc B anchors; Arc H addition): 'controllersNextTurnStart' covers the
  // recipient's CONTROLLER's next turn-START window (the ready step + the Poison
  // check) — dormancy + turnEnd expiry, deliberately NO activeDuring: runReadyPhase
  // runs BEFORE endTurn flips activePlayer, so a Doubt-shaped activeDuring window is
  // not yet live at the ready step (Arc H finding, 2026-08-04). The entry stays
  // inertly live for the rest of that turn (nothing re-reads 'doesNotReady' after
  // the turn-start window) and strips at its end.
  | { op: 'buff'; stat?: 'atk' | 'hp'; amount?: number; grant?: string[]; modifiers?: Modifier[]; scope: TargetSpec; duration: 'endOfTurn' | 'while' | 'untilYourNextTurn' | 'controllersNextTurn' | 'controllersNextTurnStart'; where?: { line?: 'front' | 'back'; cls?: string; subtype?: string } }
  // card / zone movement
  // perDestroyed (Arc A, 2026-08-19 — Let the Wild In: "draw a card for each Gear
  // destroyed this way"): the count is how many permanents THIS resolution actually
  // destroyed, not a board delta and not the number targeted. `count` is ignored when
  // set. No prevention-of-destruction mechanic exists in canon (swept 2026-08-19), so
  // destroyed-count and resolved-destroys are the same number today; if such a
  // mechanic is ever ruled, this is the site that must honour it.
  | { op: 'draw'; count: number; if?: Condition; perDestroyed?: boolean }
  // discard (Arc A, 2026-07-22): the DISCARDING player chooses the card (owner
  // agency, the Coercion precedent). Engine-supported victim scopes: targetPlayer
  // (the opponent), damagedController (combat ctx), eventSubject (the subject's
  // controller — trap windows). `random` remains unimplemented.
  | { op: 'discard'; count: number; target: TargetSpec; random?: boolean }
  | { op: 'mill'; count: number; target: TargetSpec }
  | { op: 'shuffleHandRedraw'; offset?: number }  // opponent shuffles hand into deck, redraws (handSize + offset); Convergence Sigil uses offset -1
  // deckPeek: deck 'any' = controller chooses whose (2026-07-16); deck 'opp' = the
  // opponent's deck (Arc A); reorder = "put them back in any order" — all looked-at
  // cards return to the top in a chosen sequence (resolvePeekOrder), dests ignored.
  | { op: 'deckPeek'; look: number; dests: ('hand' | 'top' | 'bottom')[]; maxHand?: number; deck?: 'any' | 'opp'; reorder?: boolean }
  // revealHand (Arc A, 2026-07-22): look at the opponent's hand. With pick
  // 'toBottomDraw' the looker may choose a card — bottom of its owner's deck, then
  // that player draws (Mark the Pockets).
  | { op: 'revealHand'; pick?: 'toBottomDraw' }
  // eachPlayerSacrificesOrDiscards (Arc F, 2026-07-24 — Siege Rations): each player
  // sacrifices a permanent or discards a card, THEIR choice (the Coercion prompt,
  // chained). Order: the non-active player's resolution first (2026-07-22 structural
  // queue, Note-supported reading). PC never sacrifice-legal (owner-ruled 2026-07-24).
  | { op: 'eachPlayerSacrificesOrDiscards' }
  // applyPoison (Arc D, 2026-07-23 — Poisoned Caltrops): effect-applied Poison
  // counters. Applies the SAME patch as the combat keyword (poisonHitPatch:
  // counter + POISONED status + exhaust — canon Poison always exhausts with the
  // counter, so "exhaust it and put a Poison counter on it" is this ONE op).
  // Provenance canon (RULED 2026-07-22): the ready-phase check cannot tell the
  // entry points apart. Choiceless — no prompt. Engine-supported target:
  // eventSubject (trap windows).
  | { op: 'applyPoison'; count: number; target: TargetSpec }
  // placeArmor (Arc C, 2026-08-23 — Elder Shellback): put N armor counters on each
  // entity in scope. This op ONLY PLACES; it wires up no prevention, because the
  // universal counter rule (MKL:52, ruled 2026-08-18) already made the counters BE the
  // ability: "armor counters on a companion ARE the prevention … regardless of how the
  // counters arrived — printed keyword or card effect". armorCandidatesOf already
  // offers an entity's own counters and removeArmorCounter already spends them, so
  // effect-placed and keyword-native counters are indistinguishable downstream.
  // `armorStart` is deliberately NOT written: it records the PRINTED X and is absent
  // for effect-placed counters (the documented contract on BoardEntity).
  // `subtype` narrows the group by AUTHORED token membership, matching `ready` (Arc B).
  | { op: 'placeArmor'; count: number; target: TargetSpec; subtype?: string }
  // itemKind narrows an Item recovery to Weapon/Armor/Trinket ("return target Weapon" —
  // Fence's Ledger, dev deck 2026-07-22); optional makes the pick skippable ("you may").
  // subtype (Arc B, 2026-08-19): "Return target Beast from your Dead Zone" — matched
  // by SET MEMBERSHIP on the card's authored `subtypes`, never by string equality
  // against the display type line (a Beast Crow IS a Beast).
  | { op: 'returnFromDead'; cardType?: string; itemKind?: string; subtype?: string; optional?: boolean; to: 'hand' | 'encounter' }
  | { op: 'search'; cardType: string }
  // board manipulation
  | { op: 'move'; target: TargetSpec; to: 'anySlot' | 'adjacent'; forced?: boolean }
  // hpAtMost (Arc H 2026-08-04, Shade Puppeteer): eligibility gate on CURRENT hp —
  // applied when the pick arms (filterEligibleByEffects) AND re-checked at
  // resolution (per-event state).
  | { op: 'bounce'; target: TargetSpec; hpAtMost?: number } // return permanent to hand
  | { op: 'extraAttack'; target: TargetSpec }               // attack an additional time
  | { op: 'forceAttack'; attackers: TargetSpec; target: TargetSpec }
  | { op: 'anchor'; delta: number; target: TargetSpec }     // Reinforce/Dismantle/Shore Up/Demolish
  | { op: 'sacrifice'; target: TargetSpec }
  // destroy (Arc A, 2026-08-19). DISTINCT FROM SACRIFICE by owner ruling: destruction
  // does NOT fire on-sacrifice listeners (Siegeworks stays silent), while generic
  // leave/death triggers fire for both. Destroyed permanents go to their OWNER's Dead
  // Zone — same destination as a sacrifice, different event. `max` caps an "up to N"
  // (Break the Siegeworks): the caster picks them one at a time and may stop early.
  // At ZERO legal targets the card FIZZLES like every other targeted Action — the card
  // is spent (owner ruling 2026-08-20, RETIRING the earlier "refuses at zero, returns
  // to hand" reading, which over-extended a precedent that governs ACTIVATED abilities).
  // INTERIM: the owner's recorded design intent is a cast-time legality gate making a
  // zero-target Action UNCASTABLE pool-wide — deferred to its own session. See
  // Game_Rules_Updated §Action Supertypes, "Targeted Actions with no legal target".
  | { op: 'destroy'; target: TargetSpec; max?: number }
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
  // ready (Arc B, 2026-08-19 — Greywind Courser). The exact inverse of `exhaust`, and
  // the same mutation extraAttack already performs: clears tap/exhaust and frees the
  // Major slot. It does NOT clear `fresh` — the entry-turn gate is a SEPARATE check
  // (stats.ts canTakeMajor / the summoning-sickness gate), so readying a companion that
  // entered this turn still cannot take a Major Action unless it has Zealous. `subtype`
  // narrows the eligible picks (see filterEligibleByEffects).
  | { op: 'ready'; target: TargetSpec; subtype?: string }
  | { op: 'exhaust'; target: TargetSpec }        // exhaust the target (Pit Trap: 'eventSubject'). Mandatory triggers
                                                 // still fire when this is a no-op (already-exhausted target — R4)
  // future (declared so authored cards validate; interpreter support added later)
  | { op: 'modal'; options: { label: string; effects: Effect[] }[] }  // Blueprint
  // gainControl (Arc I 2026-08-11, Command the Broken): REAL relocation — the
  // companion moves board-to-board for the duration (control IS board membership;
  // owner ruling 2). duration 'endOfTurn' = the turn-bound clock (reverts at the
  // caster's endTurn, BEFORE the next player's ready phase — the Arc I timing
  // finding); 'while' stays DECLARED-ONLY for a future permanent-linked
  // (Utterance-template) control shape. hpAtMost = CURRENT-hp eligibility gate
  // (the Shade Puppeteer precedent). Relocation is NOT a replay and NOT an enter:
  // no placeCard, no onEnter/Paranoia/trap windows (owner ruling 3). Ownership
  // never changes — only control; deaths route to the OWNER's zones (ruling 4,
  // via BoardEntity.stolenFrom). Store-resolved as a two-step pick-then-slot
  // action (the reposition/moveAnchor precedent), not an interpreter case.
  | { op: 'gainControl'; target: TargetSpec; duration: 'while' | 'endOfTurn'; hpAtMost?: number }
  | { op: 'suppressKeywords'; scope: TargetSpec; where?: { line?: 'front' | 'back' } }  // static aura: affected lose all keywords
  | { op: 'grantKeywords'; keywords: string[]; scope: TargetSpec; where?: { line?: 'front' | 'back' } }  // static aura: affected GAIN keywords (Bastion Wall)
  | { op: 'firstMagicUncounterable' } // (equipped) the bearer's FIRST Magic Action each turn cannot be countered (Ashforged Pendant, 2026-07-16)
  | { op: 'backLineAttack' }  // static: your back-line COMPANIONS may attack as if they had Ranged — attack eligibility ONLY, not a keyword grant (Watchtower; cards do what they say. Rationale corrected 2026-07-16: Ranged has no defensive targetability — that clause was a doc error)
  // (static) standing-restriction auras (arc 3, owner-ratified 2026-07-15). "Cannot"
  // beats "can" (R1): legality gates consult these AFTER permissions, so a restriction
  // always has the final word. Checked when the action is attempted (R2) — never
  // retroactive. Scope is the aura controller's OPPOSING companions only
  // (engine-supported scopes only; the controller's own side is never restricted).
  | { op: 'restrictAttack'; scope: 'oppCompanions'; where?: { line?: 'front' | 'back' } }  // Crystalline Sentinel
  // forcedSacrifice (owner rewording 2026-08-11, The Final Word — supersedes the
  // Arc H 'attackToll' pay-to-break gate, removed same session): a TRIGGERED
  // mandatory cost carried by a reactive clause ("whenever an opposing companion
  // attacks, they must sacrifice a permanent" — literal). The event subject's
  // CONTROLLER must sacrifice a permanent of their choice (owner agency; the
  // canBeSacrificed chokepoint — PC never offerable). No decline exists: the only
  // escape is not attacking. Mandatory triggers fire even when the payer has
  // nothing left to sacrifice (R4 — the clause no-ops loudly). Resolves in the
  // declaration window (canon: "attacks" = declaration), so a payer who
  // sacrifices the ATTACKER itself leaves a DECLARED attack that fizzles at the
  // damage step — the stock Glass Cannon precedent, no special case. Per-copy:
  // each source's trigger fires (two Final Words = two sacrifices per attack).
  | { op: 'forcedSacrifice'; chooser: 'eventSubjectController' }  // The Final Word
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
  /** Action-economy classification of an `activated` clause on a CHARACTER-hosted
   *  card (bugfix 2026-07-15): 'minor' = the activation is the character's Minor
   *  Action (45° tap, Minor budget; legal on the entry turn — the first-turn ban
   *  covers Major Actions only). Omitted = 'major' (the pre-existing engine rule:
   *  a Major Action that exhausts the activator). Card text is authoritative —
   *  Anchor Stone: "As a Minor Action, exhaust this trinket: …". Constructs are
   *  exempt from character action economy either way. */
  actionCost?: 'minor' | 'major';
}
