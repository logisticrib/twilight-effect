# The Twilight Effect — Rules Taxonomy

## Purpose

This document organizes the game's philosophy, design elements, and rules into a six-tier hierarchy showing how each rule depends on the choices and principles upstream of it. It exists to support **rules development, problem diagnosis, and lever identification** — not as a user-facing rules reference and not as comprehensive coverage of every rule the game contains.

When a rules question arises, the taxonomy answers:

- *What does this rule depend on?* (look upstream)
- *What depends on this rule?* (look downstream)
- *If I change this, what else breaks or needs revisiting?* (the dependency cascade)
- *Is this a load-bearing commitment or a free-to-tune lever?* (the tier itself)

## How to Read the Tiers

| Tier | What it contains | Cost of changing |
|------|------------------|------------------|
| **1 — Philosophy** | The *why* the game exists. Irreducible motivating convictions. | Highest. Changing means designing a different game. |
| **2 — Philosophically-driven Design Elements** | Elements forced by Tier 1. The philosophy demands *some* form of these. | Very high. Cuts at the structure that delivers the philosophy. |
| **3 — Design Choices** | Chosen among coherent alternatives. The philosophy permitted multiple paths; these are the ones picked. | Real. Touching them ripples into many lower-tier rules. |
| **4 — First-order Rules** | Direct consequences of Tier 3 choices. Mostly clustered by domain rather than enumerated. | Moderate. Many are tunable values or local-to-cluster rules. |
| **5 — Second-order Rules** | Rules that exist because of how other rules interact — edge-case resolutions, tiebreakers, timing rules. | Variable. These are where unintended consequences hide. |
| **6 — Conventions** | Genuinely arbitrary. The inverse would be equally coherent. | Lowest. Free to flip. |

A rule that *feels* arbitrary often turns out to have second-order effects when examined. Real conventions are mostly about how state is *displayed* rather than how state *behaves*.

---

## Tier 1 — Philosophy

The irreducible *whys* underlying the project. These are claims about what the game is for and what it is responding to. Drawn from the original rulebook's intro and themes sections, with the design-methodology entries removed (those don't belong in a tier about the game itself).

### 1. Recapture pre-internet TCG joys

Surprise when opening packs, discovery of combinations, trading without perfect information, decks perfected through trial and error, and a metagame that evolves naturally rather than being solved within weeks of release. The internet flattened information asymmetry; the game is a response to that loss.

### 2. Reject profit-over-experience industry patterns

Consolidation, overprinting, ban/print cycles, shallow worldbuilding, and the removal of beloved mechanics in the name of broader accessibility — the game is made in opposition to all of that. It's for love of the format, not for mass-market ease.

### 3. Restore depth and challenge

Modern TCGs have hollowed out punishing or complex mechanics to chase new players. This game is unapologetically for players who want that depth back.

### 4. Classic fantasy as RPG encounter

Goblins, elves, magic, enchanted artifacts, RPG-class characters — tropes taken seriously rather than subverted or modernized. Each game feels like a turn-based encounter from a tabletop RPG: the player is a leader of a party, the player character matters, companions matter, items attach to people.

---

## Tier 2 — Philosophically-driven Design Elements

Elements that are forced by Tier 1: if absent, the philosophy isn't being honored. The specific *form* may be a chosen one, but *something of this kind* must exist.

### 1. Unique cards

No duplicates ever printed; every card one-of-one. Honors the recapture-what-was-lost axioms by making netdecking impossible, pack openings genuinely surprising, trading subjective, and metas unsolvable at the card level.

### 2. Digital-first delivery, with physical as a secondary channel

Derived from #1: uniqueness at TCG scale requires procedural generation, persistent state, automated enforcement, and real ownership infrastructure — all of which presuppose digital. Print-on-demand exists because cards-as-objects matter, but the primary medium is digital because that's what makes uniqueness executable. Many downstream design choices (timing simplicity, trackable stakes, computed game states) only make sense given this commitment.

### 3. Real stakes on match outcomes

Originally ante; currently scatter. Combats concede-culture and restores the seriousness older TCGs had — quitting must cost something. Originally one of the strongest expressions of two axioms simultaneously (vintage feel and restored depth), adapted under legal constraint.

> **Note:** Scatter is the legally-viable adaptation of ante. The philosophy still wants ante; the implementation can't deliver it under current jurisdictional gambling law. If gambling law changed, ante might come back. The Tier 2 entry remains; the Tier 3 implementation could change.

### 4. RPG-encounter architecture

Player character, companions forming a party, items that attach to characters, hard class identities. One commitment to the structure of a tabletop RPG combat encounter, not separate elements.

### 5. Structural prevention of degenerate play

The rules themselves prevent broken loops, infinite combos, and runaway states, rather than relying on bans or errata after the fact. A direct refusal of the modern industry pattern Tier 1 #2 rejects.

### 6. Worldbuilding in the classic fantasy tradition

The setting genuinely participates in the LOTR/D&D/early-MTG lineage — recognizable archetypes, magical artifacts, fantasy races, RPG classes — taken seriously rather than ironized or modernized.

---

## Tier 3 — Design Choices

Twenty-five entries across architecture, mechanical systems, and game procedure. Each entry shows what Tier 2 element(s) it derives from, making the dependency chain visible.

### Architecture

#### 1. Two-player game

Derives from Tier 2 #4 (RPG-encounter architecture). The encounter feel could in principle support multiplayer, but two-player keeps the focus on the leader-vs-leader structure and avoids the political/diplomatic complications of three-plus-player TCGs.

#### 2. Class access expressed through a dedicated zone (the Class Zone)

Derives from Tier 2 #4 (hard class identities). Classes need to be enforced somehow during play. The Class Zone is one specific implementation: a small, persistent, public zone whose contents both gate which classes a player can play from hand and serve as the stakes for scatter. Alternatives existed — class could be locked at deck-build, expressed through a leader card, or determined by majority class in deck — and the Class Zone was chosen.

#### 3. Stakes implemented through Class Zone scatter rather than full-collection ante

Derives from Tier 2 #3 (real stakes). The choice is that the *Class Zone specifically* is what's at stake, not the whole deck or the whole collection. This concentrates the risk on cards the player has actively committed to play — which both serves the philosophy and keeps the legal-adaptation tractable.

#### 4. Spatial battlefield with Front and Back lines

Derives from Tier 2 #4 (RPG-encounter architecture). RPG encounters have positioning. The choice is to abstract that into Front/Back rather than a full grid. The number of slots per line is a tuned value (Tier 4); the existence of position is the Tier 3 choice.

#### 5. Sorcery-speed only — no instant interaction

Derives from Tier 2 #2 (digital-first). Instant-speed interaction creates priority-passing UX problems in digital play and slows tempo. Sorcery-speed-only also enables clean asynchronous play, which is structurally valuable. A real design choice — most TCGs allow some response window — and one this game has committed to.

#### 6. AI-generated content with narrative absorption of inconsistency

Derives from Tier 2 #1 (unique cards) and Tier 2 #2 (digital-first). Uniqueness at scale forces some kind of generative pipeline; AI is the chosen method. AI inconsistency is then absorbed by the worldbuilding — the tidally locked planet, perpetual twilight, the fungal memory network. This is *one* solution to the inconsistency problem; rule-based procedural generation, curated human generation, or different worldbuilding framing were possible alternatives.

> **Note:** The worldbuilding does much more than absorb AI inconsistency — it generates the lighting reference system, regional ecology, faction politics, class cultural origins, the Blight as a narrative threat, and many other elements. AI absorption is one job among many, and is partially handled upstream by the master prompt and review workflow as well. A standalone worldbuilding entry may eventually warrant its own Tier 3 entry independent of this one.

#### 7. Player character generated from a randomly-sequestered deck card at setup

Derives from Tier 2 #5 (structural prevention) and Tier 2 #4 (RPG-encounter architecture). One card is drawn from the deck at setup, set aside face-down for the game's duration, and serves as the player character on the battlefield (HP carrier, equipable, positioned, attackable). Its identity is hidden from both players and never revealed; its card-level stats are mechanically irrelevant.

The mechanic introduces structural variance into deckbuilding: one card per game is randomly inaccessible. Inspired by Pokémon's prize card system, applied to a unique-card environment where the consequences are sharper — there are no duplicates to fall back on. The mechanic doesn't forbid any strategy; it forces deckbuilders to account for probabilistic inaccessibility, which pushes design toward redundancy via flexible alternatives, raises the value of tutor effects, and shapes how heavily to lean on individual game-winning cards. The RPG-encounter feel is genuine but secondary to the deckbuilding-variance function.

### Mechanical Systems

#### 8. No resource accumulation system

Derives from Tier 2 #4 (RPG-encounter architecture). RPG combat doesn't have a mana pool that grows turn over turn — characters use abilities based on capability and circumstance. The choice is to honor that feel rather than import the mana convention from MTG-lineage TCGs. Multiple coherent alternatives existed (mana, energy, momentum, cooldowns); no-resource was chosen.

#### 9. Plays gated by Willpower (Class Zone size) rather than by cost

Derives from #2 (Class Zone) and #8 (no resource accumulation). With no mana costs, something has to gate which cards can be played when. Class Zone size — Willpower — is the answer: the maximum Level of cards a player can play from hand equals their Willpower. Companions whose Level exceeds the player's Willpower flee at start of turn. Activated abilities of permanents check Willpower at activation time.

#### 10. Action economy as the per-turn play-volume cap

Derives from Tier 2 #5 (structural prevention) and #8 (no resource accumulation). Without mana costs, nothing inherently limits how many cards a player can play per turn. The action economy (Move/Minor/Major/Special per character) is the chosen structural cap. Alternatives existed — a flat "play N cards per turn" rule, a per-card cooldown system — and the per-character action structure was chosen because it integrates with the RPG-encounter feel (each party member acts).

#### 11. Per-character activation rather than abstract turn-actions

Derives from Tier 2 #4 (RPG-encounter architecture) and #10 (action economy). The action economy attaches to *characters*, not to the player as an abstract agent. Each companion and the player character get their own actions per turn, activated one at a time. This is the mechanical expression of "the player leads a party of individuals" rather than "the player is a single agent who plays cards."

#### 12. Special Actions as a Player-Character-only budget tracked via Class Zone face-up state

Derives from #10 (action economy) and #2 (Class Zone). Once per-character activation exists, the Player Character needs an action type that companions don't have — the ability to summon companions, deploy constructs, and execute leader-level plays. Special Actions fill this role; the budget equals Willpower (Class Zone count, with face-up cards available); face-up/face-down is the chosen tracking mechanism, with alternatives (rotation, fading, counters) sitting at Tier 6.

#### 13. Loadout as a fixed-slot equipment system attached to characters

Derives from Tier 2 #4 (items attach to characters). The choice is the *shape* of attachment: a small fixed number of slots per character, rather than unlimited attachment or a single equipment slot. Two-weapon companions enable Combo Attacks; the asymmetry between Player and Companion slot counts is intentional and tuned.

#### 14. Two-handed weapons block magic actions

Derives from #13 (loadout) and Tier 2 #6 (classic fantasy worldbuilding). The choice expresses a fantasy-trope idea: a character wielding a great weapon with both hands cannot also be casting spells. It's a thematic constraint that creates a meaningful build trade-off rather than a balance lever.

#### 15. Combat resolves through Front/Back targeting with Guardian, Ranged, and Evasive as exceptions

Derives from #4 (Front/Back battlefield). Once you have spatial position, you need targeting rules. The choice: Front Line must be targeted before Back Line, with three exception keywords carving out the canonical fantasy-combat patterns (a guardian protects the line; a ranged character attacks from the back; an evasive attacker bypasses defenders). Alternatives existed — open targeting, position-based attack/defense modifiers — and the must-target-Front-first rule was chosen.

> **Note (2026-07-17):** Gloss tightened. RANGED is offensive only — canon: "This character can attack from the Back Line" — so it lets its bearer attack FROM the Back Line; it grants no reach INTO the opponent's Back Line and no targetability on its bearer (the defender-side reading that briefly appeared in the rules docs was excised as a documentation error on 2026-07-16).

#### 16. Damage is cumulative on companions; companions don't heal at end of turn

Derives from Tier 2 #4 (RPG-encounter architecture). The choice between cumulative damage (HP persists, healing is intentional) and ephemeral damage (damage clears at end of turn, MTG-style) is real and load-bearing. Cumulative damage matches RPG-encounter feel — wounds persist, healing is a real action — and creates strategic depth around protecting wounded characters.

> **Note:** This is the kind of Tier 3 decision that, if reversed, would force redesign of nearly every card in the game. Not as cheap to revisit as most Tier 3 entries.

#### 17. Exhaustion as the universal "this character has acted" indicator

Derives from #11 (per-character activation). Once characters activate individually, you need a state indicator showing whether a character has used their actions this turn. Exhaustion (rotating the card 90°) is the chosen indicator. The choice extends to player characters — they can be exhausted by weapon attacks, following the same rule as companions.

#### 18. Triggered abilities resolve in opposite order to triggering; simultaneous triggers ordered by active player

Derives from Tier 2 #5 (structural prevention) and #5 (sorcery-speed only). With no instant-speed interaction, the only point where one ability can interrupt another is during trigger resolution. The chosen resolution order is LIFO (last-in-first-out, reverse of triggering); the chosen tiebreaker for simultaneous triggers is "active player decides." Both are conventional in TCGs but were real choices.

### Card Types, Classes, and Game Procedure

#### 19. Four card types: Companion, Item, Construct, Action

Derives from Tier 2 #4 (RPG-encounter architecture). The choice to organize cards into these four categories specifically — rather than three (creatures/spells/artifacts), or five (with separate enchantment-equivalents), or a flat-spells-only system — comes from the RPG-encounter logic. Companions are the party, Items are equipment, Actions are abilities used in the moment, Constructs are temporary battlefield states (traps, summoned effects, sustained performances). The boundaries between types — that Items must attach, that Constructs are non-attached, that Actions don't persist — are part of this choice.

#### 20. Constructs are temporary, expiring via Anchor counter decay

Derives from #19 (card types) and the philosophical commitment to permanents-with-persistence-having-different-character-from-momentary-effects. The choice that Constructs *degrade* rather than persist is Tier 3 — they could have been permanent, or duration-based, or sacrifice-on-condition. Anchor counters that decrement at start of turn was the chosen implementation.

#### 21. Ten classes: Wizard, Rogue, Warrior, Sorcerer, Paladin, Druid, Bard, Builder, Doom-Whisperer, Necromancer

Derives from Tier 2 #4 (hard class identities) and Tier 2 #6 (classic fantasy worldbuilding). The roster is a specific creative choice — the standard fantasy/RPG core (Wizard, Warrior, Rogue, Paladin, Druid, Bard, Sorcerer, Necromancer) plus two original additions (Builder, Doom-Whisperer) that extend the palette into the worldbuilding's specific themes. Could have been seven, twelve, fifteen — or a different mix entirely.

#### 22. Two win conditions: HP-to-zero, and deck-out

Derives from Tier 2 #4 (RPG-encounter — HP-to-zero is the encounter ending) and Tier 2 #6 (classic fantasy / early-MTG tradition — deck-out is the inheritance from that lineage). Either alone would work; having both is a choice that protects against stall-out games and adds a secondary strategic axis.

#### 23. Class bonuses applied once at game setup

Derives from #21 (ten classes) and Tier 2 #4 (hard class identities). The choice is to express class identity partly through a one-time setup effect — each class doing something distinctive before turn 1. Alternatives existed: recurring class abilities, passive class auras, or no class bonuses at all. The setup-only choice keeps class identity present without creating per-turn complexity.

#### 24. Mulligan procedure: Class Zone and hand mulliganed together, with increasing cost

Derives from #2 (Class Zone) and Tier 2 #5 (structural prevention). Because the Class Zone determines what you can play, mulliganing only the hand or only the Class Zone would create lopsided incentives. Tying them together forces a holistic decision. The increasing cost (cards bottomed equal to mulligans taken) is the chosen anti-abuse mechanism. Alternatives existed (London mulligan, Vancouver scry, free first mulligan); this is the chosen procedure.

#### 25. Sideboard as the structural complement to scatter in match-format play

Derives from Tier 2 #3 (real stakes / scatter system) and Tier 2 #1 (unique cards). Match-format play (tournaments, best-of-N matches, both digital and paper) requires a way for players to rebuild legal decks between games when cards have scattered. The sideboard is the chosen replacement mechanism. Players commit to a main-deck-plus-sideboard pool at match start; in digital matches this is a deliberate subset of the player's broader collection, mirroring paper's physical sideboard. Practice and quick games operate without sideboards.

The sideboard also serves a secondary function familiar from conventional TCGs: deliberate strategic adjustment between games. Although unique cards prevent card-level meta-gaming, archetype-level meta exists — common abilities, class tendencies, and strategic patterns are recognizable, and sideboarding against them is meaningful play.

> **Pattern note:** The taxonomy reveals a recurring move — taking a familiar TCG element (Ante, Sideboard), keeping the name for player legibility, and repurposing it to fit the actual design needs. This is worth being aware of when borrowing terminology from other TCGs: the name suggests a function the rule may not actually perform here.

---

## Tier 4 — First-order Rules (clustered)

Direct consequences of Tier 3 design choices, organized by domain rather than enumerated. Each cluster is a place to look when a diagnostic question arises in that domain. Specific rule text and tuned values live in the canonical rules document; this tier maps where they sit and what they depend on.

### 1. Tuned starting values

Starting HP, starting hand size, deck size, Class Zone bounds (min/max and starting count), sideboard size, scatter recovery duration. Each is a tunable lever. Touching any of these has cascade effects on game length, deckbuilding feel, and the relative value of cards at different Levels.

### 2. Turn structure and phase ordering

Five-phase turn (Ready → Draw → Action → Activation → End) with specific events resolved in each phase. The phase structure is largely forced by Tier 3 #10 (action economy) and #11 (per-character activation), but specific ordering and the placement of triggers within phases is tunable. Common diagnostic question: *"when exactly does X happen?"* — answers live here.

### 3. Action types and their costs

Movement, Minor, Major, Special — what each permits, how each interacts with exhaustion, and the per-character/per-turn limits. Direct consequence of Tier 3 #10 and #12. Combat resolution and ability activation both flow through this cluster.

### 4. Card type behavior rules

How Companions, Items, Constructs, and Actions enter, persist, and leave play. Includes Item attachment rules, Construct anchor decay, Action resolution-then-discard, and Companion-leaves-play-with-its-items rules. Direct consequence of Tier 3 #20.

### 5. Combat resolution

Targeting sequence (Guardian → Front/Back positioning → Player choice), damage assignment, simultaneous damage handling, zero-HP processing. Direct consequence of Tier 3 #15.

### 6. Willpower-driven gates and checks

Companion fleeing when Level > Willpower, activated abilities checking Willpower at activation, attack-blocking when Level > Willpower. Cluster of consequences from Tier 3 #9.

### 7. Exhaustion mechanics

What triggers exhaustion (attack, activated ability, weapon use, certain effects), what exhaustion prevents, when characters return to ready. Direct consequence of Tier 3 #17.

### 8. Keyword library

The set of common keyworded abilities that appear on cards (Guardian, Evasive, Ranged, Zealous, Kindred, Unity, Immunity, Scavenger, Oathsworn, Untamed, etc.). Defined in `Master_Keyword_List.md`. Each keyword is a direct or second-order consequence of some upstream rule (Guardian and Evasive flow from Tier 3 #15; Zealous flows from Tier 3 #9; etc.). Treated here as a category; specifics live in the keyword document.

### 9. Class bonuses

The set of one-time setup effects per class. Direct consequence of Tier 3 #23. Specific bonuses are a tuning surface — each can be revised independently without touching the higher tier.

### 10. Mulligan procedure specifics

The exact bottom-of-deck cost progression, the both-or-neither rule, mulligan timing during setup. Direct consequence of Tier 3 #24.

### 11. Win and loss processing

How HP-to-zero is detected, how deck-out is detected, simultaneous-condition tie handling. Direct consequence of Tier 3 #22.

### 12. Zone transition rules

When and how cards move between zones (Hand, Play, Dead Zone, Class Zone, Loadout, Deck). Includes orphaning rules for items when their host leaves play, the no-empty-Class-Zone rule, and discard/mill mechanics.

### 13. Deck construction rules

Fixed deck size, sideboard composition rules (size, class-matching guidance, off-class permission), no banned-cards system. Direct consequence of Tier 3 #25 and #21.

---

## Tier 5 — Second-order Rules

Rules that exist because of how other rules interact — edge-case resolutions, tiebreakers, timing rules. These are where unintended consequences hide and where most live diagnostic work happens. Each entry shows its two upstream dependencies.

### 1. Two-handed weapons block magic actions

Depends on Tier 4 #3 (action types — specifically Magic actions as a subcategory) and Tier 4 #4 (Item attachment, specifically the loadout slot rules). The rule exists because both action subtypes and weapon slot mechanics exist. If either upstream rule changed, this rule would need re-derivation.

### 2. Combo attacks for two-weapon characters

Depends on Tier 4 #4 (loadout rules permitting two weapons) and Tier 4 #3 (Major action structure, since the Combo Attack consumes a single Major action). The rule is an emergent consequence of having two weapon slots — the choice to make Combo Attacks a single-action two-strike rather than two separate actions is the second-order rule.

### 3. Items orphan to Dead Zone when host leaves play, or reattach if a valid slot exists

Depends on Tier 4 #4 (Item attachment requires a host) and Tier 4 #12 (zone transitions). The rule exists because items must always reference a valid character slot — no free-floating equipment — combined with the rule that hosts can leave play. The "or reattach" branch is the part most likely to be revisited; the "go to Dead Zone" branch is forced by the no-free-floating principle.

### 4. The no-empty-Class-Zone rule

Depends on Tier 4 #6 (Willpower-driven gates) and Tier 4 #12 (zone transitions). With Willpower of 0, you can play nothing, which would soft-lock the game. The rule that no effect can remove the final Class Zone card is a backstop. It's a second-order rule because it exists to prevent a degenerate state that the upstream rules permit.

### 5. Companion fleeing on Willpower drop mid-game

Depends on Tier 4 #6 (Willpower checks) and Tier 4 #12 (Class Zone changes mid-turn via player action or card effect). If you remove a Class Zone card mid-game and your Willpower drops below a Companion's Level, the Companion flees at the start of your next turn — this is the timing rule for handling Willpower changes that happen between checks.

### 6. First-turn-no-Major-actions for the player going first

Depends on Tier 4 #2 (turn structure) and Tier 4 #3 (action types). This is balance scaffolding that exists because player 1 has a first-mover advantage in unrestricted play. Second-order because it's resolving an asymmetry created by the turn structure itself.

### 7. Class bonuses don't trigger triggered abilities at setup

Depends on Tier 4 #9 (class bonuses) and Tier 4 #2 (turn structure — specifically, that triggered abilities require the game to be in a triggering state). Class bonuses occur during setup, before turn 1, when the game state isn't yet "live" for triggers. Second-order because it's a timing rule resolving when triggers do and don't fire.

### 8. Mulligan-bottoming cap (cannot mulligan if you'd bottom more cards than you have)

Depends on Tier 4 #10 (mulligan procedure) and Tier 4 #1 (starting hand size). The rule exists to prevent a player from mulliganning so many times that they'd have to bottom more cards than they're holding. Second-order because it's an edge-case resolution within the mulligan procedure.

### 9. Order of resolution for simultaneous triggers — active player decides

Depends on Tier 3 #18 (trigger resolution order — opposite of triggering) and Tier 4 #2 (turn structure, defining the active player). The simultaneous-trigger rule is the tiebreaker for when LIFO ordering doesn't apply.

### 10. Activated abilities of items can be played immediately; companions need a Willpower check first

Depends on Tier 4 #4 (item rules) and Tier 4 #6 (Willpower checks for companions). Items don't have the Willpower-check-on-arrival requirement that companions do — this asymmetry is a second-order rule resolving how the two card types interact with the Willpower system differently.

---

## Tier 6 — Conventions

Genuinely arbitrary rules that could be flipped without forcing changes anywhere else. Most are presentation/representation choices rather than mechanical rules. The cheapest place in the taxonomy — these are levers you can pull during playtesting without ripple effects.

### 1. Card rotation for exhaustion (90° to indicate exhausted state)

Could be 45°, 180°, sliding the card forward, dimming in digital, a counter, a token. The information conveyed is "this character has acted" — the visual representation is arbitrary.

### 2. Class Zone face-down indicator for spent Special Actions

Could be flipping, rotating, a counter, fading in digital, a dial. The count matters; the representation doesn't.

### 3. Determining first player

Currently random/coin flip, with the loser of the previous game choosing in best-of-three. Could be high-roll-on-dice or any number of alternatives. The choice has to exist; the specific method is arbitrary.

### 4. Anchor counter representation

Currently dice or counters in paper play. Could be tokens, marks on the card sleeve, an in-app number. Pure tracking convention.

### 5. Ordering of self-controlled simultaneous triggers

When multiple of *your own* triggers fire at the same time, you order them as the active player. The active-player-decides rule is locked at Tier 5; *which order you actually pick* is up to you each time.

### 6. Class Zone visual layout

Horizontal strip vs. vertical strip vs. fan vs. grid. Affects nothing mechanically.

### 7. Card-back design and orientation conventions

Whether decks face one direction, sleeve color requirements, etc. Pure presentation.

### 8. Visual representation of the player character on the battlefield

Currently the sequestered face-down card serves as the on-field token. Could be a placeholder card, a custom art card, an in-game purchased "champion" miniature, or a digital avatar — anything that doesn't compromise the hidden-identity requirement of the sequestered card itself.

---

## Maintenance Notes

- **Counts:** Tier 1: 4 entries. Tier 2: 6 entries. Tier 3: 25 entries. Tier 4: 13 clusters. Tier 5: 10 entries. Tier 6: 8 entries.
- **A rule can move between tiers** as the design evolves. Conventions can become Tier 5 if new cards reference them. Tier 5 rules can be promoted to Tier 4 if their dependencies become more direct.
- **The pattern of repurposed TCG inheritances** (Ante/Scatter, Sideboard) is worth watching: when borrowing terminology from other TCGs, the imported expectations may not match this game's actual function. Worth flagging in card design review.
- **Tier 3 entries with weaker derivations** are the ones most open to revisiting: #14 (two-handed-blocks-magic) and #6 (AI generation specifically) have soft links to Tier 2 and could be challenged.
- **Tier 3 entries that are expensive to revisit** despite being "design choices": #16 (cumulative damage), #19 (four card types), #21 (ten-class roster). Changes here would force broad card-pool work.
- **Open audit tasks** flowing from the current overhaul:
  - Trigger constraints in card design parameters (section 14) should be re-examined now that draw is being broadened.
  - Cards in the existing playtest pool that reference Initiative state need to be identified and revised or retired, since Initiative no longer exists as a mechanic.
