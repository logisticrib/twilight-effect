# THE TWILIGHT EFFECT - GAME RULES

---

## INTRODUCTION

The internet and the completeness of information that it brings has spoiled some of the most enjoyable aspects of trading card games: the surprise of opening booster packs, discovering new combinations of cards, trading without perfect information of card values, decks that are perfected through trial error, and a meta game is dynamic and naturally evolving. All these features are lost in the modern TCG environment. On top of this, consolidation in the industry and pursuit of profits means game companies pander to the lowest common denominator and put making profits ahead of devotion to the game experience, this includes: shallow world and narrative building, over-printing cards, negative print/ban cycles, and removal of long beloved mechanics due to the perception that they are unfun or too punishing for new players.

To recapture some of what has been lost, The Twilight Effect is built around the concept that every card is unique, printings of individually named cards are exactly one. The idea is that singularly unique cards eliminate many of the problems described above. Unique cards eliminate net-decking and stale metagames, make card valuation more subjective and trading more interesting, serve to recapture the experience of opening a booster pack and having no idea what awaits you, and leaves deck design in the hands of the individual user.

To achieve card uniqueness at scale The Twilight Effect utilizes some cutting-edge technologies. Including, a customed designed AI to generate unique cards within carefully deliberated parameters that are conducive to an authentic gaming experience and smart contracts and nfts to generate booster packs of unique AI generated cards on demand, with complete user ownership.

---

## GAME STYLE

The player assumes the role of a fantasy adventurer with a host of actions, companions, incantations and items available to them. A game represents an encounter which is designed to feel like a role-playing game turn-based encounter. The player is very much the leader of the group of companions and uses items, actions, and incantations also represented by the cards in their deck.

---

## GAME RULES

### CARD COMPONENTS

**All cards have:**
- Class Identity: Required class in Class Zone to play
- Level: Number of cards needed in the class zone for full functionality
- Card Type: Action, Construct, Item, or Companion
- Subtype

**Some cards have:**
- Abilities: Static (always active), Triggered (automatic responses), Activated (optional player actions)
- Attack/HP: Companion combat stats

### CARD TYPES

**COMPANIONS**

Permanent allies that have HP and Attack values. Companions can attack and activate abilities, carry items, and occupy positions in the encounter.

When a Companion leaves the encounter, all items attached to it are moved to the Dead Zone unless otherwise reassigned.

Companions are considered characters, along with the player character.

**ITEMS**

Permanents attached to characters (either a companion or the player character) when played.

**Weapons:**
- All characters: 1 weapon slot
- Grant attack capability to equipped character
- **Weapon Supertypes:**
  - One-Handed: Standard weapons, allow use of Magic Actions
  - Two-Handed: Powerful weapons that occupy both hands, prevent use of Magic Actions while equipped
- **Weapon Subtypes:** All sorts of fantasy appropriate weapons: bow, sword, axe, mace, dagger, staff, wand etc.

**Gear (Armor and Trinket subtypes):**
- All characters: 2 gear slots
- Provide additional abilities for characters
- Some heavy armor may take up both gear slots

**Armor:**

Armor is a Gear subtype that provides damage prevention through the Armor keyword.

- Light Armor: Occupies 1 gear slot, typically grants Armor 1-2
- Heavy Armor: Occupies both gear slots, typically grants Armor 3-4 or higher
- **ARMOR X:** If the equipped character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this item has X armor counters, sacrifice it.

**Rules Notes:**
- Armor prevents the entire damage from a single source, not just X damage
- Each instance of damage prevented adds 1 counter
- Armor X can prevent up to X separate attacks before being sacrificed
- Characters can equip multiple armors (following normal gear slot rules), but each armor tracks its own counters independently
- If a character has multiple pieces of armor equipped, the controlling player chooses which armor prevents the damage

Each item is always considered attached to a single character. There is no "free-floating" equipment. Items in the encounter must always reference a valid slot on a character. If they cannot, they are moved to the Dead Zone.

**Item Transfer on Character Exit:** When a character leaves the encounter with one or more items attached, the controlling player may exhaust a ready character in their party with an open slot of the appropriate type to immediately equip one of those items.
- Each character can only be exhausted once in this way per triggering event
- This ability is used separately for each item attached to the departing character
- Any items not equipped to another character through this ability are moved to the Dead Zone

**Rules Note (ruled 2026-07-08):** Item Transfer on Character Exit applies to ALL ways a character leaves the encounter — death/destruction included (as well as fleeing, bounce effects, sacrifice, and any other exit). This supersedes any earlier reading that a destroyed character's items go straight to the Dead Zone with no transfer window.

**Rules Note (2026-07-15) — Item exhaustion.** Items can be exhausted when an effect uses exhausting them as a cost. An exhausted item readies at the start of its controller's turn, with that player's characters. Exhaustion belongs to the item itself: moving an exhausted item to another character does not ready it. An item's granted static bonuses and keywords are unaffected by its exhaustion unless stated otherwise.

**Rules Note (2026-07-16) — Item activated abilities.** An item's activated ability is used during the equipped character's activation, at any point within it, and costs exhausting the item — no character action is spent and the character does not rotate. Using an item's ability opens or continues the bearer's activation like any other act of that character; once the bearer's activation has ended (another character has acted), their items' abilities are unavailable for the turn. Exhausted items ready at the start of their controller's turn. Item abilities are used only on their controller's turn.

**CONSTRUCTS**

Unlike items, constructs are not attached to characters—they occupy COMMAND ZONE slots and degrade over time.

- Constructs always enter the encounter with a number of Anchor counters, representing their connection to the field—whether through magic, tactics, or voice
- Remove one counter at the beginning of each turn; sacrifice when last removed — the sacrificed construct is placed in its owner's Dead Zone
- Anchor counters and their decay are universal: Physical, Magic, and vocal Constructs alike enter with Anchor counters and lose one at the start of each of their controller's turns, identically. Only card effects can alter decay, and only for the constructs they name.
- **Rules Note (2026-07-20):** Decay follows the COUNTERS, not the card type — a permanent that carries Anchor counters decays even if it is no longer a Construct. An animated Manifest retains its Anchor counters as its remaining lifespan and is sacrificed when the last one is removed (see §Turn Structure, Ready Phase).
- **Rules Note (ruled 2026-07-15):** There is no maximum number of Anchor counters a construct can have. Anchor-adding effects can raise a construct's counters without limit, including above its printed Anchor value.
- **Rules Note (2026-07-15) — sacrifice events and "when … is sacrificed" triggers.** Anchor decay reaching zero IS a sacrifice (existing canon above: "sacrifice when last removed") — as is any other event the rules word as sacrifice: anchor-removal effects reducing a construct to zero, sacrifice costs, a permanent sacrificing itself, and Coercion. Triggers reading "when [one of your X] is sacrificed" fire on every such event regardless of which player caused it, and never on destruction by damage or other non-sacrifice removal. A sacrificed permanent's own such trigger fires too: the event happens, the trigger queues, and it resolves even though its source has left play (per the 2026-07-12 Trigger Stack note).
- Constructs can be targeted by card effects but cannot be attacked
- Constructs occupy COMMAND ZONE slots (count toward 6-character limit per player)
- Constructs can be played directly to any empty COMMAND ZONE slot (Front or Back Line)
- Constructs do not move

**Construct Subtypes:**

*Physical Constructs*
- Used by: Builders, Rogues, Druids
- "Its tactical advantage on the field weakens with each passing moment..."
- Subtypes:
  - Trap: Reactive hazards or field triggers
  - Fortification: Static defenses and field obstructions

*Magic Constructs*
- Used by: Wizards, Sorcerers, Druids, Necromancers
- "The magic anchoring it to the field begins to fray..."
- Subtype:
  - Incantation: Bound magical effects or summoned arcane projections

*Vocal Constructs*
- Used by: Bards, Doom-Whisperers
- "The echoes fade, and with them, its influence..."
- Subtypes:
  - Chant: Repetitive rhythmic effects
  - Song: Melodic and sustained magical effects
  - Dirge: Dark, mournful incantations

**ACTIONS**

Actions are one-time effects that resolve immediately and then move to the Dead Zone.

**Action Supertypes:**
- **Physical Actions:** Combat maneuvers, tactical moves, equipment interactions
- **Magic Actions:** Spells, incantations, elemental effects

The supertype determines whether a Two-Handed weapon prevents the action from being played (Two-Handed weapons prevent Magic Actions but not Physical Actions).

### GAME ZONES

**Class Zone:**
- Determines playable classes and Willpower
- Players begin the game with 3 cards in their Class Zone
- Maximum 5 cards, minimum 1 card
- Cards flip face-down when used for Special Actions, flip back face-up at start of turn
- Once per turn, during the Class Zone Exchange phase, you may move one card between your hand and your Class Zone (see Turn Structure)
- Cards in the Class Zone may scatter after games based on game outcome (see Scattered Cards System)

**Hand:**
- Cards available to play (start with 5, draw 1/turn)
- No maximum hand size

**Deck:**
- Undrawn cards (exactly 50 cards at game start)
- When deck is empty and player must draw, player loses

**Dead Zone:**
- Destroyed, sacrificed, or used cards
- Cards in Dead Zone are face-up and public
- Can be targeted by certain effects
- When a companion flees (its Level exceeds your Willpower at the start of your turn) or a Construct's last Anchor counter is removed at the start of your turn, that card is placed in its owner's Dead Zone along with any items attached to it — exactly as if it had been destroyed. Fled and decayed cards are therefore recoverable by Dead Zone recursion effects (e.g., Memory Stone, Library of Memory) like any other card there
- **Rules Note (ruled 2026-07-08):** Sacrificing a permanent IS a death: it is destroyed, and abilities that trigger on death/destruction (Memory Stone included) fire on a sacrifice exactly as they do when a permanent dies to damage. This applies to every sacrifice — ability costs, Coercion, Dismantle and anchor loss, Manifest leave-sacrifice.

**Encounter:**
- The active play area where characters and constructs exist
- Contains the Command Zone and Character Loadouts

**Command Zone:**
- A 2x3 grid per player: 3 Front Line slots and 3 Back Line slots, for 6 slots total
- Each player's Command Zone is independent; the two grids are mirrored but spatially separate
- Holds characters (Player Character + Companions) and Constructs
- Two slots are **adjacent** if they share an edge (orthogonal only). Diagonal slots are not adjacent. A corner slot has 2 adjacent slots; a center-edge slot has 3.
- Directional language: a Front Line slot is "in front of" the Back Line slot in the same column; a Back Line slot is "behind" the Front Line slot in the same column
- Characters in the Front Line bear combat (see Targeting Rules); characters in the Back Line are protected from being targeted unless the Front Line is empty or the attacker has Evasive
  - **Rules Note (2026-07-16) — Correction, not a rules change.** An erroneous clause previously stated that a Back Line character with Ranged was a legal attack target. This was never a designed rule: RANGED's canonical text is offensive only ("This character can attack from the Back Line") and grants no targetability. The clause is removed as a documentation error. Back Line characters are legal targets only when the Front Line is empty or the attacker has Evasive.

**Character Loadouts:**
- Equipment attached to characters (weapons and gear)
- Each character has: 1 weapon slot, 2 gear slots
- Items here are not separate cards in the Command Zone

**Player Character:**
- One card drawn at random from the deck at setup, kept face-down for the duration of the game
- The card's printed identity (class, level, stats, abilities) is mechanically irrelevant and never revealed; the card serves as a marker that carries the player's HP and occupies a slot
- Starts in the Back Line on a slot of the player's choice (see Game Setup)
- Has HP (starting 20, modified by class bonuses)
- Cannot attack unless equipped with a weapon
- Follows all positioning rules (movement, targeting, line restrictions) identically to a Companion, except that effects which target a "companion" do not target the Player Character; effects which target a "character" do
- Losing the Player Character (HP reduced to 0) ends the game

### CORE MECHANICS

**Willpower:**
- Number of cards in your Class Zone
- Determines the number of Special Actions you may take per turn
- You may only play a card from your hand if your Willpower is at least the card's Level
- Spending a Special Action flips a Class Zone card face-down as a "used this turn" marker; this does NOT reduce your Willpower. The card flips back face-up at the start of your next turn.
- **Rules Note (ruled 2026-07-04):** There is exactly ONE "current Willpower": the number of cards in your Class Zone, minus 1 while you are Dismayed (never below 0). Every Willpower reference reads this single value — the play-from-hand gate (Willpower ≥ Level), the Poison check, the fleeing check, and card conditions ("if your Willpower is at least N"). An intended consequence: Dismay pressure alone can push a companion's Level above your current Willpower and cause it to flee at the start of your turn.

**Companion Fleeing:**
Companions whose Level exceeds your current Willpower flee at the start of your turn. Fleeing sends the companion to your Dead Zone.
- Fleeing is checked at the start of each of your turns, not mid-turn when Willpower changes
- Spending Special Actions does not change your Willpower, so it never causes a companion to flee. If a Class Zone Exchange lowers your Willpower below a companion's Level, that companion flees at the start of your *next* turn, not immediately
- Temporary Willpower boosts (granted by card effects) do not prevent fleeing — fleeing checks use your actual Willpower, not boosted Willpower
- The Dismayed condition reduces effective Willpower by 1 for fleeing checks, as with all other Willpower checks

**Exhaustion:**
- Cards rotate 90° when exhausted
- Exhausted characters cannot attack or use activated abilities
- Characters ready (rotate back to upright) at start of controller's turn
- **Rules Note (ruled 2026-07-08):** Performing an attack exhausts the attacking character. This is universal — the Player Character included: a PC that attacks is exhausted like any other character and cannot attack again or use activated abilities until it readies at the start of its controller's next turn.

**Health (HP):**
- Companions have the HP printed on the card; the Player Character starts at 20 HP (modified by class bonuses)
- Damage reduces current HP; at 0 HP the character is destroyed and moved to the Dead Zone
- HP can be restored, but never above the character's maximum HP
- HP does not heal automatically at the end of a turn

**Attack Eligibility:**
A character may only initiate an attack if it is in the Front Line, unless it has the Ranged keyword. A character with Ranged may initiate an attack from either the Front Line or the Back Line.

**Targeting Rules (for attacks):**
1. **Guardian:** If the opponent has any Guardian characters that are ready and a legal target for the attacking character, the attacker must target such a Guardian first
   - **Rules Note (2026-07-15) — Guardian requires target legality.** Guardian obligates attackers only while the Guardian is ready AND a legal target for the attacking character under the targeting rules (Front Line priority, Evasive). A Guardian that a given attacker cannot legally target imposes no restriction on that attacker. This has always been the keyword's printed text ("While this character is ready (not exhausted) and a legal target, opponents must attack it before any other character"); this summary line previously omitted the legal-target clause and was corrected on this date — the summary was in error, not the keyword. (Amended 2026-07-16: the legality list previously also named defender-side Ranged — removed as a documentation error; see the Rules Note under Front Line priority below.)
2. **Front Line priority:** Among non-Guardian targets, the attacker must target a Front Line character if any exist; Back Line characters can only be targeted if the Front Line is empty or the attacker has Evasive
   - **Rules Note (2026-07-16) — Correction, not a rules change.** An erroneous clause previously stated that a Back Line character with Ranged was a legal attack target. This was never a designed rule: RANGED's canonical text is offensive only ("This character can attack from the Back Line") and grants no targetability. The clause is removed as a documentation error. Back Line characters are legal targets only when the Front Line is empty or the attacker has Evasive.
3. **Player Choice:** Among legal targets, the attacking player chooses the specific target

Targeting rules apply only to characters (Player Character and Companions). Constructs cannot be attacked and do not satisfy or interfere with Front Line priority.

- **Rules Note (2026-07-12) — Attack declaration and damage are separate steps.** Damage does not go on the stack at attack declaration. Triggers with a declaration window ("when/whenever [a character] attacks") resolve during the attack step, before damage is ever queued. If the attacker is dead when the attack step would proceed to damage, damage is never queued — the attack fizzles entirely.

**Special Actions:**
- Used to play Companions and Constructs from hand
- Cost: Flip one face-up Class Zone card face-down
- Flipped cards return face-up at start of your next turn

**First-Turn Handicap & Entry Restrictions:**

*Player going first — Turn 1:*
The player who goes first does not draw a card on their first turn. This offsets the advantage of moving first. The first player may otherwise act normally on Turn 1 — there is no restriction on Major Actions. (The second player draws normally on their first turn, and all players draw on every turn thereafter.)

*Companions — willpower check on entry:*
A companion that has just entered the encounter must pass a willpower check before it can take Major Actions. The check is automatically considered passed at the start of its controller's next turn (alongside the existing willpower check that determines whether the companion flees). In practice this means a companion cannot attack or use activated Major Action abilities on the turn it arrives — only Movement, Minor Actions, and Special Actions are available that turn. This restriction applies to all companions at all times, not just Turn 1 of the game.

- **Rules Note (2026-07-15) — Type-changing effects are not "entering the encounter."** A permanent converted in place (e.g. a construct animated into a companion) does not enter the encounter; its entry time is unchanged. The entry willpower check for such a companion is therefore already satisfied if the permanent was in the encounter at the start of its controller's current turn, and applies as normal if the permanent entered this turn.

The Zealous keyword bypasses this check for attacks specifically; a companion with Zealous may attack on the turn it enters the encounter, but is still gated for non-attack Major Actions until the check passes.

**Inactive Player Restrictions:**
The inactive player does not play cards from hand or activate abilities during the active player's turn. Triggered abilities on the inactive player's existing permanents may still fire and resolve in response to active player actions, and the inactive player makes any choices those triggers require (e.g., Coercion's discard-or-sacrifice prompt, Paranoia's top-or-bottom decision). This is a hard line — anything new entering play, anything requiring activation, or anything otherwise initiated by the inactive player must wait for their own turn.

**Triggered Abilities & The Trigger Stack:**
Existing canon (Card_Design_Parameters §13, quoted verbatim): "**Use a stack** - multiple triggers resolve in order (most recent first)"; (§21, quoted verbatim): "**Resolve most recent first** (last in, first out)", "Your trigger can cause opponent's trigger, which resolves first", ""May" choices made when trigger resolves (no holding)". The Rules Notes below are the owner-ratified operational model (2026-07-12/13).

- **Rules Note (2026-07-12) — The Trigger Stack.** Playing a card puts it on the stack; it does not enter the encounter until the stack empties down to it. "Plays" and "enters" are distinct, sequential events — a trigger on "plays a [card type]" queues above the played card itself and therefore resolves before that card enters. Triggers queue onto the stack in the order they occur and resolve last-in-first-out. Once a trigger is queued, it resolves even if its source or its subject has since left play (a reactive trigger's effect killing the entering character does not stop that character's already-queued on-enter effect from resolving). Simultaneous triggers are placed on the stack in an order chosen by the active player, regardless of who controls them (reaffirming existing canon).
- **Rules Note (2026-07-12) — Mandatory triggers.** A triggered ability without "may" is mandatory and fires whenever its trigger condition is met, regardless of whether its effects would do anything. All of its effects and costs still occur, including any self-sacrifice, even when the primary effect is a no-op. (The universal pre-cost refusal rule applies to activated abilities only, not to mandatory triggers.)
- **Rules Note (2026-07-13) — Identical simultaneous triggers.** The active player orders simultaneous triggers even when they are identical copies whose order cannot matter. There is no auto-ordering exception.
- **Rules Note (2026-07-15) — "Play" means from hand, universally.** "Playing" a card means playing it from hand. Effects triggered by a player "playing" a card do not trigger on placements, conversions, or cards entering play by any other route (e.g. an effect converting a card in play into a companion or construct is not "playing" one). This generalizes the 2026-07-04 Paranoia-specific ruling into the game-wide definition; the Paranoia note in Master_Keyword_List cross-references it.
- **Rules Note (2026-07-13) — "Moves into" a line or zone.** "Moves into [the front line / the back line / a zone]" means arriving there by movement from outside it. Entering the encounter directly onto that line is not a move and does not meet the condition; nor does lateral repositioning between slots within the same line.
- There are no player priority windows: nothing in the game allows casting in response. All reactions are automatic triggers; player decisions inside them (Paranoia's top/bottom, the active player's ordering of simultaneous triggers, "may" choices) are made when the trigger resolves.

**Damage Prevention:**
Prevention is one family of effects: anything that intervenes when a character "would take" or "would be dealt" damage. Armor is its longest-standing member (existing canon, quoted verbatim: "If the equipped character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this item has X armor counters, sacrifice it."); board-sourced "prevent N of that damage" effects are members of the same family. The Rules Notes below are the owner-ratified operational model (2026-07-14).

- **Rules Note (2026-07-14) — Deal-side modifiers apply before receipt-side prevention.** Effects that modify the damage a source DEALS (e.g. a doubling worded "this deals double damage") are applied first, forming the dealt amount. Prevention effects then apply to that formed amount. Ruled example: a doubled 2-damage hit (→ 4) against a character covered by a prevent-1 effect resolves as 4 − 1 = 3, not (2 − 1) × 2 = 2.
- **Rules Note (2026-07-14) — Fully prevented damage is no damage.** If prevention reduces a damage instance to 0, the character takes no damage at all: no Poison is applied, and no "when damaged"-style triggers fire. (This states as a rule for ALL prevention what has always been true of an armor-blocked hit.)
- **Rules Note (2026-07-14) — The affected character's controller orders prevention effects.** When more than one prevention effect could apply to the same damage instance, the affected character's controller chooses the order in which they apply. (This extends the existing armor rule — the controlling player chooses which armor prevents the damage — to the whole prevention family.) Canonical consequence: a 1-damage hit on an armored character also covered by a prevent-1 effect — the controller may apply the prevent-1 first (the damage reaches 0, armor never engages, no counter is spent) or the armor first (the whole hit is prevented and the counter is added).
- **Scope and application (2026-07-14):**
  - An ongoing prevention effect applies to EVERY qualifying damage instance while its source stands — each hit separately, including each splash hit of a Cleave against a different covered character.
  - Duplicate prevention effects stack (two prevent-1 sources prevent 2 in total, ordered with any other preventions per the Rules Note above).
  - Prevention applies to all damage the covered character would take — combat and effect damage alike, including reactive-trigger damage and a character's own Reckless recoil (re-ruled 2026-07-14; supersedes the earlier engine reading that the recoil bypassed armor).
  - Scope is exactly what the card names: an effect covering a class of companions you control never covers the Player Character, companions outside that class, opposing characters, or the player. (Poison-failure damage is dealt to the PLAYER and is therefore never covered by companion-scoped prevention.)

**Standing Restrictions ("cannot" effects):**
Some permanents project a standing restriction — an ongoing "cannot [act]" over a stated group (e.g. "opposing back-line companions cannot attack", "opposing companions cannot move between front and back lines"). The Rules Notes below are the owner-ratified operational model (2026-07-15).

- **Rules Note (2026-07-15) — "Cannot" beats "can".** When a restriction ("cannot") and a permission ("can") apply to the same action, the restriction wins. A keyword or aura permitting attacks from the back line does not override an effect stating back-line companions cannot attack — the companion cannot attack.
- **Rules Note (2026-07-15) — Restrictions are checked when the action is attempted.** A standing restriction gates the action at the moment it would be taken: attack restrictions apply at attack declaration (consistent with the 2026-07-12 declaration/damage separation); movement restrictions apply when the move would begin. Restrictions are not retroactive — an already-declared legal attack is not undone by conditions changing mid-resolution.
- **Rules Note (2026-07-15) — Movement restrictions cover ALL movement.** "Cannot move between [lines/zones]" stops every form of movement between them — chosen move actions and effect-driven (forced) movement alike.
- **Scope (2026-07-15):**
  - Entering the encounter is not movement (per the 2026-07-13 "moves into" note): a companion may enter directly onto either line regardless of movement restrictions, and lateral repositioning within one line is not "between" lines and is unrestricted by such wording.
  - "Opposing" is always from the aura controller's perspective; the controller's own companions are never restricted by their own aura.
  - A restriction aura lives and dies with its source: when the permanent leaves (Anchor decay, Dismantle, destruction, sacrifice), the restriction ends immediately and previously-restricted actions become legal again.

### POSITIONING & MOVEMENT

**Geometry recap.** Each player controls a 2x3 grid (3 Front Line, 3 Back Line) called the Command Zone. The two players' grids are mirrored but spatially independent — adjacency does not cross between them.

**Adjacency.** Two slots are adjacent if they share an edge. This is orthogonal only: a slot's adjacent slots are the slot directly in front of or behind it (same column, other line) and the slots immediately to its left or right (same line, adjacent column). Diagonal slots are not adjacent.

**Entering play.** When a Companion or Construct enters play from hand:
- The active player chooses which legal slot the character or construct enters
- Companions enter on the Back Line
- Constructs may enter on any empty slot (Front or Back Line)
- If no legal slot is available (the relevant line is full for a Companion, or all 6 slots are occupied for a Construct), the play is illegal and the card stays in hand

**Voluntary movement.** A character may use a Movement action during their activation. Movement must be the first action taken in an activation if it is taken at all; once a character has used a Minor or Major action this turn, they may not move. Movement consists of moving the character to an adjacent slot. The destination slot must be empty. If no adjacent empty slot exists, the character cannot use Movement that activation.

Movement does not exhaust the character and does not produce a visible state change on the card. Because each character's activation is resolved as a unit (Move, then Minor, then Major) before any other character is activated, no separate tracking of "has moved this turn" is needed.

**Forced movement.** Some card effects move characters without that character spending a Movement action. Forced movement does not consume the affected character's voluntary Movement budget unless the card text explicitly states otherwise. The destination of a forced movement may or may not need to be adjacent to the character's current slot, depending on the card text. The destination must always be a legal (empty) slot; if no legal slot exists, the forced movement fizzles. Other constraints — refusal options, target restrictions, additional effects — are governed by the specific card text.

**Constructs do not move.** Once placed, a Construct remains in its slot until it is sacrificed or removed. No effect can move a Construct unless the effect explicitly targets and moves Constructs.

**Static effects and movement.** Position-dependent buffs, debuffs, and abilities apply continuously based on a character's current position. When a character moves into or out of a position that satisfies a static effect's condition, the effect applies or drops immediately. If a static effect is increasing a character's max HP and the effect drops, and the character has taken damage exceeding their new max HP, the character is removed from play (state-based).

**Attacking and movement together.** Because Movement comes first in activation, a character may move and then attack on the same turn. Under the Front Line attack-eligibility rule, this means a Back Line character without Ranged can move to the Front Line and then attack on the same activation — provided an adjacent empty Front Line slot exists.

**Items follow their character.** Items have no independent slot. They move with the character to which they are equipped. Cards may reference items by the position of their equipped character (e.g., "destroy all items equipped to characters in your opponent's Front Line").

### TURN STRUCTURE

**1. Ready Phase**
   - Ready all exhausted permanents you control
   - Flip all face-down Class Zone cards face-up
   - "At the start of your turn" triggered abilities fire *(position dated 2026-07-20 — see the Rules Note below)*
   - Remove one Anchor counter from each permanent that has Anchor counters (a permanent whose last Anchor counter is removed is sacrificed and placed in its owner's Dead Zone); companions whose Level exceeds your current Willpower flee
   - **Rules Note (2026-07-20) — Decay keys on Anchor counters, not card type.** The Ready Phase removal applies to every permanent carrying Anchor counters. In particular, an animated Manifest retains its Anchor counters and continues to decay; when its last counter is removed it is sacrificed (consistent with its own leave-as-sacrifice rule). Previously the step named Constructs only, which wrongly exempted Manifests.
   - **Rules Note (2026-07-20) — Start-of-turn abilities fire before Ready Phase removals.** "At the start of your turn" triggered abilities of permanents in the encounter fire before Anchor decay is applied and before Willpower flee checks remove companions. A construct losing its last Anchor counter this turn still fires its start-of-turn ability first; a companion that will flee this turn fires its start-of-turn ability before fleeing. Prompt ordering within the Ready Phase otherwise follows the canonical step order (see the 2026-07-08 note: Poison before Item Transfer windows).
   - **Rules Note (ruled 2026-07-08):** When multiple start-of-turn prompts arise, they resolve in canonical Ready Phase step order. In particular, the Poison keyword check resolves BEFORE any Item Transfer on Character Exit windows opened by ready-phase exits (a fleeing companion's items; decayed Constructs carry no items, so no window opens for them). *(Amended 2026-07-20: a decayed MANIFEST is a companion and can carry items — its decay sacrifice opens a transfer window like any other character exit.)*

**2. Draw Phase**
   - Draw one card (exception: the player going first skips their Turn-1 draw as the first-player handicap)

**3. Class Zone Exchange** *(optional, once per turn)*
   - You may move one card from your hand to your Class Zone, **or** move one card from your Class Zone to your hand — not both.
   - Moving a card **into** the Class Zone: place it face-up. Your Willpower updates immediately. The no-empty-Class-Zone rule applies — you cannot move the last card out.
   - Moving a card **out of** the Class Zone: if any companions in play have a Level that now exceeds your new Willpower, they will flee at the start of your next turn (not immediately).
   - This exchange is a player action, not a Special Action — it does not flip a Class Zone card face-down and does not cost Willpower.
   - You may not exchange a Class Zone card that is currently face-down (already spent this turn).

**4. Action Phase** (repeatable actions in any order)
   - **Movement Actions** (once per character): Move character to an adjacent empty slot in the Command Zone (see Positioning & Movement)
   - **Minor Actions** (once per character): Equip/unequip items, rotate card 45 degrees
   - **Major Actions** (once per character): Attack or activate ability, rotate card 90 degrees
   - **Special Actions** (based on Willpower): Play Companions/Constructs from hand by flipping Class Zone card face-down
   - **Play Actions**: Play Action cards from hand (require appropriate classes in Class Zone)

**5. Character Activation** (Strategic, not required)
   - Choose a character to activate
   - Perform available actions for that character (Move, then Minor, then Major)
   - Continue until all desired characters have activated

**6. End Phase**
   - Resolve "at end of turn" triggers
   - Temporary effects expire

### WIN CONDITIONS

- Reduce opponent's Player Character to 0 HP
- Opponent must draw a card but has no cards left in their deck

### DECK CONSTRUCTION

- The only formal deck building restriction is that your deck must contain exactly 50 cards.

**Guidelines for effective deck building:**
- Stick to 1-2 classes unless you have strong class access tools
- Include a variety of card types—Actions, Companions, Items, and Constructs—to respond to different threats
- Be aware of Willpower thresholds when including high-level cards
- Remember: Cards in your Class Zone may scatter after games—don't treat them as disposable
- Expect your deck to evolve—winning or losing temporarily scatters cards from your collection

### SCATTERED CARDS SYSTEM

After each game, cards from the Class Zone temporarily scatter based on the outcome. This creates meaningful consequences while allowing all cards to eventually return to your collection.

**DIGITAL PLAY:**
- **Winner:** Choose 1 card from your Class Zone to scatter (your choice)
- **Loser:** All remaining cards in your Class Zone scatter
- Scattered cards are unavailable for 36 hours, then automatically return to your active collection
- During the 36-hour period, scattered cards cannot be used in deck construction or trades

**PAPER/TOURNAMENT PLAY:**
- **Winner:** Set aside 1 card from your Class Zone (your choice)
- **Loser:** Set aside all remaining cards from your Class Zone
- Scattered cards remain unavailable for the duration of your match with the current opponent
- When your match with the opponent concludes (best-of-3, etc.), all scattered cards return
- Between games in a match, replace scattered cards from your sideboard

**SIDEBOARD SYSTEM (Match-format play, paper or digital):**
- Bring a sideboard of exactly 15 cards
- Sideboard composition is the deckbuilder's choice — cards may share classes with the main deck or not. Off-class cards may be useful given certain in-game effects, but rely on the player having class access to use them
- When cards scatter between games in a match, replace them from the sideboard before the next game
- Sideboard cards function identically to main deck cards during games
- At match end, return sideboard cards and restore your original 50-card deck
- Practice and quick games operate without sideboards

**IMPORTANT RULE:**
No effect or action can cause the final card in the Class Zone to be removed. Any effect that would do so is not legal.

### GAME SETUP

1. Randomly determine which player chooses to go first or second (in multi-game matches, loser of previous game gets this choice)
2. Both players randomize decks
3. Each player draws the top card of their deck and sets it aside face-down without looking at it. This card represents their Player Character for the duration of the game (see Player Character).
4. Each player places the next 3 cards from their deck in their Class Zone face-up
5. Each player draws 5 cards
6. Mulligan opportunity (both Class Zone and Hand together)
   - If you mulligan, return all Class Zone cards and your hand to your deck and return to step 4 (the Player Character set aside in step 3 is not returned and is not redrawn)
   - Each mulligan has an escalating cost: bottom 1 card on the first mulligan, 2 cards on the second, 3 on the third, and so on
   - Cannot mulligan if you would have to bottom more cards than you have in hand after the redeal
7. Apply Class Bonuses in turn order
8. Place Player Character on the Command Zone in turn order. Each player places their face-down Player Character on a Back Line slot of their choice. The first player places first; the second player then places, with knowledge of the first player's choice. The slot is publicly visible, but the card's identity remains hidden from both players for the duration of the game.

### CLASS BONUSES

Once you have determined the starting hand and Class Zone for each player, a bonus action is applied for each class represented in your Class Zone.

Class bonuses are applied in turn order. The player who will take the first turn applies all their bonuses in any order they choose, then the second player does the same.

⚔️ **Warrior**—"Gear Up!" You may choose a card from your hand. If you do, reveal it and swap it for a Weapon card in your Class Zone.

🔥 **Sorcerer**—"Elemental Fury" You may reduce your opponent's starting HP by 2.

📚 **Wizard**—"Knowledge is Power" You may look at the top 2 cards of your deck. If you do, put any number of them on the bottom of your deck and the rest on top in any order.
☠️ **Necromancer**—"Grave Intent" You may put the top 3 cards of your deck into your Dead Zone.

✨ **Paladin**—"Divine Favor" You may add 5 HP to your starting health.

🌿 **Druid**—"Call the Wild" You may choose a card from your hand. If you do, reveal it and swap it for a Companion card in your Class Zone.

🎵 **Bard**—"Encore!" You may shuffle one card from your hand into your deck. If you do, draw a card.

🗡️ **Rogue**—"Sleight of Hand" You may look at your Player Character card. If you do, you may swap that card with a card from your Class Zone.

🕯️ **Doom-Whisperer**—"Seeds of Despair" You may look at the top 2 cards of your opponent's deck. If you do, put any number of them on the bottom of their deck and the rest on top.

🧱 **Builder**—"Lay the Foundation" You may choose a card from your hand. If you do, reveal it and swap it for a Construct card in your Class Zone.

---

## EVERGREEN KEYWORDS

**RANGED** - This character can attack from the Back Line. *Common:* Archer companions, ranged weapons, magical attacks like fireballs.

**CLEAVE** - When this character attacks, it deals damage equal to its attack to each character on the same line as the target. This is exclusive to two-handed weapons.

**EVASIVE** - This character can target any opponent character regardless of positioning. Still subject to Guardian targeting requirement. *Common:* Rogue. *Occasional:* Druid, Doom-Whisperer.

**HIT & RUN** - After this character attacks, it may take an extra move action. Common on Rogues and some stealthy, agile animal companions.

**Rules Note (ruled 2026-07-08):** The extra move is optional (declining has no cost) and is an explicit exception to the movement-must-be-first rule — it is taken after the attack. Exhaustion does not prevent it: exhaustion blocks attacks and activated abilities, not movement.

**GUARDIAN** - While this character is ready (not exhausted), opponents must attack it before any other character. Targeting restriction. *Common:* Paladin. *Occasional:* Druid, Builder

**SCAVENGER** - When this companion enters the encounter, you may return an item from your Dead Zone and immediately attach it to this companion. *Common:* Rogue. *Occasional:* Necromancer

**TRIBUTE** - As an additional cost to play this Angel companion, pay its Tribute cost. Angel (Paladin) Companion Exclusive

**KIT-MASTER** - When this companion enters the encounter, you may move target item from one character to another. *Common:* Warrior. *Occasional:* Paladin

**RECKLESS** - When this character attacks, it deals 1 damage to itself. *Common:* Sorcerer, Warrior. (Rules Note, re-ruled 2026-07-14: the recoil is damage the character takes — the damage-prevention family, armor included, applies to it. See §Core Mechanics, Damage Prevention.)

**ARMOR X** - If the equipped character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this item has X armor counters, sacrifice it. Common on Light Armor (Armor 1-2). Heavy Armor typically has Armor 3-4 or higher

**ARMOR X (companion variant)** - If this character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this companion has X armor counters, it no longer prevents damage via this ability.

---

## SET-SPECIFIC KEYWORDS

### ASHGLOW MARCH

**[TYPE'S] BANE** - This deals double damage to [type] creatures.

**Examples:**
- Goblin's Bane: Deals double damage to Goblin creatures
- Undead's Bane: Deals double damage to Undead creatures
- Blight's Bane: Deals double damage to Blighted creatures

### VERDANT PACT

**OATHSWORN** - As this permanent enters the encounter, place a card from your hand face-down beneath it. If you can't, sacrifice this permanent. When this permanent leaves the encounter, return the sworn card to your hand.

*Primary Classes:* Paladin, Druid  
*Occasional Classes:* Other classes as thematically appropriate

**Rules Notes:**
- The sworn card remains face-down and hidden from opponents
- If multiple cards would be sworn simultaneously, the controller chooses the order
- Sworn cards count as being "in the encounter" for effects that count sworn cards
- If a permanent with Oathsworn changes zones in some other way (such as being returned to hand), the sworn card is returned to its owner's hand.

**Design Philosophy:** Oathsworn represents the sacred commitments and spiritual sacrifices central to the Verdant Pact. Players must commit resources to unlock greater power, creating strategic tension between hand advantage and battlefield presence. The mechanic encourages deck building around oath density.

**Thematic Connection:** Most commonly found on cards representing the spiritual traditions of the Hightrail Spires, the political agreements of Stonefern Hollow, and the druidic bonds of the forest communities. The temporary sacrifice of hand resources reflects the idea that meaningful oaths require genuine commitment and risk.
