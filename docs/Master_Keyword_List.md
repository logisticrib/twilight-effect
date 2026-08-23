# THE TWILIGHT EFFECT - MASTER KEYWORD LIST

This document consolidates all keywords from Game Rules, Keyword Glossary, and Class Design Guide.

---

## EVERGREEN KEYWORDS
*These keywords appear across all sets and are core to the game's mechanical identity.*

### Combat & Positioning Keywords

**RANGED** - This character can attack from the Back Line.
- **Rules Note (2026-07-15):** Ranged is a permission, and "cannot" beats "can" — a standing restriction stating back-line companions cannot attack overrides Ranged (and any aura-granted attack eligibility). See Game_Rules_Updated §Core Mechanics, Standing Restrictions.
- *Common:* Archer companions, ranged weapons, magical attacks like fireballs

**CLEAVE** - When this character attacks, it deals damage equal to its attack to each character on the same line as the target. This is exclusive to two-handed weapons.

**EVASIVE** - This character can attack any opponent character regardless of the target's positioning. Still subject to Guardian targeting requirement.
- *Common:* Rogue
- *Occasional:* Druid, Doom-Whisperer

**HIT & RUN** - After this character attacks, it may take an extra move action.
- *Common:* Rogues and some stealthy, agile animal companions

**ZEALOUS** - This character may attack without needing to first pass a willpower check.
- *Common:* Warriors and Sorcerers
- *Access:* Paladins (zealous conviction); Druid animal companions (acting on instinct)
- **Rules Notes:**
  - Companions normally cannot take Major Actions on the turn they enter the encounter — they must pass a willpower check first, which resolves automatically at the start of their controller's next turn
  - Zealous bypasses this check for **attacks only**; non-attack Major Actions remain gated until the check passes
  - The fleeing willpower check (Level vs current WP) is unaffected — Zealous companions whose Level exceeds Willpower still flee normally

**GUARDIAN** - While this character is ready (not exhausted) and a legal target, opponents must attack it before any other character.
- *Common:* Paladin
- *Occasional:* Druid, Builder

### Item & Equipment Keywords

**ARMOR X** - This item enters the encounter with X armor counters. If the equipped character would be dealt damage, prevent all of that damage and remove an armor counter from this item. When the last armor counter is removed, sacrifice this item.
- Light Armor: Typically Armor 1-2
- Heavy Armor: Typically Armor 3-4 or higher
- **Rules Notes:**
  - Armor prevents the entire damage from a single source, not just X damage
  - Each instance of damage prevented removes 1 counter
  - Armor X can prevent up to X separate attacks before being sacrificed
  - Characters can equip multiple armors; each tracks its own counters independently
  - If a character has multiple pieces of armor equipped, the controlling player chooses which armor prevents the damage
  - **Rules Note (2026-07-14):** Armor is a member of the damage-prevention family (Game_Rules_Updated §Core Mechanics, Damage Prevention). When armor and other prevention effects could apply to the same damage instance, the affected character's controller chooses the order they apply; armor reached after the damage is already reduced to 0 never engages and spends no counter. Deal-side modifiers (e.g. damage doubling) form the dealt amount before any prevention applies.
  - **Rules Note (ruled 2026-08-18) — ARMOR INVERTED to mirror Anchor-counter logic.** Armor no longer accumulates counters up to X. It now ENTERS with X armor counters, each prevented damage instance REMOVES one, and when the last counter is removed the item is sacrificed (a companion simply stops preventing damage via the ability). The wording above is the owner-ratified canon replacing the previous accumulate-up wording. All six 2026-07-14 prevention-family rulings survive the inversion unchanged — including that armor reached after the damage is already 0 never engages and spends no counter (under inversion: removes none). Consolidated this date, same remedy as Untamed (2026-08-18): the duplicate definitions in Game_Rules_Updated.md (§Items, §Keyword Reference, and the verbatim quote inside §Core Mechanics — Damage Prevention) and Card_Design_Parameters.md (§Evergreen Keywords, §Armor Keyword Full Rules) are now POINTERS to this entry. Two of them had already drifted ("on this item" where this document said "on this companion"); a pointer cannot drift again.

**ARMOR X (companion variant)** - This companion enters the encounter with X armor counters. If this companion would be dealt damage, prevent all of that damage and remove an armor counter from this companion. When this companion has no armor counters, it no longer prevents damage via this ability.
- **Rules Note (universal counter rule, ruled 2026-08-18):** Armor counters on a companion ARE the prevention ability. A companion with one or more armor counters prevents damage (removing one per instance) regardless of how the counters arrived — printed keyword or card effect. Effect-placed and keyword-native armor counters are indistinguishable. (Deliberate parallel: effect-applied Poison counters are identical to keyword-applied ones — the same principle, on the prevention side.) The design principle recorded alongside this rule in Card_Design_Parameters §18: binary on/off ability grants must not leave counters lingering while the ability toggles — place counters once via triggers and let the counters carry the behavior.

**SCAVENGER** - When this companion enters the encounter, you may return an item from your Dead Zone and immediately attach it to this companion.
- *Common:* Rogue
- *Occasional:* Necromancer

**KIT-MASTER** - When this companion enters the encounter, you may move target item from one character you control to another character you control.
- *Common:* Warrior
- *Occasional:* Paladin

### Combat Modifier Keywords

**TRIBUTE** - As an additional cost to play this Angel companion, pay its Tribute cost.
- Angel (Paladin) Companion Exclusive

**RECKLESS** - When this character attacks, it deals 1 damage to itself.
- *Common:* Sorcerer, Warrior
- **Rules Note (RE-RULED 2026-07-14):** the recoil is damage the character takes, so the damage-prevention family applies to it — armor absorbs it (spending a counter) and "prevent N" effects reduce it, ordered by the character's controller as usual (Game_Rules_Updated §Core Mechanics, Damage Prevention). This supersedes the earlier engine reading (2026-07-03) that the recoil bypassed armor.

---

## CLASS-SPECIFIC EVERGREEN KEYWORDS

### Rogue Keywords

**POISON** - If a character is damaged by this character, exhaust that character and place a Poison counter on it.
- At the beginning of each player's turn, for each Poisoned character they control, that player rolls a die
- If the result is less than or equal to that player's current Willpower, remove all Poison counters from that character and ready it
- Otherwise, that character remains exhausted this turn and its controller takes 1 damage for each Poison counter on it
- **Rules Notes:**
  - Applies to players and companions
  - Resolution is tied to Willpower, not pure randomness
  - Poison counters stack; resolution removes all or none

**ACROBATICS** - This companion cannot be damaged by any source that does not target it directly.
- **Rules Notes:**
  - Prevents splash, area, and indirect damage
  - Does not prevent targeted attacks or effects

### Builder Keywords

**REINFORCE N** - When this enters play, add N Anchor counters to target Physical Construct you control.
- May only target Physical Constructs

**DISMANTLE N** - When this enters play, remove up to N Anchor counters from target Physical Construct. If it has no Anchor counters remaining, sacrifice it.
- Focused counter removal, not direct destruction

### Doom-Whisperer Keywords

**COERCION** - When this companion enters, target opponent must discard a card or sacrifice a permanent.
- Always triggers on entry
- Choice preserves agency while guaranteeing loss
- **Rules Note:** The Player Character cannot be chosen as the sacrificed permanent (owner ruling ratified 2026-07-04) *(Generalized 2026-07-24: the PC can never be chosen as a sacrifice to ANY effect — see Game_Rules_Updated, Dead Zone Rules Notes.)*

**DISMAY** - As long as one or more permanents with Dismay are in the encounter under your control, your opponent is Dismayed.

**DISMAYED** *(state, not a card keyword)* - A Dismayed player has −1 Willpower. Dismayed does not stack.
- Binary state, not cumulative
- Applied to players, not characters

### Wizard Keywords

**ANIMATE MAGIC X** - When this enters, target Magical Construct you control becomes a Companion with the type Manifest and Attack and HP equal to X. It is no longer a Construct but retains its text and Anchor counters. If it would leave the encounter, sacrifice it instead.
- **Rules Notes:**
  - Manifest is a Companion subtype exclusive to this keyword
  - Represents Wizards stabilizing magical effects by giving them form
  - Does not apply to Physical or Vocal Constructs
  - Keeps animation temporary and bounded

**COUNTER CONSTRUCT** *(Design Pattern, not a card keyword)* - A Magical Construct with a triggered ability that counters a card, action, or effect when a condition is met.
- Example: "When an opponent plays a Magic Action, sacrifice this Construct. Counter that Action."
- **Rules Notes:**
  - Counters exist only via constructs
  - No off-turn actions are created

**PHASE ENDING** *(Rules Tool, not a card keyword)* - Some cards may end the current phase as part of their effect or as a drawback. Ending a phase enforces sequencing and prevents chaining multiple powerful effects in a single turn.
- Primarily used by Wizards
- Ending a phase is a constraint, not a reward

### Druid Keywords

**UNTAMED** - While there are no Gear or Physical Constructs in the encounter, this character is Untamed. Per-card text defines the bonus granted while Untamed.
- **Rules Note (ruled 2026-08-18) — Wording consistency: GEAR only, ENCOUNTER-wide.** This entry is the canonical wording (Rules_Taxonomy names this document as defining for keywords). Two consequences, both ruled: (a) the condition counts GEAR only — Gear is a strict subset of Items (Items split into Weapons and Gear; Card_Design_Parameters §Type Line Format), so a WEAPON does NOT suppress Untamed; (b) the scope is the ENCOUNTER — both players' Gear and Physical Constructs count, never controller-only. Corrected this date to match: Card_Design_Parameters.md (two duplicate definitions read "no Items"), Class_Design_Guide.docx (a card-generation example was controller-scoped and dropped Gear; the Druid keyword summary read "in play" and has been harmonized to "in the encounter"). The engine registry (src/data/keywords.ts) already carried the canonical wording.

### Paladin Keywords

**INSPIRE** - As long as one or more permanents with Inspire are in the encounter under your control, you are Inspired.

**INSPIRED** *(state, not a card keyword)* - An Inspired player has +1 Willpower. Inspired does not stack.
- Binary state, not cumulative
- Applied to players, not characters
- **Rules Note (ruled 2026-08-18):** A player who is both Dismayed and Inspired nets to zero — their current Willpower is the plain Class-Zone card count. Stated explicitly here so it is never re-derived.
- **Rules Note (ruled 2026-08-18):** Inspire reads YOUR OWN board; Dismay reads your opponent's. The two are mirror-inverted in both direction and sign — "under your control, YOU are Inspired" against Dismay's "under your control, your OPPONENT is Dismayed."

---

## SET-SPECIFIC KEYWORDS

### ASHGLOW MARCH

**BANE** - This deals double damage to Companions whose subtype or class is [NAME]. Appears on cards as `[NAME]'S BANE`.
- **Examples:**
  - Goblin's Bane: Deals double damage to Goblin Companions
  - Undead's Bane: Deals double damage to Undead Companions
  - Paladin's Bane: Deals double damage to Paladin Companions
  - Blight's Bane: Deals double damage to Blighted Companions
- **Rules Note (owner-ruled 2026-08-20) — "subtype is [NAME]" means TOKEN MEMBERSHIP.** A type line's modifiers stack onto its organism WITHOUT erasing it, so a Bane matches when [NAME] is ANY token of the target's type line — not only when it equals the whole line. **A Beast Crow IS a Crow**, and a Spirit Beast Crow is still a Crow; Crow's Bane doubles against both. It does NOT reach an Elf Scout, and a card merely NAMED "Crow-something" is untouched — the type line is the only thing read (Beast is printed, never derived; see §12 of Card_Design_Parameters). The class leg of the keyword is unchanged. *(Recorded when the Beast modifier made the distinction reachable: the engine had compared the whole type line as one string, so a subtype-keyed Bane would silently have missed every modifier-carrying organism. No shipped card was affected — both current Bane carriers key a CLASS — so this ruling changed no live behaviour.)*

**PARANOIA** - Whenever an opponent plays a Companion, look at the top card of that player's deck. You may put that card on the top or bottom of their deck.
- Represents Duke Flintwake's increasing suspicion and control
- Primarily associated with military/authority cards in Ashglow March
- **Rules Note (2026-07-12) — Ordering RE-RULED, supersedes the 2026-07-04 ordering note.** Paranoia triggers on the play. Under the trigger stack, the peek resolves BEFORE the played companion enters the encounter and before any of its on-enter effects. The 2026-07-04 note stating that the placer's own on-enter effects resolve first is superseded as of this date. All other Paranoia rulings stand unchanged: the Paranoia controller peeks the placer's deck and chooses top or bottom; the trigger fires on plays from hand only (placing the PC and Animate Magic conversions do not trigger it) — as of 2026-07-15 this is the GAME-WIDE definition of "play", not a Paranoia special case (Game_Rules_Updated §Core Mechanics, Triggered Abilities: "Play" means from hand, universally).

### VERDANT PACT

**OATHSWORN** - As this permanent enters the encounter, place a card from your hand face-down beneath it. If you can't, sacrifice this permanent. When this permanent leaves the encounter, return the sworn card to your hand.
- *Primary Classes:* Paladin, Druid
- *Occasional Classes:* Other classes as thematically appropriate
- **Rules Notes:**
  - The sworn card remains face-down and hidden from opponents
  - If multiple cards would be sworn simultaneously, the controller chooses the order
  - Sworn cards count as being "in the encounter" for effects that count sworn cards
  - If a permanent with Oathsworn changes zones in some other way (such as being returned to hand), the sworn card is returned to its owner's hand
- **Design Philosophy:** Represents the sacred commitments and spiritual sacrifices central to the Verdant Pact. Players must commit resources to unlock greater power, creating strategic tension between hand advantage and battlefield presence. The mechanic encourages deck building around oath density.
- **Thematic Connection:** Most commonly found on cards representing the spiritual traditions of the Hightrail Spires, the political agreements of Stonefern Hollow, and the druidic bonds of the forest communities. The temporary sacrifice of hand resources reflects the idea that meaningful oaths require genuine commitment and risk.

---

## CONSTRUCT SUBTYPES (with keyword-like properties)

### Physical Constructs
*Used by: Builders, Rogues, Druids*

**TRAP** - Reactive hazards or field triggers
- "Its tactical advantage on the field weakens with each passing moment..."

**FORTIFICATION** - Static defenses and field obstructions
- A Fortification is a Physical Construct
- Fortifications typically enter play with Anchor counters and provide static or triggered defensive effects
- They do not attack and do not exhaust to activate abilities
- Exclusive structural identity for Builders
- Eligible for Reinforce and Dismantle

### Magic Constructs
*Used by: Wizards, Sorcerers, Druids, Necromancers*

**INCANTATION** - Bound magical effects or summoned arcane projections
- "The magic anchoring it to the field begins to fray..."

### Vocal Constructs
*Used by: Bards, Doom-Whisperers, Druids, Paladins*

**CHANT** - Repetitive rhythmic effects
- "The echoes fade, and with them, its influence..."

**SONG** - Melodic and sustained magical effects
- "The echoes fade, and with them, its influence..."

**DIRGE** - Dark, mournful incantations
- "The echoes fade, and with them, its influence..."

**RITE** (Druid) - Seasonal and growth rites spoken to the wild
- "The echoes fade, and with them, its influence..."

**BLESSING** (Paladin) - Consecrations, oaths, and declarations of light
- "The echoes fade, and with them, its influence..."

**UTTERANCE** (Doom-Whisperer Exclusive) - Spoken compulsions, threats, or commands
- An Utterance is a Vocal Construct
- Utterances represent spoken compulsions, threats, or commands
- They typically enter play with Anchor counters and apply control effects such as:
  - Exhaust on entry
  - Does not refresh
  - Can't attack
  - Skip refresh
- Some rare Utterances may temporarily gain control of companions, governed by Anchor counters or explicit board-state conditions
- **Rules Notes:**
  - All lingering effects are card-represented
  - Control ends when the Utterance leaves play

---

## KEYWORD SUMMARY BY CLASS

### Warrior
- **Primary:** Zealous, Kit-Master, Reckless (occasional)
- **Access:** Guardian (occasional), Cleave

### Wizard
- **Primary:** Animate Magic, Counter Construct (design pattern), Phase Ending
- **Access:** Ranged

### Sorcerer
- **Primary:** Zealous, Reckless
- **Access:** Ranged

### Necromancer
- **Primary:** Scavenger (occasional)
- **Access:** None exclusive beyond design patterns

### Paladin
- **Primary:** Tribute, Guardian, Inspire, Kit-Master (occasional)
- **Access:** Zealous (rare, flavored as conviction)
- **Set-Specific:** Oathsworn (Verdant Pact)

### Druid (Animal Companions)
- **Access:** Zealous (animal companions only — instinct-driven)
- **Primary:** Untamed, Guardian (occasional), Evasive (occasional)
- **Set-Specific:** Oathsworn (Verdant Pact)
- **Access:** Cleave, Hit & Run (rare), Ranged

### Bard
- **Primary:** None exclusive
- **Access:** Vocal Constructs (Chant, Song)

### Rogue
- **Primary:** Poison, Acrobatics, Evasive, Hit & Run, Scavenger
- **Access:** Physical Constructs (Trap)

### Doom-Whisperer
- **Primary:** Coercion, Dismayed
- **Access:** Vocal Constructs (Utterance, Dirge), Evasive (occasional)

### Builder
- **Primary:** Reinforce, Dismantle, Guardian (occasional)
- **Access:** Physical Constructs (Fortification, Trap)

---

## NOTES

- **Anchor Counters:** All Constructs enter with Anchor counters; remove one at the beginning of each turn; sacrifice when last removed
- **Weapon Supertypes:**
  - One-Handed: Standard weapons, allow use of Magic Actions
  - Two-Handed: Powerful weapons, prevent use of Magic Actions while equipped
- **Action Supertypes:**
  - Physical Actions: Combat maneuvers, tactical moves, equipment interactions
  - Magic Actions: Spells, incantations, elemental effects
- The supertype determines whether a Two-Handed weapon prevents the action from being played
