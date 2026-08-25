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
- **Rules Note (ruled 2026-08-23) — UNTAMED is KEYWORD-INDEPENDENT.** Untamed is a property of the ENCOUNTER, not a property conferred by this keyword: whenever there are no Gear and no Physical Constructs in the encounter, *every* character is Untamed, and a card may ask whether a character is Untamed without that character printing UNTAMED. This keyword's only job is to attach a per-card bonus to the state. Ruled to resolve Elder Shellback (dev deck dd000066), which prints GUARDIAN and OATHSWORN and reads "When this character enters the encounter, if it is Untamed, …" — its printed keyword array is CORRECT as authored and no card face changed. Consistent with the 2026-08-18 ENCOUNTER-wide ruling above: a condition scoped to the encounter cannot also be gated per-character. Engine: one derived predicate, `isUntamedEncounter` (src/engine/stats.ts), read live and never stored. Two bonus shapes are supported — a *continuous* one re-read on every stat/keyword read (the five static carriers), and an *entry snapshot* read exactly once when an enters-trigger resolves and never re-evaluated afterwards (Elder Shellback; an encounter that clears later places nothing retroactively).

### Paladin Keywords

**INSPIRE** - As long as one or more permanents with Inspire are in the encounter under your control, you are Inspired.

**INSPIRED** *(state, not a card keyword)* - An Inspired player has +1 Willpower. Inspired does not stack.
- Binary state, not cumulative
- Applied to players, not characters
- **Rules Note (ruled 2026-08-18):** A player who is both Dismayed and Inspired nets to zero — their current Willpower is the plain Class-Zone card count. Stated explicitly here so it is never re-derived.
- **Rules Note (ruled 2026-08-18):** Inspire reads YOUR OWN board; Dismay reads your opponent's. The two are mirror-inverted in both direction and sign — "under your control, YOU are Inspired" against Dismay's "under your control, your OPPONENT is Dismayed."
- **Rules Note (owner-ruled 2026-08-25) — Bard ACCESS to Inspire.** Inspire remains a Paladin evergreen keyword, and Bards now have access to it (rallying through performance rather than conviction). Access only — the definition, the Inspired state, and all rulings above are unchanged; the keyword works identically on a Bard permanent. Recorded in the Keyword Summary by Class below and Card_Design_Parameters §28. (Taken during the Requiem dev-deck design, where Bard's retired Initiative left the class without a signature evergreen presence.)

### Bard Keywords
*(Section added 2026-08-25, owner-ratified during the Requiem dev-deck design. Bard previously held no class keywords — its listed evergreen "Initiative" was stripped from the game and remains banned.)*

**CRESCENDO** - While you control a Vocal Construct in the encounter, your characters are in Crescendo. Per-card text defines the bonus granted while in Crescendo.
- **Rules Notes (owner-ruled 2026-08-25):**
  - Deliberate parallel to UNTAMED (the same keyword shape, ruled 2026-08-23): Crescendo is a property of the BOARD STATE, not a property conferred by the keyword. Whenever you control a Vocal Construct, ALL your characters are in Crescendo; a card may ask whether a character is in Crescendo without printing CRESCENDO. The keyword's only job is to attach a per-card bonus to the state.
  - Unlike Untamed's encounter-wide scope, Crescendo is CONTROLLER-scoped by design — it is powered by your own performance. Your opponent's Vocal Constructs do not put your characters in Crescendo.
  - Any Vocal Construct you control satisfies the condition, including one that itself carries a Crescendo bonus (it is a Vocal Construct you control; the plain reading holds).

**REPRISE** - When this Vocal Construct would be sacrificed because its last Anchor counter was removed, return it to your hand instead.
- **Rules Notes (owner-ruled 2026-08-25):**
  - Scope: ANY last-counter removal — start-of-turn Anchor decay and effect removals (Dismantle and the like) alike. This falls directly out of the 2026-07-15 unified sacrifice family ("anchor decay reaching zero IS a sacrifice — as is any anchor-removal effect reducing a construct to zero"): the two events are canonically the same sacrifice, so Reprise replaces both, with no timing carve-out.
  - The construct LEAVES the encounter but does NOT die: the sacrifice is replaced, so no sacrifice/death event occurs, the card never touches the Dead Zone, and "when … is sacrificed / dies" listeners stay silent. Leave-triggers (generic "when this leaves the encounter") do fire.
  - No Manifest collision is possible: Animate Magic applies to Magic Constructs only and Reprise is a Vocal Construct keyword, so the two replacement effects can never sit on the same permanent.
  - Reprise reads sacrifice-by-anchor-removal ONLY. A Reprise construct sacrificed by any other means (a sacrifice cost, Coercion, an effect saying "sacrifice a permanent") dies normally.

### Necromancer Keywords
*(Section added 2026-08-25, owner-ratified during the Requiem dev-deck design. Necromancer previously held no class keywords beyond occasional Scavenger access.)*

**HAUNT** - When this companion dies, if it had no Memory counters on it, return it from your Dead Zone to an empty Command Zone slot you control, exhausted, with a Memory counter on it.
- **Rules Notes (owner-ruled 2026-08-25; REWORKED same day after the first playtest):**
  - **Renamed and reworked from the same-day "RESTLESS" draft before any implementation.** The rework (owner): the once-per-card state needed a physical tracker, and the MEMORY COUNTER is it — emblematic of the return itself. The returned body comes back MARKED, and a companion that is put into the Dead Zone with a Memory counter on it stays there: Haunt does not return it again.
  - Theme: on this world the dead linger as remembered things — what Haunt returns is the MEMORY of the companion. When the memory dies, it is forgotten for good.
  - The death fully happens FIRST (unchanged): death/sacrifice listeners fire, attached items open their transfer windows per the normal exit rules, and the card genuinely touches its owner's Dead Zone — THEN the return resolves. (Consistent with "everything in the Dead Zone died to get there.")
  - A FLEE triggers Haunt (unchanged): fleeing is a sacrifice and a sacrifice is a death (2026-07-20). The returned companion re-enters exhausted; if its Level still exceeds its controller's Willpower it will simply flee again at the next check — self-balancing, no carve-out.
  - The return is an ENTER (unchanged): enter-triggers fire, and the willpower gate applies as normal to a companion that just entered (it additionally enters exhausted).
  - **PER-STINT tracking** *(supersedes the earlier once-per-game reading — owner-ruled this date)*: Memory counters follow standard counter physics and cease when the card changes zones, so the whole check lives at the moment of death — "did it have a Memory counter on it when it died?" A card later returned by an OUTSIDE effect (reanimation) arrives clean and can Haunt-return again.
  - **NO SLOT OPEN** *(supersedes the earlier "spent" ruling — owner-ruled this date)*: if no empty Command Zone slot exists at the moment of return, the return simply does not happen and NO Memory counter is placed — Haunt remains available at the companion's next death. (The counter formulation removes the tracking burden that motivated "spent".)
  - Owner-routing (unchanged): the card returns from its OWNER's Dead Zone to a slot its owner controls — consistent with the 2026-08-17 rule that burial and rescue belong to the owner even when control was stolen at the time of death.
  - **Universal counter principle applies** (the Armor/Poison family, 2026-08-18): a Memory counter is a Memory counter however it arrives. An effect that places a Memory counter on a living companion pre-marks it — it will not return via Haunt. Design space deliberately opened ("fix them as a mere memory").
  - **Memory counters are a GENERAL resource, not Haunt's private marker (owner-flagged 2026-08-25):** future cards will place Memory counters on permanents (possibly as a Siblari ability) and key effects other than Haunt off them. Haunt is their FIRST consumer, never their owner — engine and card design must treat the counter as game-wide vocabulary (they may sit on constructs as well as companions), and no future mechanic may assume a Memory counter implies a Haunt return.

**ENTOMB N** - When this enters the encounter, put the top N cards of your deck into your Dead Zone.
- **Rules Notes (owner-ruled 2026-08-25):**
  - Your OWN deck — Entomb is self-mill as fuel for Dead Zone recursion, not opponent disruption.
  - Fewer than N cards remaining: put all remaining cards (standard partial-mill behaviour).
  - The milled cards are ordinary Dead Zone residents — face-up, public, and recoverable by recursion effects; nothing distinguishes an Entombed card from one that died.
  - *(Naming note, 2026-08-25: briefly drafted as "Exhume N" during this session and renamed before any card was authored — to inter/entomb is to bury, which is what the keyword does; "exhume" (to dig out) is reserved as design space for a future dig-OUT mechanic.)*

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
- **Primary:** Haunt, Entomb N *(both added 2026-08-25; Haunt reworked from "Restless" the same day)*, Scavenger (occasional)
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
- **Primary:** Crescendo, Reprise *(both added 2026-08-25)*
- **Access:** Inspire *(owner-ruled 2026-08-25 — see the Paladin Inspire entry)*, Vocal Constructs (Chant, Song)

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
