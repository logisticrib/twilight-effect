# CARD DESIGN PARAMETERS
## Machine-Readable Constraints for AI Card Generation

---

## 1. RESOURCE SYSTEM & COSTS

### Willpower
- **Definition:** Willpower = number of cards in Class Zone (range: 1-5)
- **No mana costs:** Cards do NOT have resource costs to play
- **Only restrictions:** Action economy and Level requirements

### Card Level
- **Range:** 1-5
- **Requirement:** Must have Willpower â‰¥ card's Level to play from hand
- **Fleeing:** Companions with Level > Willpower flee at start of turn

### Temporary Willpower Boosts
- **Allowed but rare**
- **Template:** "Until end of turn, you may play cards as though your Willpower were X higher"
- **Does NOT grant additional Special Actions**
- **Does NOT affect fleeing (companions still check actual Willpower)**

### Willpower Reduction (Dismayed)
**When a player is Dismayed:**
- Their effective Willpower is reduced by 1 for all purposes
- This affects:
  - Maximum level of cards they can play from hand (reduced by 1)
  - Number of Special Actions available (reduced by 1)
  - Companion fleeing checks: Companions with level > current Willpower flee at start of turn
- Does NOT stack: Multiple Dismayed effects do not reduce Willpower further
- Can apply to players OR individual companions (check card text for target)

**Example:** Player has 3 cards in Class Zone (Willpower 3). If Dismayed:
- Effective Willpower becomes 2
- Can only play Level 1-2 cards from hand
- Only 2 Special Actions available per turn
- Level 3+ companions will flee at start of next turn

**Critical Edge Case:** If Dismayed would reduce player's Willpower to 0 (only 1 card in Class Zone), player cannot play any cards from hand or take Special Actions, and all companions flee at start of turn.

---

## 2. PLAYING CARDS FROM HAND

### Items (Equipment)
- **Action Type:** Minor Action
- **Who can play:** Any character can equip an item from hand to themselves
- **No Special Action required**

### Major Action Cards
- **Action Type:** Major Action
- **Who can play:** Any character can use from hand during their activation
- **Subtypes:** Physical or Magic

### Special Action Cards
- **Action Type:** Special Action (Player Character only)
- **Cost:** Flips one Class Zone card face-down
- **Who can play:** Player Character only
- **Subtypes:** Physical or Magic

### Companions
- **Action Type:** Special Action (Player Character only)
- **Cost:** Flips one Class Zone card face-down
- **Entry:** Always enter on the Back Line. The active player chooses which empty Back Line slot the Companion enters. If no empty Back Line slot exists, the play is illegal and the Companion stays in hand.
- **Entry-turn willpower check:** Companions must pass a willpower check before taking Major Actions. The check resolves automatically at the start of their controller's next turn. While the check is unresolved (i.e., on the turn they enter), companions can use Movement/Minor Actions/Special Actions, but NOT Major Actions. The Zealous keyword bypasses this check for attacks specifically.

### Constructs
- **Action Type:** Special Action (Player Character only)
- **Cost:** Flips one Class Zone card face-down
- **Entry:** Played directly to any empty Command Zone slot (Front or Back Line). The active player chooses the slot. If no empty slot exists in the Command Zone, the play is illegal and the Construct stays in hand.
- **Anchor counters:** All constructs enter with Anchor counters (amount specified on card)
- **Degradation:** Remove 1 Anchor counter at start of each turn; sacrifice when last removed

---

## 3. CARD RARITY SYSTEM

### Rarity Tiers
1. **Common** - Simple effects, lower power
2. **Uncommon** - Moderate complexity and power
3. **Rare** - Complex effects, higher power
4. **Legendary** - Highest power/complexity, predetermined story characters

### Legendary Special Rules
- **Supertype:** Cards show "Legendary" supertype
- **Character pool:** Predetermined named story characters (mostly companions)
- **Print run:** Set ends when all legendary slots are filled
- **Generation:** Still procedurally generated but influenced by character's story role
- **No gameplay restrictions:** Can control multiple legendaries (unlike some TCGs)

### Level & Rarity Relationship
- **Independent axes:** Level and Rarity are separate dimensions
- **Examples:**
  - Level 1 Common: Simple, low power
  - Level 1 Rare: Simple but strong, or complex/unique
  - Level 5 Common: High requirement but straightforward
  - Level 5 Rare: High requirement, complex, powerful

---

## 4. TARGETING VOCABULARY

### Character Targeting
- **"Target character"** - Any character in play (yours or opponent's)
- **"Target opposing character"** - Opponent's characters only
- **"Target character in your party"** - Your PC or companions
- **"Another target character"** - Excludes the character playing/triggering the effect
- **"Target player"** - The opponent specifically (not their characters)

### Permanent Targeting
- **"Target permanent"** - Any companion, construct, or item
- **"Target companion"** - Only companions
- **"Target construct"** - Only constructs
- **"Target item"** - Only items (weapons, armor, trinkets)

### Positional Targeting

The Command Zone is a 2x3 grid (3 Front Line, 3 Back Line) per player; each player's grid is independent and does not share adjacency with the opponent's. Two slots are adjacent if they share an edge — orthogonal only, no diagonals.

- **"Adjacent slot"** — A slot that shares an edge with this slot (orthogonal only). A corner slot has 2 adjacent slots; a center-edge slot has 3. May be empty or occupied.
- **"Adjacent character"** — A character occupying an adjacent slot. Empty slots are not skipped over; "adjacent" means literally one slot away.
- **"In front of [this character]"** — The character occupying the Front Line slot in the same column, on the same player's grid. Only meaningful if this character is in the Back Line.
- **"Behind [this character]"** — The character occupying the Back Line slot in the same column, on the same player's grid. Only meaningful if this character is in the Front Line.
- **"Target Front Line character"** — Any character in the Front Line position
- **"Target Back Line character"** — Any character in the Back Line position
- **"Character on the same line as..."** — Any character sharing the same row (Front or Back) on the same player's grid. Each player's Front Line is its own line; opposing Front Lines are not "the same line."
- **"Each character in the Front Line"** — Without further specification, this means in the Front Line of the player whose effect is being templated. Use "your Front Line" or "your opponent's Front Line" for clarity when intent matters.

### Constructs and positional vocabulary

Constructs occupy slots and participate in slot adjacency, but they are not characters and are not affected by character-specific positional vocabulary.
- "Adjacent character" does not target a Construct in an adjacent slot
- "Adjacent permanent" or "adjacent slot" does include Constructs and the slots they occupy
- Constructs do not block, redirect, or satisfy combat-targeting priority (they cannot be attacked at all)

### Items and positional vocabulary

Items have no independent slot. They move with their equipped character. Cards may reference items by the position of their host: "destroy all items equipped to characters in your opponent's Front Line."

### Positioning Rules for Effects
- **Card effects can target anywhere** unless restricted by card text
- **BUT should respect flavor logic:**
  - Melee strikes: "Target adjacent character" or "Target Front Line character"
  - Ranged attacks/spells: May ignore positioning or have range limits
  - Healing/buffs: Often ignore positioning
  - Physical effects: Should consider battlefield layout
- **Attacks follow strict targeting rules** (see Combat section)

---

## 5. DAMAGE & REMOVAL

### Damage
- **Template:** "Deal X damage to target character"
- **Interacts with:** HP, Armor keyword, damage prevention effects
- **Cannot exceed maximum HP when healing**

### Destroy
- **Template:** "Destroy target [permanent type]"
- **Bypasses HP entirely** - straight removal
- **Can be prevented** by specific protection effects (no "Indestructible" keyword exists)
- **Should be rare/expensive** since it ignores defenses

### Sacrifice
- **Template:** "Sacrifice a [permanent type]"
- **Controller chooses** which of their permanents
- **Common uses:** Costs for effects, triggered choices
- **Cannot be prevented** by targeting protection

### Death vs Destruction vs Leaving
Three distinct trigger conditions:
- **"When this dies"** - Reduced to 0 HP specifically
- **"When this is destroyed"** - Specifically destroy effects (bypasses HP)
- **"When this leaves the encounter"** - Any removal (catch-all)

---

## 6. ZONE MOVEMENT & CARD FLOW

### Discard
- **Template:** "Discard X cards" - from hand to Dead Zone
- **Forced discard:** "Target player discards X cards" (they choose which)
- **Random discard:** "Target player discards X cards at random"

### Mill
- **Template:** "Mill X cards" - top X from deck to Dead Zone
- **Opponent mill:** "Target player mills X cards"

### Draw
- **Template:** "Draw X cards"
- **Multiple draws allowed:** "Draw 3 cards" is legal
- **Deck-out rule:** If you must draw with insufficient cards, draw what you can then lose
- **Empty deck rule:** If deck is already empty when you must draw, lose immediately

### Dead Zone Recursion
- **Return to hand:** "Return target [card type] from your Dead Zone to your hand"
- **Return to encounter:** "Return target [card type] from your Dead Zone to the encounter"
- **Either Dead Zone:** "Return target [card type] from a Dead Zone to your hand"
- **To deck:** "Put target card from your Dead Zone on top/bottom of your deck"
- **Class Zone:** EXCLUDED for now (too powerful/complex)

### Deck Manipulation
- **Search:** "Search your deck for a [card type], reveal it, and put it into your hand. Then shuffle"
- **Look and arrange:** "Look at the top X cards of your deck. Put them back in any order"
- **Shuffle:** "Shuffle your deck"
- **Top/bottom placement:** "Put this card on the top/bottom of your deck"

---

## 7. EXCLUDED MECHANICS (DO NOT GENERATE)

### Not Available in Current Design
- âŒ **Exile/Banish zone** - Dead Zone is only discard pile
- âŒ **Token generation** - All cards must be from deck/hand
- âŒ **Copying cards** - No creating copies of existing cards
- âŒ **Transformation** - Cards keep their identity (temporary stat changes OK)
- âŒ **Double-faced cards** - No flip cards
- âŒ **Returning to Class Zone** - Excluded for now
- âŒ **Counter types beyond Armor and Anchor** - Need approval for new types
- âŒ **"Indestructible" keyword** - Use triggered protection instead

---

## 8. HEALTH POINT (HP) SYSTEM

### HP Model
- **Maximum HP:** Printed value on card (fixed)
- **Current HP:** Starts at maximum, tracks damage taken
- **Death:** When current HP reaches 0

### Damage
- **Template:** "Deal X damage to target character"
- **Effect:** Reduces current HP by X
- **Current HP cannot go below 0**

### Healing
- **Template:** "[Target] heals X"
- **Examples:**
  - "Target character heals 2"
  - "Each character in your party heals 3"
  - "This character heals 1"
- **Effect:** Increases current HP by X
- **Cannot exceed printed maximum HP**
- **HP does not heal automatically at end of turn**

### No Temporary HP or Maximum Changes
- âŒ Do NOT use: "This character gets +X HP until end of turn"
- âŒ Do NOT use: "This character's maximum HP becomes X"
- âœ… Maximum HP is FIXED at printed value
- âœ… Only current HP changes through damage/healing

---

## 9. ATTACK VALUE SYSTEM

### Attack Modifications (All Valid)
- **Additive:** "This character gets +X attack until end of turn"
- **Set value:** "This character's attack becomes X until end of turn"
- **Multiplicative:** "Double this character's attack until end of turn"

### Attack Capability Rules
- **Player Character:** MUST have a weapon equipped to attack
- **Companions:** Have printed attack values, can attack without weapons
- **Weapons on companions:** Can grant attack bonus OR abilities OR both

### Weapon Templates
**Attack bonus weapons:**
- "+X attack" (adds to companion's value, gives PC attack capability)

**Ability weapons:**
- "Exhaust this character: Deal 3 damage to target character" (no attack bonus)
- Player Character with ability-only weapon CANNOT make normal attacks

**Hybrid weapons:**
- "+1 attack" AND "Exhaust this character: Draw a card"

---

## 10. EQUIPMENT SYSTEM

### Weapon Slots
- **All characters:** 1 weapon slot
- **Supertypes:**
  - **One-Handed:** Standard weapons
  - **Two-Handed:** Powerful weapons, prevent use of Magic Actions (inherent rule)
- **Subtypes:** Bow, Sword, Axe, Mace, Dagger, Staff, Wand, etc.

### Two-Handed Restriction
- **Inherent property** of all Two-Handed weapons
- **Prevents using ANY Action card with Magic subtype** (Major or Special)
- **Does NOT restrict activated abilities** (even if magical in flavor)
- **Reminder text (when space permits):** *(Equipped character cannot use Magic Actions)*

### Gear Slots
- **All characters:** 2 gear slots
- **Subtypes:**
  - **Light Armor:** 1 slot, grants Armor 1-2
  - **Heavy Armor:** 2 slots (inherent rule), grants Armor 3-4+
  - **Trinket:** 1 slot, various abilities (no Armor keyword), handheld items (rings, potions, amulets)

### Item Attachment Rules
- **All items must be attached to a character** - no free-floating equipment
- **Items move to Dead Zone** if they can't reference a valid slot
- **Item transfer on character exit:**
  - When character leaves with items attached, controller may exhaust a ready character with open slot to equip one item
  - Each character can only be exhausted once per triggering event
  - Ability used separately for each attached item
  - Items not equipped this way go to Dead Zone

---

## 11. CONSTRUCT RULES

### Types by Class Association
**Physical Constructs** (Builders, Rogues, Druids)
- **Subtypes:** Trap, Fortification

**Magic Constructs** (Wizards, Sorcerers, Druids, Necromancers)
- **Subtype:** Incantation

**Vocal Constructs** (Bards, Doom-Whisperers, Druids, Paladins)
- **Subtypes:** Performance, Utterance

### Construct Abilities
- **Can have:** Static effects, triggered effects, entry/exit effects
- **CANNOT have:** Activated abilities
- **Can be targeted** by card effects but cannot be attacked
- **Occupy Command Zone slots** (count toward 6-character limit)
- **Do not move** (played directly to slot, stay there)

### Anchor Counter System
- **Amount:** Specified individually on each card (not tied to subtype)
- **Degradation:** Remove 1 counter at start of each turn
- **Sacrifice:** When last counter removed

---

## 12. COMPANION SUBTYPES

### Organism Types (Creature Species)
- **Extensive class-specific lists** available in Class Design Guide
- **Mechanically relevant** - cards can reference them (e.g., "Goblin's Bane", "Target Beast companion")
- **Generic pool exists** for cross-class access

### Role Types (Profession/Archetype)
- **Class-thematic professions** (Knight, Druid, Assassin, Bard, etc.)
- **See Class Design Guide** for approved lists per class

### Modifier Types (Optional)
- **Undead** - For corporeal reanimations
- **Spirit** - For incorporeal entities
- **Fungal** - Nature-themed
- **Manifest** - Created exclusively by the Animate Magic X keyword; represents a Magical Construct stabilized into Companion form
- **Only ONE modifier per companion**

### Creature Type Targeting Templates
- "Target [creature type] companion" (e.g., "Target Goblin companion")
- "Deals double damage to [creature type] creatures"
- "When a [creature type] companion enters..."
- "Destroy target [creature type] with power 3 or greater"

---

## 13. ABILITY TYPES

### Static Abilities
- **Always active** while permanent is in play
- **Template:** "This character has [keyword]" or "Characters you control have [keyword]"

### Triggered Abilities
- **Automatic responses** to game events
- **Use a stack** - multiple triggers resolve in order (most recent first)
- **"May" indicates optional** - choice made when trigger resolves
- **Template:** "When/Whenever/At [event], [effect]"
- Rules Note (ruled 2026-07-12): the stack model above is now engine-implemented and owner-ratified as the operational timing model — playing a card puts it on the stack ("plays" and "enters" are distinct sequential events), queued triggers resolve even if their source or subject has since died, and the ACTIVE player orders simultaneous triggers. Full dated notes: Game_Rules_Updated.md §Core Mechanics, "Triggered Abilities & The Trigger Stack".

### Activated Abilities
- **Player choice** to use during appropriate timing
- **Can have various costs** (not just exhaustion)
- **Abilities do NOT have subtypes** (Physical/Magic only applies to Action cards)
- **Template:** "[Cost]: [Effect]"

### Possible Activated Ability Costs
- Exhausting the character
- Sacrificing permanents
- Paying HP
- Discarding cards
- Milling cards
- Returning cards to hand
- **Compound costs allowed but less common:** "Exhaust this character and sacrifice a companion: Draw 3 cards"

---

## 14. TRIGGERED ABILITY TIMING & DESIGN CONSTRAINTS

### Available Trigger Windows
- **"When this enters the encounter"** - ETB trigger (items, companions, constructs)
- **"When this character attacks"** - Attack declaration
- **"When this character deals damage"** - After damage resolves
- **"When this character is dealt damage"** - When receiving damage
- **"At the start of your turn"** - Beginning phase
- **"At the end of turn"** - End phase
- **"Whenever a [condition]"** - Repeated trigger
- **"When this leaves the encounter"** - Any removal (catch-all)
- **"When this dies"** - Reduced to 0 HP
- **"When this is destroyed"** - Destroy effects specifically

### Entry Templating (Consistent Across Types)
- **Always use:** "When this enters the encounter"
- **Not "enters play" or "enters the battlefield"**
- **Same for all permanent types** (companions, constructs, items)

### CRITICAL DESIGN CONSTRAINTS FOR TRIGGERED ABILITIES

**All triggered abilities must be limited by ONE of these mechanisms:**

1. **Inherent Rarity** - Trigger condition naturally happens infrequently
   - âœ… "When this enters the encounter" (once per card)
   - âœ… "When this character attacks" (limited by action economy)
   - âœ… "When a companion you control dies" (requires board state changes)
   - âœ… "At the start of your turn" (once per turn cycle)

2. **Turn Frequency Limit** - Explicit once-per-turn restriction
   - âœ… "Once per turn, when you draw a card, ..."
   - âœ… "The first time each turn a character enters, ..."

3. **Resource Cost with Natural Scarcity**
   - âœ… **Safe costs:** Remove anchor counter (limited by anchor total), sacrifice permanent (limited by board), exhaust character (limited by ready characters)
   - âŒ **Dangerous costs:** Pay 1 HP (could pay 20 times), mill 1 card (could mill entire deck), discard a card (if hand is large)

### AVOID: Degenerate Combo Potential

**Dangerous triggered ability patterns to avoid:**
- Triggers on easily chainable actions: "Whenever you mill", "Whenever you draw", "Whenever you discard"
- Triggers that create their own condition: "When this mills cards, mill 2 more cards"
- Triggers with cheap, repeatable costs: "Pay 1 HP: Draw a card"
- Multiple instances of same trigger firing 10+ times in one turn

**Safe triggered ability patterns:**
- Self-limiting triggers: Entry/exit effects
- Action-gated triggers: Attack, activation
- State-change triggers: Character dies, permanent destroyed
- Turn-bounded triggers: Start/end of turn effects

### PRINCIPLE
**Avoid triggers that can fire 10+ times in one turn through normal gameplay.** This applies to ALL triggered effects (damage, draw, mill, token generation, etc.), not just damage. If an action can be repeated cheaply and frequently, it should not trigger powerful effects without additional bounds (turn limits, scarce resource costs, or inherent rarity).

---

## 15. REPLACEMENT EFFECTS

### Template Format
**"If [event] would happen, [modified event] instead"**

### Examples
- "If this character would be dealt damage, prevent that damage and mill 2 cards instead"
- "If you would draw a card, instead draw 2 cards"
- "If a companion would enter the encounter, it enters with +1 attack"

### Versus Triggered Abilities
- **Replacement effects:** Modify HOW things happen (use "would" and "instead")
- **Triggered abilities:** Respond AFTER things happen (use "when/whenever")

- Rules Note (ruled 2026-07-14): damage PREVENTION ("would take/would be dealt damage" → prevent some or all of it) is engine-implemented as one family — Armor and board-sourced prevent-N effects alike. Deal-side modifiers form the dealt amount before prevention applies; fully prevented damage is no damage (no Poison, no "when damaged" triggers); when several preventions could apply to one damage instance, the affected character's controller orders them. Full dated notes: Game_Rules_Updated.md §Core Mechanics, "Damage Prevention".

### PRINCIPLE (2026-07-14): No arbitrary orderings between cards
**The rules never rank cards or effects against each other by list, timestamp, or type hierarchy.** Whenever card effects collide and order matters, a player present at the collision decides — the active player for simultaneous triggers; the affected character's controller for prevention. Rationale: every card is unique and the pool is unbounded — players always have partial information about what exists, so any global ordering is unlearnable by design. Every future mechanic must satisfy this constraint.

---

## 16. DURATION & EFFECT TIMING

### Preferred Duration Templates
- **"Until end of turn"** - Clear expiration, easy to track
- **"While [condition]"** - Conditional, easy to verify at any time (e.g., "While you control 3 or more companions")
- **Construct-based effects** - Naturally expire when construct leaves/sacrifices

### Avoid Multi-Turn Tracking
- âŒ **Discouraged:** "For the next 2 turns, this character has +1 attack"
- âŒ **Discouraged:** "This character gets +2 attack" (when does it end?)
- âœ… **Preferred:** Use clear end conditions or conditional effects

---

## 17. VARIABLE VALUES (X) & RANDOM EFFECTS

### General X Guidelines
- **Use sparingly** - X values should be uncommon on cards
- **Avoid player-chosen X** - Too exploitable, hard to balance
- **Prefer derived X** - But only with proper bounds

### Derived X (Preferred)
- **Must reference game state with natural upper limits**
- **Ideally caps at single digits (â‰¤5-7)**
- **Safe examples:**
  - "Deal X damage where X is your Willpower" (max 5)
  - "Draw X cards where X is the number of companions you control" (max 6)
- **Dangerous examples:**
  - "Deal X damage where X is the number of cards in your Dead Zone" (could be 20+)
  - "Mill X cards where X is the damage dealt this turn" (unbounded)

### Player-Chosen X (Generally Avoid)
- **High risk** - easily exploitable
- **If used, must have explicit bounds:** "Choose a number up to 3. Deal that much damage..."
- **Better to avoid entirely** in most cases

### Random/Variable Outcomes
- **Generally avoided** for consistency and competitive play
- **Exception: Sorcerer class** can use random effects as part of their chaos/volatility theme
- **Templates for random effects:**
  - "Deal 3 damage to a random opposing character"
  - "Mill 2 cards or draw 1 card" (choose randomly)
- **Should be clearly marked as random** to avoid confusion
- **Avoid when result significantly impacts game outcome** (except for Sorcerer's identity)

---

## 18. COUNTER SYSTEM

### Approved Counter Types
1. **Armor counters** - Track armor usage (see Evergreen Keywords)
2. **Anchor counters** - Track construct duration
3. **Poison counters** - Track poison status (see Rogue keyword)

### Armor Counters
- Used by Armor keyword on items and some companions
- Each prevented damage instance adds 1 counter
- Item/companion sacrificed or loses ability when reaching threshold

### Anchor Counters
- All constructs enter with specified number of Anchor counters
- Remove 1 at start of each turn
- Sacrifice construct when last counter removed
- Can be manipulated by Reinforce/Dismantle (Builder keywords)

### Poison Counters
- Applied when damaged by character with Poison keyword
- Character with Poison counters is exhausted
- Resolution attempt at start of controller's turn (die roll vs Willpower)
- Success: Remove all Poison counters and ready character
- Failure: Remain exhausted, controller takes 1 damage per counter
- Multiple Poison counters stack (all removed together on success)

### New Counter Types
- **Require explicit approval** before being added
- AI generator should NOT create new counter types without authorization

---

## 19. "YOU" VS "THIS CHARACTER" TEMPLATING

### "You" = The Player/Controller
- Used for player-only actions
- Examples: "You draw a card", "You may...", "You control..."

### "This character" = The Specific Character
- Used when effect applies to the activating/triggering character
- Examples: "This character gains 3 HP", "This character attacks again"

### Player-Only Actions (Can Use Shorthand)
**Common player actions that don't need "you":**
- Draw, discard, shuffle, mill, search deck, reveal from hand/deck
- **Template:** "Draw two cards" NOT "You draw two cards"

### Character-Specific Effects (Must Be Explicit)
**Always specify who:**
- "This character gains 3 HP" or "Target character gains 3 HP"
- Don't use "you" for character effects

---

## 20. OPTIONAL EFFECTS ("MAY")

### Indicating Choice
- **"May"** keyword indicates optional effects
- Without "may", effects are mandatory

### Examples
- **Mandatory:** "Draw a card"
- **Optional:** "You may draw a card"
- **Mandatory trigger:** "When this enters, draw a card"
- **Optional trigger:** "When this enters, you may draw a card"

### Triggered Ability Choices
- **"May" decisions made immediately** when trigger resolves
- **Template:** "When this enters, you may sacrifice a companion. If you do, draw 2 cards"
- No holding priority or waiting - choice happens at resolution

---

## 21. TIMING SYSTEM

### No Instant Speed
- **Cards/abilities only used on your own turn** during appropriate phases
- **No instant-speed responses** during opponent's turn
- All interaction happens through triggered abilities

### Stack for Triggered Abilities
- **Multiple triggers stack** like MTG stack
- **Resolve most recent first** (last in, first out)
- Your trigger can cause opponent's trigger, which resolves first

### When Triggers Resolve
- Triggers happen automatically when condition met
- Stack and resolve following priority rules
- "May" choices made when trigger resolves (no holding)

---

## 22. EVERGREEN KEYWORDS (EXACT WORDING)

**RANGED** This character can attack from the Back Line.

**CLEAVE** When this character attacks, it deals damage equal to its attack to each character on the same line as the target. This is exclusive to two-handed weapons.

**EVASIVE** This character can attack any opponent character regardless of the target's positioning. Still subject to Guardian targeting requirement.

**ZEALOUS** (Warrior/Sorcerer - Evergreen) - This character may attack without needing to first pass a willpower check.

**HIT & RUN** After this character attacks, it may take an extra move action.

**GUARDIAN** While this character is ready (not exhausted) and a legal target, opponents must attack it before any other character.

**SCAVENGER** When this companion enters the encounter, you may return an item from your Dead Zone and immediately attach it to this companion.

**TRIBUTE** As an additional cost to play this Angel companion, pay its Tribute cost. (Angel/Paladin Companion Exclusive)

**KIT-MASTER** When this companion enters the encounter, you may move target item from one character you control to another character you control.

**RECKLESS** When this character attacks, it deals 1 damage to itself.

**ARMOR X** If the equip character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this item has X armor counters, sacrifice it.

**ARMOR X (companion variant)** If this character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this companion has X armor counters, it no longer prevents damage via this ability.

**WARDED AGAINST [X]** Warded creatures cannot be targeted, attacked, or damaged by cards of type or subtype [X]. (Example: "Warded against Magic Actions" or "Warded against Undead")

### Class-Specific Keywords

**POISON** (Rogue - Evergreen) - If a character is damaged by this character, exhaust that character and place a Poison counter on it. At the beginning of each player's turn, for each Poisoned character they control, that player rolls a d6. If the result is less than or equal to that player's current Willpower, remove all Poison counters from that character and ready it. Otherwise, that character remains exhausted this turn and its controller takes 1 damage for each Poison counter on it.
- Notes: Applies to players and companions. Resolution tied to Willpower. Poison counters stack; resolution removes all or none.

**ACROBATICS** (Rogue - Evergreen) - This companion cannot be damaged by any source that does not target it directly.
- Notes: Prevents splash, area, and indirect damage. Does not prevent targeted attacks or effects.

**REINFORCE N** (Builder - Evergreen) - When this enters play, add N Anchor counters to target Physical Construct.
- Restrictions: May only target Physical Constructs.

**DISMANTLE N** (Builder - Evergreen) - When this enters play, remove up to N Anchor counters from target Physical Construct. If it has no Anchor counters remaining, sacrifice it.
- Notes: Focused counter removal, not direct destruction.

**COERCION** (Doom-Whisperer - Evergreen) - When this companion enters, target opponent must discard a card or sacrifice a permanent.
- Notes: Always triggers on entry. Choice preserves agency while guaranteeing loss.

**DISMAY** (Doom-Whisperer - Evergreen) - As long as one or more permanents with Dismay are in the encounter under your control, your opponent is Dismayed.

**DISMAYED** *(state, not a card keyword)* - A Dismayed player has -1 Willpower. Dismayed does not stack.
- Notes: Applies to players and companions. Binary state, not cumulative.
- **Mechanical implications for players:**
  - Reduces number of available Special Actions per turn
  - Can cause companions to flee if Willpower drops below their level (checked at start of turn)
  - Reduces maximum level of cards playable from hand
  - **Can reduce to 0 Willpower:** Since Dismayed doesn't stack, a player can only reach 0 Willpower if they have 1 card in Class Zone and become Dismayed (they must allow this state to occur)

**ANIMATE MAGIC X** (Wizard - Evergreen) - When this enters, target Magical Construct you control becomes a Companion with the type Manifest and Attack and HP equal to X. It is no longer a Construct but retains its text and Anchor counters. If it would leave the encounter, sacrifice it instead. (Manifest is a Companion subtype exclusive to this keyword.)
- Notes: Wizards stabilize magical effects by giving them form. Does not apply to Physical or Vocal Constructs. Keeps animation temporary and bounded.
- **Stats are card-specific:** Each Animate Magic effect specifies the attack/HP values (e.g., "becomes a 2/3 Elemental companion")

**UNTAMED** (Druid-Specific) - While there are no Items or Physical Constructs in the encounter, this character is Untamed. Per-card text defines the bonus granted while Untamed.

### Subtypes with Special Rules

**FORTIFICATION** (Builder Subtype) - A Fortification is a Physical Construct. Fortifications typically enter play with Anchor counters and provide static or triggered defensive effects. They do not attack and do not exhaust to activate abilities.
- Notes: Exclusive structural identity for Builders. Eligible for Reinforce and Dismantle.

**UTTERANCE** (Doom-Whisperer Subtype) - An Utterance is a Vocal Construct. Utterances represent spoken compulsions, threats, or commands. They typically enter play with Anchor counters and apply control effects such as:
- Exhaust on entry
- Does not refresh  
- Can't attack
- Skip refresh
- Some rare Utterances may temporarily gain control of companions, governed by Anchor counters or explicit board-state conditions
- Notes: All lingering effects are card-represented. Control ends when the Utterance leaves play.
- **Control templating example:** "When this enters the encounter, gain control of target companion for as long as this remains in the encounter. Place that companion in any available slot in your command zone."
- Notes: Exclusive structural identity for Builders. Eligible for Reinforce and Dismantle.

**UTTERANCE** (Doom-Whisperer Subtype) - An Utterance is a Vocal Construct. Utterances represent spoken compulsions, threats, or commands. They typically enter play with Anchor counters and apply control effects such as: Exhaust on entry, Does not refresh, Can't attack, Skip refresh. Some rare Utterances may temporarily gain control of companions, governed by Anchor counters or explicit board-state conditions.
- Notes: All lingering effects are card-represented. Control ends when the Utterance leaves play.

### Set-Specific Keywords

**[TYPE'S] BANE** (Ashglow March) This deals double damage to [type] creatures.
- Examples: Goblin's Bane, Undead's Bane, Blight's Bane

**OATHSWORN** (Verdant Pact) As this permanent enters the encounter, place a card from your hand face-down beneath it. If you can't, sacrifice this permanent. When this permanent leaves the encounter, return the sworn card to your hand.
- Primary Classes: Paladin, Druid
- Occasional Classes: Other classes as thematically appropriate
- Rules Notes:
  - The sworn card remains face-down and hidden from opponents
  - If multiple cards would be sworn simultaneously, the controller chooses the order
  - Sworn cards count as being "in the encounter" for effects that count sworn cards
  - If a permanent with Oathsworn changes zones in some other way (such as being returned to hand), the sworn card is returned to its owner's hand

**UNTAMED** (Druid-Specific) While there are no Items or Physical Constructs in the encounter, this character is Untamed. Per-card text defines the bonus granted while Untamed.

---

## 23. COMBAT & TARGETING PRIORITY

### Attack Capability
- **Player Character:** Must have a weapon equipped to attack
- **Companions:** Can attack using printed attack value
- **Weapons:** May modify attack or grant abilities

### Attack Eligibility (Position Requirement)
A character may only initiate an attack if it is in the Front Line, **unless it has the Ranged keyword**. A character with Ranged may initiate an attack from either the Front Line or the Back Line.

### Targeting Priority (Attacks Only)
1. **Guardian Check:** If the opponent has any ready Guardian characters, the attacker must target a Guardian first
2. **Front Line Priority:** Among non-Guardian targets, the attacker must target a Front Line character if any exist
3. **Back Line targets become legal** only when the opposing Front Line is empty, when the attacker has Evasive, or when the defender has Ranged
4. **Choose Specific Target:** From legal targets, the attacking player chooses

Targeting priority applies only to characters (Player Character and Companions). Constructs cannot be attacked and do not satisfy or interfere with Front Line priority.

### Attack Sequence
1. Verify attack eligibility (Front Line position or Ranged); if not eligible, the attack cannot be declared
2. Declare attack and choose target (following targeting rules)
3. Attacker exhausts to 90 degrees
4. Damage resolves
5. Overkill damage may continue to additional targets (if applicable)

---

## 24. ACTION ECONOMY REFERENCE

### All Characters (Player + Companions)
**During activation, in order:**
1. **Movement (optional)** - Must be first; move to an adjacent empty slot; doesn't cause exhaustion. If no adjacent empty slot exists, the character cannot use Movement that activation.
2. **Minor Action (optional)** - Equip item, use Minor Action card; rotates to 45 degrees
3. **Major Action (optional)** - Attack, activated ability, Major Action card; rotates to 90 degrees

Activation is atomic: a character resolves Move/Minor/Major as a unit before any other character is activated.

### Player Character Additionally
4. **X Special Actions** (where X = Willpower) - Play companion/construct, use Special Action card; flips Class Zone card face-down

### Entry-Turn Willpower Check
- Characters can use: Movement, Minor Actions, Special Actions (PC only)
- Newly-entered companions CANNOT use Major Actions until they pass the willpower check (automatically resolved at the start of their controller's next turn). The Zealous keyword bypasses this check for attacks.

### Forced Movement
Card effects that move a character (without that character spending a Movement action) follow these defaults unless the card text states otherwise:
- The destination must be a legal (empty) slot; if no legal slot is available, the forced movement fizzles
- Forced movement does not consume the affected character's voluntary Movement budget for the turn
- The card text governs whether adjacency is required, whether the affected player can refuse, and any other constraints

---

## 25. SPECIAL TEMPLATING NOTES

### Effect Resolution
- All triggered abilities use stack
- Replacement effects modify events as they happen
- No instant-speed interaction (only triggered responses)

### Tracking Complexity
- Avoid open-ended tracking across turns
- Prefer "until end of turn" or conditional "while" effects
- Use constructs for multi-turn effects (they naturally degrade)

### Armor Keyword Full Rules
- **On Items:** "If equipped character would be dealt damage, prevent all of that damage and put an armor counter on this item. When this item has X armor counters, sacrifice it"
- Prevents ENTIRE damage from single source, not just X damage
- Each instance adds 1 counter
- Can prevent up to X separate attacks
- Multiple armors track independently; controller chooses which prevents damage

**On Companions (variant):**
- "If this character would be dealt damage, prevent all of that damage and put an armor counter on this companion. When this companion has X armor counters, it no longer prevents damage via this ability"

### Oathsworn Keyword (Verdant Pact Set)
- "As this permanent enters the encounter, place a card from your hand face-down beneath it. If you can't, sacrifice this permanent. When this permanent leaves the encounter, return the sworn card to your hand"
- Sworn card remains hidden from opponent
- Sworn cards count as "in the encounter"
- Primary Classes: Paladin, Druid; Occasional: Others as thematically appropriate

---

## 26. FORMATTING & CLARITY STANDARDS

### Capitalization
- **Card types:** Companion, Item, Construct, Action
- **Zones:** Class Zone, Hand, Encounter, Command Zone, Dead Zone, Deck, Character Loadout
- **Keywords:** Guardian, Ranged, Evasive, Armor, etc.
- **Subtypes:** Physical, Magic, Beast, Knight, etc.

### Templating Precision
- Use exact template language from this document
- Be consistent with terminology (e.g., always "enters the encounter", not "enters play")
- Use "target" for selecting specific permanents
- Use "choose" for selecting from options or numbers

### Reminder Text
- Include when space permits for complex or rare keywords
- Format: *(Italicized in parentheses)*
- Example: "Two-Handed *(Equipped character cannot use Magic Actions)*"

## 27. POWER LEVEL SCALING BY LEVEL & RARITY

### COMPANION STAT FRAMEWORK

**BASE STATS = Level/Level for ALL rarities**

All companions start with base stats equal to their level (Level 2 = 2/2, Level 5 = 5/5), then receive additional budget based on rarity.

**COMMON COMPANIONS:** Base + choose ONE
- +1 attack
- +1 HP
- Simple ability (Ranged, Guardian, Scavenger, Kit-Master, etc.)

**UNCOMMON COMPANIONS:** Base + choose TWO
- +1 attack
- +1 HP
- Simple ability
- OR one complex ability instead of two choices (triggered abilities, conditional effects)

**RARE COMPANIONS:** Base + choose THREE
- +1 attack
- +1 HP
- Simple ability
- Can pick same option multiple times (e.g., +3 attack for triple attack boost)
- OR mix simple choices with complex abilities (e.g., +1 ATK, +1 HP, complex triggered ability)

**LEGENDARY COMPANIONS:** Base + choose FOUR OR MORE
- Higher budget than Rare (approximately 4-5 choices)
- Prioritize abilities that fit character's story role
- Room for very complex or unique abilities
- Can have multiple complex abilities

### STAT TRADEOFFS & DESIGN FLEXIBILITY

**Stats can be reduced below base to add more abilities:**
- Example: Level 2 base is 2/2, but could be 1/3 with two simple abilities
- Sacrifice attack/HP for more keyword density or stronger effects

**Drawbacks allow power boosts:**
- Reckless, Tribute costs, conditional restrictions
- Example: 4/4 Level 2 with "This companion cannot block" or similar penalty

**Powerful abilities cost more choices:**
- **Evasive:** Costs 2 choices (bypasses positioning, very strong)
- **Guardian:** Costs 1-2 choices (strong defensive ability)
- **Hit & Run:** Costs 1-2 choices (extra action is powerful)
- **Ranged, Scavenger, Kit-Master:** Cost 1 choice (standard keywords)
- **NOTE:** Exact ability costs will be refined through class-specific guidelines. Ranged in particular may warrant re-costing in light of the attack-eligibility rule (see Section 23) — under the current rule, Ranged is the only way for a Back Line character to attack at all, which makes the keyword more impactful than it was when Back Line characters could attack freely. Worth revisiting after playtest data.

### Examples

**Level 2 Common:** 2/2 base + choose one
- 3/2 (attack boost)
- 2/3 (HP boost)
- 2/2 Guardian (ability)

**Level 2 Uncommon:** 2/2 base + choose two
- 3/3 (both stats)
- 3/2 Guardian (stat + ability)
- 2/2 Guardian + Ranged (two abilities)
- 2/2 + "When this enters, draw a card" (complex ability)

**Level 2 Rare:** 2/2 base + choose three
- 5/2 (three attack boosts)
- 3/3 Guardian (both stats + ability)
- 3/2 Guardian + "When this attacks, target character heals 2" (stats + simple + complex)
- 2/2 + two complex abilities

**Level 5 Legendary:** 5/5 base + choose four-five
- 7/7 Guardian Evasive (stats + two powerful keywords)
- 6/6 + complex triggered ability + static buff aura
- Thematically appropriate abilities reflecting story role

---

### ACTION CARD DAMAGE SCALING

**Simple damage spell baseline: Deal (Level + 1) damage**

**Level 1:** Deal 2 damage to target opposing character  
**Level 2:** Deal 3 damage to target opposing character  
**Level 3:** Deal 4 damage to target opposing character  
**Level 4:** Deal 5 damage to target opposing character  
**Level 5:** Deal 6 damage to target opposing character

**Rarity does NOT increase base damage** - instead adds complexity or flexibility

### Modifiers That Reduce Damage Output

**Multi-target effects:** Divide total damage
- Level 2 single target: 3 damage
- Level 2 multi-target: 2 damage to two targets (or 3/2/1 split across three)

**Additional effects:** Reduce damage proportionally
- "Deal 3 damage and draw a card" â†’ Level 3 (damage + card draw)
- "Deal 2 damage and mill 2" â†’ Level 2 (reduced damage for mill effect)

**Conditional bonuses:** Maintain base but add upside
- "Deal 3 damage, or 5 damage if target is a Beast" â†’ Level 2-3 range

**Flexibility/modes:** Slight reduction
- "Deal 2 damage to target character OR target character heals 2" â†’ Level 2

### Action Card Complexity by Rarity

**COMMON ACTIONS:**
- Simple, single effect
- "Deal 3 damage to target opposing character"
- "Target character heals 3"

**UNCOMMON ACTIONS:**
- Two related effects
- Conditional bonuses
- "Deal 2 damage to target character. If that character dies, draw a card"
- "Target character heals 2. If you control 3 or more companions, heal 4 instead"

**RARE ACTIONS:**
- Multiple effects or complex conditionals
- Significant card advantage or board impact
- "Deal 3 damage to target character. Then deal 2 damage to another target character"
- "Return target companion from your Dead Zone to the encounter. It enters with +1/+1"

**LEGENDARY ACTIONS:**
- Game-swinging effects
- Multiple targets or complex interactions
- Story-appropriate dramatic moments

---

### ITEM POWER SCALING

**WEAPONS:**

**Level 1 Weapon:**
- Common: +1 attack OR simple ability
- Uncommon: +2 attack OR +1 attack + simple ability
- Rare: +2 attack + ability OR +3 attack

**Level 3 Weapon:**
- Common: +2 attack OR +1 attack + simple ability
- Uncommon: +3 attack OR +2 attack + triggered ability
- Rare: +3 attack + complex ability OR +4 attack

**Level 5 Weapon:**
- Common: +3 attack OR +2 attack + simple ability
- Uncommon: +4 attack OR +3 attack + ability
- Rare: +4 attack + complex ability OR unique powerful effect

**Ability-only weapons** (no attack bonus):
- Should provide significant utility or card advantage
- "Exhaust equipped character: Deal 3 damage to target character"
- "Exhaust equipped character: Draw a card, then discard a card"

**ARMOR/TRINKETS:**

**Light Armor (1 slot):**
- Armor 1-2 depending on level
- May include minor additional abilities at higher rarity

**Heavy Armor (2 slots):**
- Armor 3-4+ depending on level
- Justified by occupying both gear slots

**Trinkets (1 slot):**
- Various abilities scaling with level/rarity
- Common: Simple static buff ("Equipped character gets +1 HP")
- Uncommon: Triggered ability ("When equipped character attacks, draw a card")
- Rare: Powerful or complex effects

---

### CONSTRUCT POWER SCALING

**Anchor counters:** Varies by card design (typically 2-4)
- Not directly tied to level/rarity
- More anchors = longer lasting but not necessarily stronger

**Effect power scales with level/rarity:**

**Level 1 Construct:**
- Common: Simple static buff to single character/slot
- Uncommon: Static buff to multiple characters or simple triggered ability
- Rare: Triggered ability with significant impact

**Level 3 Construct:**
- Common: Static buff or simple repeated effect
- Uncommon: Triggered ability affecting multiple targets
- Rare: Complex triggered ability or powerful static effect

**Level 5 Construct:**
- Common: Significant static buff or regular triggered effect
- Uncommon: Powerful triggered abilities
- Rare: Game-warping effects or multiple triggered abilities

**Construct abilities must follow triggered ability constraints** (see Section 14)
- Bounded by anchor removal, turn frequency, or inherent rarity
- Cannot create degenerate loops or 10+ triggers per turn

---

### CARD ADVANTAGE CONSIDERATIONS

**Multi-target removal/damage creates card advantage:**
- One card affecting 2+ opposing permanents = significant value
- Should cost higher level/rarity to compensate
- Example: "Deal 2 damage to three different characters" = Level 4-5 even though total damage is 6

**Draw/mill effects create card advantage:**
- "Draw 2 cards" is worth roughly 1-2 levels of value
- "Mill 3 cards" as setup is worth roughly 1 level
- Combined with other effects, increases level requirement

**Recursion creates card advantage:**
- Returning cards from Dead Zone = significant value
- "Return target companion from Dead Zone to encounter" = Level 3-5 depending on restrictions
- Multiple returns or unconditional returns cost more

**Token/permanent generation:**
- Currently excluded, but if added, would cost significant level/rarity

---

### GENERAL POWER BUDGETING PRINCIPLES

1. **Level gates access** - Higher level cards locked behind Willpower requirement
2. **Rarity adds complexity/uniqueness** - Not raw power, but flexibility and synergy
3. **Abilities cost stats** - Keywords and effects trade off against attack/HP
4. **Multi-card advantage requires higher cost** - X-for-1 effects must be appropriately leveled
5. **Conditional effects add power** - "If you control 3 companions" allows stronger base effect
6. **Drawbacks enable power** - Tribute, Reckless, restrictions allow better stats/abilities
7. **Scaling effects need bounded maximums** - Derived X values, "for each" effects must have reasonable caps

---

### NOTES FOR REFINEMENT

- Exact ability costs (how many "choices" Evasive/Guardian/etc. cost) will be determined through playtesting
- Class-specific mechanical guidelines will further constrain power levels
- These are baseline frameworks, not absolute rules
- Legendary cards have flexibility for story-appropriate unique effects
**Version:** 1.0 - Initial Comprehensive Draft
**Last Updated:** [Current Session]
**Status:** Foundation established, ready for refinement and expansion

---

## 28. CLASS-SPECIFIC MECHANICAL CONSTRAINTS

### ðŸŒ¿ DRUID
**Core Mechanics:**
- Wide variety of animal companions (beasts, spirits, fungal creatures)
- Evasive, Overkill, Guardian on companions
- Untamed keyword (bonus when no gear/physical constructs)
- Incantation and Vocal Constructs (rituals, chants, elemental effects)

**Restrictions:**
- âŒ No nature corruption (blight, rot, corrupted ecosystems)
- âŒ No industrial/mechanical constructs
- âŒ No direct damage focus (prefers board manipulation/attrition)

---

### âœ¨ PALADIN
**Core Mechanics:**
- Guardian (central to identity)
- Warded against [X] for protection
- Tribute (Angel-exclusive keyword)
- Heavy use of defensive companions
- Gear emphasis (armor, relics, shields)
- Vocal Constructs (blessings, oaths, declarations)
- Targeted damage to "evil" aligned creatures (zombies, goblins, blight)
- Board sweepers and light-based magic

**Unique Creature Type:** Angel (exclusive to Paladin, requires Tribute)

**Restrictions:**
- âŒ No stealth or evasion (confront threats head-on)
- âŒ No trickery or sabotage
- âŒ No corruption or forbidden power

---

### ðŸ—¡ï¸ ROGUE
**Core Mechanics:**
- Evasive (core identity, but companions rarely exceed 3 attack or 3 HP)
- Acrobatics (avoid non-targeted damage)
- Scavenger for weapons
- Hit & Run
- Physical Constructs (traps)
- Poison, debuffs, Willpower manipulation
- Items: smoke bombs, caltrops, poisoned blades

**Design Philosophy:**
- Win through subversion and attrition, not direct confrontation
- Force bad trades and keep enemies off-balance

**Restrictions:**
- âŒ Evasive companions should rarely exceed 3 attack or 3 HP (fragile and surgical)
- âŒ No brute force combat
- âŒ No heavy armor or tanky companions

---

### ðŸ“š WIZARD
**Core Mechanics:**
- Animate Magic (transform Magic Constructs into Companions)
- Magic Actions and Magic Constructs (Incantations)
- Top-deck manipulation, scrying, selective search
- Bounce/return effects (return permanents to hand/deck)
- Counter effects through Constructs (not instant-speed)
- "End your phase" costs on powerful effects
- Warded against [X] for magical shielding

**Design Philosophy:**
- Tempo-control through bounce, delay, and construct-based counters
- Preserve truth and memory (reveal, reorder, suppress randomness)

**Restrictions:**
- âŒ Minimal Physical Constructs or Physical Actions
- âŒ Rare use of gear/weapons
- âŒ No brute force companions (tools and spells over beaters)
- âŒ No healing or direct buffing

---

### ðŸ•¯ï¸ DOOM-WHISPERER
**Core Mechanics:**
- Coercion (opponent sacrifices permanent or discards)
- Dismayed (target player has -1 Willpower, doesn't stack)
- Vocal Constructs (Utterances of dread/persuasion)
- Suppression (exhaust, skip refresh, "cannot attack")
- Psychological weakening (Willpower debuffs, discard, memory erasure)
- Subversion (rare control effects, steal/redirect companions)
- Opponent deck/hand manipulation

**Companion Types:**
- Only sentient humanoids or shadow-creatures (no beasts/animals)
- Cultists, bureaucrats, shadow entities

**Restrictions:**
- âŒ No Guardian or protective abilities
- âŒ No healing or buffing allies
- âŒ No beasts or animal companions
- âŒ Removal is indirect (suppress, compel, redirect, not destroy)
- âŒ Limited item use (lean on Constructs)

---

### ðŸ§± BUILDER
**Core Mechanics:**
- Physical Constructs (Fortifications and Traps)
- Reinforce N (add Anchor counters to constructs)
- Dismantle N (remove Anchor counters from constructs)
- Blueprint (modal ETB effects)
- Anchor counter manipulation is core identity
- Positional control and persistent board presence
- Occasional Guardian and Warded against [X]

**Design Philosophy:**
- Architects of battlefield control through tangible structures
- Protect allies and dictate combat flow

**Restrictions:**
- âŒ Limited direct damage (restricted to emplacements like turrets)
- âŒ Minimal healing (defend by preventing damage)
- âŒ Cannot manipulate non-Physical Constructs

---

### ðŸ”¥ SORCERER
**Core Mechanics:**
- Raw damage and burst effects
- Multi-target damage (splash effects)
- Variable/random outcomes allowed ("deal damage to random enemy")
- Reckless for elemental creatures
- Magic Actions (burst damage, chaos)
- Magic Constructs (flames, energy walls)
- Self-burning tempo (trade HP/hand size for effects)
- Warded against [X] occasionally

**Design Philosophy:**
- Unleash magic, don't control it
- Volatility and unrefined potency

**Restrictions:**
- âŒ No subtlety or control (no scry, counter, deck manipulation)
- âŒ No healing or board lockdown
- âŒ Limited companion buffs (short-lived or high-risk only)

---

### âš”ï¸ WARRIOR
**Core Mechanics:**
- Dual-weapon combat ("combo attacks" with 2 weapons)
- Weapon synergy (many effects conditional on equipped weapons)
- Reckless occasionally
- Scavenger for battlefield salvage
- Physical Actions (strike, charge, block-breaking)
- Loadout-centric strategy
- Gear and Trinkets (durable, stat-boosting)

**Design Philosophy:**
- Tactical brawlers and weapon specialists
- Win through present power and decisive combat

**Restrictions:**
- âŒ No Magic Actions while dual-wielding (enforced by rules)
- âŒ No long-term recursion or stalling
- âŒ No constructs or complex setup
- âŒ Rarely use Evasive or Guardian

---

### ðŸŽ¶ BARD
**Core Mechanics:**
- Performance and social manipulation
- Vocal Constructs (Performances and some Utterances)
- Buff allies and debuff enemies
- Card draw and hand manipulation
- Flexible companion types (can befriend various roles)

**Design Philosophy:**
- Support through performance and social influence
- Adaptable and versatile

**Restrictions:**
(See full class guide for detailed restrictions)

---

### â˜ ï¸ NECROMANCER
**Core Mechanics:**
- Dead Zone manipulation (recursion, mill payoffs)
- Scavenger (reclaim from Dead Zone)
- Sacrifice and exchange effects
- Persistent threats (units that return after death)
- Magic Actions (mill, revive, sacrifice-based)
- Magic Constructs (bone altars, soul prisons)
- Dark utility and control

**Companion Types:**
- Living cultists and death-aligned followers
- Undead and Spirit creatures (reanimated)

**Restrictions:**
- âŒ No healing or protective buffs
- âŒ No Guardian
- âŒ No gear/weapon emphasis (spiritual and indirect power)
- âŒ Limited construct presence (bone relics, cursed altars)

---

## 29. ITEM POWER BUDGETS (DETAILED)

### WEAPONS

**Attack Bonus Scaling:**
- **Conservative progression:** +1 (Level 1) to +3 (Level 5)
- **Maximum with drawbacks:** +4 for Common/Uncommon, +5 for Rare (+6 Rare with significant drawbacks)
- **Level differentiation:** Through abilities, not just attack values

**Common Weapons:**
- Attack range: +1 to +3 (+4 with drawbacks)
- Simple abilities or vanilla stats
- Examples:
  - Level 1: +1 attack
  - Level 2: +1 attack + "Equipped character has Ranged" OR +2 attack with drawback
  - Level 3: +2 attack + simple keyword OR +3 attack (vanilla)
  - Level 5: +3 attack + simple ability OR +4 attack with drawback
- **Alternative design:** No attack bonus, provides simple activated ability
  - Example: "Exhaust equipped character: Target character heals 2"

**Uncommon Weapons:**
- Attack range: +1 to +4
- More complex abilities justify level
- Examples:
  - Level 2: +2 attack + triggered ability
  - Level 3: +2 attack + "When equipped character attacks, target opposing character takes 1 damage"
  - Level 4: +3 attack + complex triggered ability

**Rare Weapons:**
- Attack range: +2 to +5 (+6 with drawbacks)
- Push attack higher OR maintain lower attack with powerful abilities
- Examples:
  - Level 3: +4 attack (vanilla for rare)
  - Level 3: +2 attack + "Exhaust equipped character: Deal 3 damage to target character"
  - Level 5: +5 attack OR +4 attack + powerful ability

**Ability-Only Weapons:**
- Provide significant utility instead of attack bonus
- Should enable actions comparable to attack value at that level
- Examples:
  - Level 2: "Exhaust equipped character: Draw a card, then discard a card"
  - Level 3: "Exhaust equipped character: Deal 3 damage to target character"

### ARMOR & TRINKETS

**Light Armor (1 slot):**
- Armor 1-2 depending on level/rarity
- Common: Armor 1
- Uncommon: Armor 1-2, may include minor ability
- Rare: Armor 2 + ability

**Heavy Armor (2 slots):**
- Armor 3-4+ depending on level/rarity
- Justified by occupying both gear slots
- Common: Armor 3
- Uncommon: Armor 3-4
- Rare: Armor 4+ OR Armor 3 + significant ability

**Trinkets (1 slot):**
- Various abilities scaling with level/rarity
- Common: Simple static buff ("Equipped character gets +1 HP")
- Uncommon: Triggered ability ("When equipped character attacks, draw a card")
- Rare: Powerful or complex effects

---

## 30. CONSTRUCT POWER BUDGETS (DETAILED)

### Anchor Counters
- **Range:** Typically 2-4 counters
- **Not tied to rarity/level** - varies by design intent and effect duration
- More anchors = longer lasting, not necessarily stronger

### Effect Power Scaling

**Common Constructs:**
- Simple static buffs affecting single character/area
- Simple triggered abilities with clear, immediate impact
- Examples:
  - Level 1: "Characters in your party get +1 HP"
  - Level 2: "When a companion enters your party, mill 1 card"
  - Level 3: "Physical Constructs you control cannot have Anchor counters removed by opponents"

**Uncommon Constructs:**
- Static buffs affecting multiple targets
- Triggered abilities with broader impact
- Examples:
  - Level 2: "When a companion enters your party, target opposing character takes 1 damage"
  - Level 3: "Companions in your party have Ranged"
  - Level 4: "At the start of your turn, target character in your party heals 1"

**Rare Constructs:**
- Powerful triggered abilities
- Activated abilities (often costing Anchor counters)
- Game-warping static effects
- **Must follow triggered ability constraints** (Section 14 - avoid 10+ triggers/turn)
- Examples:
  - Level 3: "Remove an Anchor counter: Return target companion to its owner's hand"
  - Level 4: "When an opponent plays a Magic Action, you may sacrifice this: Counter that Action"
  - Level 5: "Remove an Anchor counter: Target Magic Construct becomes a 2/3 Elemental companion until end of turn"

### Design Constraints
- Cannot attack
- Can be targeted by effects
- Cannot have activated abilities that exhaust (they don't exhaust)
- Effects must be static, triggered, or Anchor-removal-activated

---

## 31. ACTION CARD POWER BUDGETS (DETAILED)

### Baseline Effects by Type

**Damage:**
- Simple damage = Level + 1
- Level 1: Deal 2 damage
- Level 5: Deal 6 damage

**Draw:**
- **Conservative scaling:** 1-3 cards across all levels
- Level 1-2: Draw 1 card
- Level 3-4: Draw 2 cards
- Level 5: Draw 3 cards
- Modified by additional effects, drawbacks, and rarity

**Mill:**
- Level = cards milled
- Level 2: Mill 2 cards
- Level 5: Mill 5 cards

**Bounce (Return to Hand):**
- Level 2: Return target companion to owner's hand
- Level 3: Modal/flexible bounce OR return construct

**Destroy:**
- Level 3+ minimum (bypasses HP, very strong)
- Often requires conditions or targeting restrictions
- Examples: "Destroy target Undead companion" (Level 2-3), "Destroy target companion" (Level 4-5)

**Healing:**
- Level + 1 or Level + 2 healing
- Level 2: Heal 3-4
- Level 5: Heal 6-7

### Effect Modifiers (Increase Level Requirement)

**Multi-target:** +1-2 levels
- "Deal 2 damage to three different characters" = Level 4-5

**Additional effects:** +1 level per significant effect
- "Deal 3 damage and draw a card" = Level 3-4

**Flexibility/choice:** +1 level
- "Deal 3 damage to target character OR heal 3 to target character" = Level 3

**Unconditional vs Conditional:**
- Conditional effects can be 1 level lower
- "Deal 4 damage to target Beast" = Level 2-3
- "Deal 4 damage to target character" = Level 3-4

### Rarity Impact on Actions

**Common Actions:**
- Single straightforward effect
- Clear, immediate impact
- Examples: "Deal 3 damage", "Draw a card", "Target character heals 3"

**Uncommon Actions:**
- Two related effects
- Conditional bonuses
- Examples:
  - "Deal 3 damage. If target dies, draw a card"
  - "Draw a card. Discard a card"
  - "Target character heals 2. If you control 3+ companions, heal 4 instead"

**Rare Actions:**
- Multiple effects
- Complex conditionals
- Significant card advantage or board impact
- Examples:
  - "Draw 2 cards. Then discard a card unless you control 3 or more companions"
  - "Return target companion to hand. If you control a Magic Construct, draw a card"
  - "Deal 4 damage to target character, then deal 2 damage to another target character"

### Action Card Examples by Level

**Level 1:**
- Common: "Deal 2 damage to target character"
- Uncommon: "Deal 2 damage. If target is a Beast, deal 3 instead"
- Rare: "Deal 2 damage to target character. Draw a card"

**Level 3:**
- Common: "Deal 4 damage to target character"
- Uncommon: "Deal 4 damage. If target dies, draw a card"
- Rare: "Draw 2 cards. Discard a card"

**Level 5:**
- Common: "Deal 6 damage to target character"
- Uncommon: "Deal 5 damage to target character. Mill 2 cards"
- Rare: "Draw 3 cards. End your Main Phase"

---

## 32. CROSS-CLASS MECHANICAL RESTRICTION INTERPRETATION

### Strictness Guidelines

**"No X"** = Absolutely never, 0% of cards
- Examples: "No tokens", "No healing" (Necromancer), "No Guardian" (Doom-Whisperer)
- These are hard design boundaries

**"Minimal X"** = Rare exceptions, 5-10% of cards
- Only when strong thematic justification exists
- Examples: "Minimal Physical Constructs" (Wizard), "Minimal healing" (Builder)

**"Rarely X"** = Uncommon but acceptable, 15-20% of cards
- Part of design space but not emphasized
- Examples: "Rarely use Evasive" (Warrior), "Rarely direct damage" (Druid)

**"Limited X"** = Restricted in scope/power, not frequency
- Can appear regularly but with constraints
- Examples: "Limited direct damage" (Builder - only via turrets), "Limited companion buffs" (Sorcerer - short-lived only)

### Application in Card Generation

When generating cards:
1. Check class restrictions first
2. If effect is in "No" category â†’ Skip, generate different effect
3. If effect is in "Minimal/Rarely" category â†’ Only use if particularly thematic or necessary for set balance
4. Document when breaking "Minimal" restrictions to ensure they remain rare

---

## 33. DESIGN PHILOSOPHY & CREATIVE INTERPRETATION

### Guidelines vs. Rigid Rules

The power budgets, scaling frameworks, and mechanical constraints in this document are **guidelines for balance and consistency**, not rigid formulas that must be followed exactly.

**Creative interpretation is encouraged, especially for:**

**Abilities:**
- Novel combinations of existing keywords
- Thematic abilities that bend power budgets if flavorful
- Conditional abilities that create interesting gameplay moments
- Abilities that interact with game state in unique ways

**Action Cards:**
- Effects that don't fit cleanly into damage/draw/mill categories
- Multi-modal cards with player choice
- Thematic effects specific to a class identity
- Cards that create memorable gameplay moments

**When to Deviate from Guidelines:**

âœ… **Good reasons to break guidelines:**
- Strong thematic justification for the class/set
- Creates interesting strategic decisions
- Fills a mechanical gap in the class's toolkit
- Adds variety to prevent formulaic card design
- The "spirit" of the power level is maintained even if exact numbers differ

âŒ **Poor reasons to break guidelines:**
- Making a card generically "better" without justification
- Ignoring class restrictions for convenience
- Breaking triggered ability safety rules (10+ triggers/turn)
- Violating hard "No X" restrictions
- Power creep without compensating drawbacks

### Design Space Exploration

**These parameters define the boundaries, not every possibility within them.**

Within the established constraints, designers should:
- Experiment with novel ability combinations
- Create cards that reward creative deckbuilding
- Design around thematic moments from the world/story
- Build synergies between cards and mechanics
- Push boundaries while respecting balance

**The goal is consistent, balanced, flavorful cards - not robotic adherence to formulas.**

---

## 34. CARD FORMATTING & TYPE LINE SPECIFICATION

### Type Line Format

**General Structure:** [Supertype] Card Type - Subtypes

### By Card Type

**COMPANIONS:**
- Format: **[Supertype] Companion - Organism Role [Modifier]**
- Examples:
  - "Companion - Human Knight"
  - "Companion - Wolf" (no role needed)
  - "Legendary Companion - Elf Shaman"
  - "Companion - Undead Human Soldier" (modifier comes first)
  - "Companion - Spirit Fox" (modifier + organism)

**ITEMS - WEAPONS:**
- Format: **Item - Weapon [- Two-Handed]**
- One-Handed is assumed by default, not stated
- Weapon subtype (Sword, Bow, Dagger, etc.) typically appears in card name, not type line
- Examples:
  - "Item - Weapon"
  - "Item - Weapon - Two-Handed"

**ITEMS - GEAR:**
- Format: **Item - Gear Subtype**
- Examples:
  - "Item - Light Armor"
  - "Item - Heavy Armor"
  - "Item - Trinket"

**CONSTRUCTS:**
- Format: **Construct - Type - Subtype**
- Type: Physical, Magic, or Vocal
- Examples:
  - "Construct - Physical - Fortification"
  - "Construct - Physical - Trap"
  - "Construct - Magic - Incantation"
  - "Construct - Vocal - Performance"
  - "Construct - Vocal - Utterance"

**ACTIONS:**
- Format: **Action Type - Effect Type**
- Action Type: Major Action or Special Action (don't include redundant "Action")
- Effect Type: Physical or Magic
- Examples:
  - "Major Action - Physical"
  - "Major Action - Magic"
  - "Special Action - Physical"
  - "Special Action - Magic"

### Subtype Formatting Rules

**Multiple Subtypes:**
- Separate with spaces, not commas
- Order: Modifier â†’ Organism â†’ Role
- Examples:
  - "Spirit Human Knight" (modifier, organism, role)
  - "Undead Wolf" (modifier, organism)
  - "Human Cultist" (organism, role)

**Legendary Supertype:**
- Always appears before card type
- Format: "Legendary Companion - [subtypes]"
- Example: "Legendary Companion - Human Champion"

**Angel Supertype:**
- Appears in subtype position, not as supertype
- Always has Tribute keyword
- Example: "Companion - Angel" (not "Angel Companion")

### Card Layout Components

**Every card has:**
1. **Name** (top of card)
2. **Class Icon** (top right)
3. **Level** (top left, 1-5)
4. **Type Line** (below art)
5. **Rules Text** (abilities, keywords)
6. **Rarity Indicator** (visual gem/symbol)

**Companions additionally have:**
7. **Attack** (bottom left)
8. **HP** (bottom right)

**Constructs additionally have:**
9. **Anchor Counters** (specified in rules text: "Enters with X Anchor counters")

**Weapons additionally have:**
10. **Attack Bonus** (if applicable, shown in rules text: "+X attack")

---

## DOCUMENT STATUS
**Version:** 1.1 - Added Power Level Scaling Framework
**Last Updated:** [Current Session]
**Status:** Foundation established with power budgeting guidelines, ready for class-specific integration

**Next Steps:**
- Integrate class-specific mechanical constraints from Class Design Guides
- Refine ability cost values through playtesting
- Create Card Generation Workflow document (decision tree format)
- Develop power level matrices by level/rarity for quick reference
