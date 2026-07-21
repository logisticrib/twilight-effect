# The Twilight Effect — Engine Hand-off

Self-contained context for continuing the card-effect engine work in a fresh session.

## Latest session (2026-07-21, addendum) — replacement fixtures COMMITTED, nothing owed
- **`3c8ee3f`: owner recorded t8 (269 entries) + t9 (362 entries) on `988e5d3`** — correct
  stamps, format 3, demotions [], both replay clean; suite 40 files-worth / 393 tests green.
  Both games run Convergence Sigil / Library of Memory / Siegeworks / Memory Stone boards,
  so the last-gasp + ready-phase-sacrifice territory now sits INSIDE the replay net (no
  Manifest boards yet — an animated-Manifest game remains a dream-recording item, not a
  debt). **Replay coverage: t3 + t8 + t9. The last-gasp session's two owed re-recordings
  are SETTLED; nothing owed.**

## Previous session (2026-07-21, final) — RE-RULE: Fleeing is a SACRIFICE (owner 2026-07-20)
**Suite: 39 files / 389 tests green; tsc ZERO; validate:decks clean. LOCAL session, behavior
change.** A fleeing companion (Level > current Willpower at turn start) is SACRIFICED — it
dies with everything death means. SUPERSEDES the arc-5 audit's non-sacrifice classification
of flee (b7eb834 era). **No test ever pinned flee-fires-nothing** — the classification lived
in the audit record and GRU's sacrifice-events note; the note is AMENDED dated, the audit
record stays as history, and these are the first flee-event pins (retire-and-rewrite
satisfied at the actual sites the classification lived).
- **OWNER DESIGN NOTE (recorded, NOT implemented):** the owner briefly considered fleeing
  REMOVING the card from the game entirely; ruled sacrifice FOR NOW — the removed-from-game
  idea is PARKED on the design-revisit list (PROJECT_STATE) so it isn't lost.
- **Engine (readyPhase.ts):** fled companions join the same Ready Phase sacrifice machinery
  as decay (the `sacrificed` list): death/destroy triggers fire first (Memory-Stone bearer
  arms its recovery pick via the dead-pick sink), then on-sacrifice listeners gathered from
  the event-time pre-removal board. IMPLEMENTATION-SHAPE NOTE: the brief said "routes
  through destroyEntity" — encoded as the module's batch loop applying destroyEntity's
  machinery in destroyEntity's documented order with the sacrifice cause (identical
  semantics; keeps decay/flee symmetric and preserves the flagged simultaneity reading —
  same-ready sacrifices hear each other via the shared event board).
- **LISTENER-SCOPE SWEEP: nothing gains coverage.** The schema's ONLY sacrifice listener is
  `ownPhysicalConstructSacrificed` — type-filtered by definition and double-guarded in
  fireSacrificeTriggers (kind check + isPhysicalConstruct). No sacrifice-scoped listener
  without a type filter exists; a fled companion passes through every current filter
  silently. Schema comment amended dated (flee added to the fires-on list).
- **MANIFEST COLLISION DISSOLVED (the c367630 flag):** a decay-surviving Manifest that fails
  the Willpower check is now SACRIFICED — its "if it would leave the encounter, sacrifice it
  instead" clause is satisfied, not contradicted. Pinned. The c367630 surfaced-unruled flag
  is RESOLVED by this ruling.
- **Oathsworn — canon-backed, NO stop needed:** OATHSWORN (verbatim): "When this permanent
  leaves the encounter, return the sworn card to your hand." Death and flee are both leaves —
  the sworn card returns either way (same as destroyEntity's handling). Pinned; text is not
  silent, so nothing to surface.
- **Docs (parent + snapshot hash-identical):** GRU §Companion Fleeing gained the verbatim
  Rules Note (2026-07-20 — fleeing is a sacrifice); the 2026-07-15 sacrifice-events note
  AMENDED dated (flee is a sacrifice, supersession named); the §Dead Zone "exactly as if it
  had been destroyed" line tightened dated (both ready-phase exits ARE sacrifices). CDP's
  flee cluster lines are silent on death-vs-non-death — nothing states otherwise, no change.
- **Pins (`flee_sacrifice.test.ts`, 5):** death triggers fire on flee (Memory-Stone bearer;
  + transfer window per the 2026-07-08 all-exits note); Siegeworks does NOT draw for a flee
  (verbatim scope); Manifest decay-survivor flees into a real sacrifice (triggers included);
  last gasp composes (tick before the flee-sacrifice); Oathsworn sworn-return on flee
  (verbatim canon cited). Poison-before-transfer ordering: existing pin, untouched, cited.
- **Mutations — 3.** M1 fled-not-sacrificed (3 EXACT); M3 sworn-return-dropped (1 EXACT);
  M2 listener-guard-removed predicted 2 failed 3 — HONEST IMPRECISION: the extra was
  anchor_decay_counters pin 5, which watches the SAME guard (proven by the identical
  mutation last session and forgotten in this prediction); consistent, no contamination,
  restores grep-verified.
- **FIXTURE VERDICT — t3 STANDS:** replays clean end-to-end. The re-rule's observable
  footprint needs a fled companion carrying a death-trigger item (Memory Stone is the only
  one shipped) or a listener hearing non-Physical sacrifices (none exist) — t3's clean
  replay proves neither occurs. Nothing newly retired. **TOTAL RECORDINGS OWED: still the
  TWO from the last-gasp session** (t7/t9 replacements, from a server on THIS commit or
  later — server restarted post-commit, stamp verified).
- **Live-verified** (real app, fresh server): level-9 Memory-Stone bearer flees at the ready
  → flee toast, death-trigger prompt ("Memory Stone: Choose a card to return from the Dead
  Zone"), stone buried, transfer window queued.
- **Owner re-uploads:** Game_Rules_Updated.md, HANDOFF.md, tasks/PROJECT_STATE.md.

## Previous session (2026-07-21, latest) — Anchor decay keys on COUNTERS: Manifests are mortal (owner 2026-07-20)
**Suite: 38 files / 384 tests green; tsc ZERO; validate:decks clean. LOCAL session, behavior
change.** Canon ANIMATE MAGIC's "retains its text and Anchor counters" means the counters
remain the permanent's LIFESPAN — an animated Manifest keeps decaying and dies at zero.
- **Docs (parent + snapshots hash-identical):** GRU Ready Phase step 3 REWORDED per the
  owner's verbatim text ("each permanent that has Anchor counters…"; the brief's FROM-quote
  predated the 2026-07-21 flee addendum — addendum preserved, diff noted) + the verbatim
  Rules Note (2026-07-20, decay keys on counters). SWEEP: GRU §Constructs universal-decay
  line + CDP §construct-cluster "Degradation" line each gained a dated alignment note; the
  2026-07-08 prompt-order note AMENDED dated ("decayed Constructs carry no items" is no
  longer exhaustive — a decayed MANIFEST can carry items and opens a transfer window).
  Rules_Taxonomy: no decay-scoped gloss (swept, nothing to align).
- **Engine:** ONE predicate `hasAnchorCounters` (stats.ts — `anchors != null`) consulted by
  the readyPhase decay AND the UI pips. Decay branch keys on it; a decay-SURVIVING Manifest
  still faces the flee check (pre-existing, see flag below). Decayed permanents with death
  triggers now fire them in the ready loop (destroyEntity's order: own removal triggers,
  then on-sacrifice listeners) — byte-neutral for constructs (none carry one), live for a
  Memory-Stone-bearing Manifest (recovery pick arms via the dead-pick sink).
- **ANCHOR-CARRIER AUDIT (brief item 4 — nothing unexpected):** carriers are constructs
  (placeCard `card.anchor`; every shipped construct has a numeric anchor) and Manifests
  (animate retains). Companions/PCs get `undefined` (`card.anchor ?? undefined`, companion
  anchor is null); items aren't entities. Nothing surfaced.
- **Pins (`anchor_decay_counters.test.ts`, 7):** Manifest decays 1/turn; dies by SACRIFICE
  at zero (Dead Zone + Memory Stone onDestroy fires + transfer window); LAST GASP composes
  (animated Echoing Glyph draws then crumbles); MoF does NOT protect it; Siegeworks does NOT
  draw for it (texts quoted verbatim in the file); ordinary construct decay regression;
  combat-killed Manifest pre-decay leaves once (no double handling).
- **Mutations — 5. M1 predicate-revert (5 EXACT); M2 MoF-widened (2 EXACT); M3
  death-triggers-dropped (1 EXACT); M4 isPhysicalConstruct-includes-Manifest predicted 2
  failed 1 — INSPECTED: fireSacrificeTriggers double-guards (`kind !== 'construct'`
  short-circuits before isPhysicalConstruct), so M4's true footprint is the MoF path only;
  M5 listener-guard-removed added to cover pin 5 (2 EXACT). Restores grep-verified.**
- **FIXTURE VERDICT — t3 STANDS (proven at entry level, not inferred):** t3 DOES contain a
  Manifest (p2's animated Echoing Glyph, 3 anchors, visible at the turn-2 snapshot) but it
  was destroyed in combat before p2's next Ready Phase (absent from the turn-3 snapshot;
  step-74 ready replays clean) — it never survived to its controller's ready, so no decay
  was ever due. Replay clean end-to-end; nothing retired, nothing newly owed (the two
  re-recordings owed from the last-gasp session still stand).
- **UI (before/after):** BEFORE — pips rendered only in the construct footer; a Manifest
  showed nothing (the display gap that surfaced the ruling). AFTER — any counter-carrying
  companion renders "Anchors N/M" + pips via the SAME hasAnchorCounters predicate
  (live-verified: Manifest shows "Anchors 2/3", plain companion shows none). LoadoutPanel's
  ⚓ chip already keyed on anchors-present (worked for Manifests unchanged). The animate
  toast now says "— N Anchors remain, and it keeps decaying".
- **⚠ PRE-EXISTING UNRULED EDGE (flagged, NOT changed):** a decay-SURVIVING Manifest still
  faces the companion FLEE check (Level > Willpower, Manifests keep the construct card's
  level) — and fleeing is a non-sacrifice exit, vs the Manifest's "if it would leave the
  encounter, sacrifice it instead". Whether flee applies to Manifests at all, and whether
  it converts to a sacrifice, is UNRULED — surfaced for the owner, engine left as-is.
- **Owner re-uploads:** Game_Rules_Updated.md, Card_Design_Parameters.md, HANDOFF.md.

## Previous session (2026-07-21, later) — LAST GASP ruling encoded + Ready Phase EXTRACTED (debt #2 CLOSED)
**Suite: 37 files / 377 tests green; tsc ZERO; validate:decks clean. LOCAL session, two commits
IN ORDER per the brief: `5d31aca` (the ruling — behavior change) then `82b9133` (the extraction —
behaviorally invisible, fixture-proven).**
- **PART 1 VERDICT: the engine did REMOVALS-FIRST.** Code path: endTurn's old `readyPlayer`
  closure applied anchor decay + flee inline during the ready pass; `resolveStartOfTurn` ran
  ~70 lines later — after removals AND after the turn draw. A last-counter construct never
  ticked; a fleeing companion never fired. The ruling was a real behavior change.
- **Encoding (owner LAST GASP, 2026-07-20):** endTurn restructured to the ruled order:
  readyAndFlip (no removals) → end-of-turn buff expiry (acted board — commutes with the flip,
  state-identical) → **start-of-turn triggers fire** (statics recomputed around the window: a
  trigger that removes a Dismay source is honored by the flee check) → decay/flee removals →
  arc-5 on-sacrifice listeners (event-time pre-removal board — R3 + simultaneity preserved) →
  turn draw (Ready precedes Draw, arc-5 pin) → prompt arming (Poison-first note unchanged).
  ENCODED CONSEQUENCE (ruling-consistent, noted): a dying Library-of-Memory-style dead-pick
  snapshots its options BEFORE this turn's removals bury cards — the trigger fired pre-removal,
  so same-ready exits aren't in its choice set.
- **⚠ FIXTURES t7 + t9 RETIRED (both diverge for EXACTLY the ruled reason — proven by
  step-level diagnosis, not assumed):** t7 diverges at its step-155 endTurn with an RNG
  underrun — **Convergence Sigil at 1 anchor** ("At the start of your turn, draw a card") now
  ticks before crumbling, and the interpreter's per-resolution d6 accompanies it (a draw the
  recording never made). t9 diverges at its step-153 endTurn — **Library of Memory at 1
  anchor** now arms its Dead-Zone pick before crumbling (pendingDeadPick is hashed). t3
  contains no last-gasp event and REPLAYS CLEAN — kept. **Owner: two re-recordings owed,
  from a server on `82b9133`+ (restarted, stamp verified). Wizard-deck games hit last-gasp
  boards naturally (Library/Sigil at 1 anchor) — any normal game will do.**
- **Pins (`last_gasp.test.ts`, 5):** Sigil last tick (real card); decay-still-applies-after-
  trigger regression (2-anchor Sigil → 1); Library dead-pick arming (the retired-t9 board);
  fleeing companion fires first (synthetic startOfTurn companion — both exits, one rule);
  Siegeworks interop (last-counter physical construct TICKS + on-sacrifice draw + turn draw).
- **willpower_current flee test RE-BASED dated:** it hand-seeded `dismayed: true` with no
  Dismay source — underivable state the Ready Phase's statics recompute now (correctly)
  clears. Re-based onto a real synthetic Dismay-keyword entity so the derivation path is
  exercised end-to-end; the pinned ruling (Dismay pressure causes fleeing) is unchanged.
- **Mutations — 3.** M1 order-revert: 4 EXACT (pin 2 predicted-survives — a surviving
  construct ticks either way). M3 statics-recompute-removed: 1 EXACT. M2 decay-removed:
  predicted 8, failed 10 — HONEST IMPRECISION, both extras genuine decay reliances
  (the t3 fixture — every recorded ready phase decays — and tier2's Translocation re-arm
  pin); inspected, no contamination, restores grep-verified.
- **PART 2 — EXTRACTION (`82b9133`): `src/engine/readyPhase.ts`** — readyAndFlip,
  applyReadyRemovals (decay + MoF exemption + flee + bury/Dead-Zone routing + item-transfer
  collection), runReadyPhase (composes the ruled order incl. triggers + sacrifice listeners).
  endTurn is orchestration: **123 lines (was ~230)** — gates, buff expiry, runReadyPhase,
  draw, prompt arming. Engine barrel + dependency-direction test cover the new module
  automatically. **ORACLE HELD: t3 replays byte-identically across the extraction; suite
  unchanged 37/377. PROJECT_STATE debt #2 is FULLY RESOLVED** (trigger wiring landed arc 5;
  the endTurn extraction was the open half — done).
- **Live-verified** (real app, fresh server on the commit): Sigil-at-1 board → hand +2, toasts
  in ruled order ("Convergence Sigil: Draw 1" THEN "crumbles"), Sigil in the Dead Zone.
- **Docs:** GRU §Turn Structure Ready Phase — step list now shows where triggers sit (dated)
  + the verbatim Rules Note (2026-07-20); parent + snapshot hash-identical. **Owner
  re-uploads: Game_Rules_Updated.md, HANDOFF.md, tasks/PROJECT_STATE.md.** No open questions
  surfaced — the only mid-extraction ordering call (buff expiry vs flip) commutes and is
  documented in the code.

## Previous session (2026-07-21) — t9 replacement fixture committed + Embercast timing CONFIRMED
- **Fixture `twilight-solo-2634154-t9-mrupjvd2` COMMITTED** (owner-recorded on the fix commit,
  correct stamp, format 3, 293 entries, demotions [] — replays clean; suite 36 files / 374
  green). Replay coverage now: t3 + t7 + t9, the re-recording owed from 2026-07-20 delivered.
- **EMBERCAST WAND TIMING CONFIRMED (owner, ruled 2026-07-16, recorded 2026-07-21): the rider
  fires ON THE PLAY of the Magic Action as encoded — a countered Magic Action still triggers
  it ("plays" is the event, per the universal 2026-07-15 "play = from hand" definition). The
  2026-07-16 flagged engine reading is now an owner-ratified ruling; no code change.**

## Previous session (2026-07-20) — Bugfix: opposing PC not offered as attack target — UI/store targeting UNIFIED at one gate
**Suite: 36 files / 374 tests green (incl. 2 NEW committed replay fixtures); tsc ZERO;
validate:decks clean. LOCAL session.** Owner-reported: Watchtower-granted back-line Scholar
armed the attack prompt but NOTHING highlighted (opposing PC stood alone in the front line).
- **DIAGNOSIS (brief's option 2 — Watchtower-path divergence; NOT a July regression):**
  CommandZone.tsx carried its OWN copies of attack eligibility (`attackerInFrontLine ||
  attackerHasRanged`) and target legality (`legalAttackTargets`) — both from the INITIAL
  COMMIT (547a0a0), never touched since. The store's rules evolved (Watchtower d4d3311
  2026-07-08, Guardian legality 05b31af 2026-07-15, Ranged excision e139ca2 2026-07-16); the
  copies did not. **The Watchtower highlight path never worked in its life** — the UI copy
  never learned the aura, so eligibility computed false and the highlight branch was dead.
  The UI enumeration DID include PCs (options 1/3 ruled out); resolveAttack would have
  ACCEPTED the PC — highlight-only bug, but the class is UI/store divergence. LATENT
  divergences found in the same copies, all fixed by unification: UI bound ALL ready
  Guardians (unreachable ones included — the 05b31af fix never reached the UI); UI ignored
  attacker Evasive entirely; LoadoutPanel read PRINTED keywords for position eligibility
  (an item-granted Ranged, e.g. Pikestaff, wrongly disabled the Attack button).
- **FIX (single-gate discipline, ab8a5b0 precedent):** engine/stats.ts now owns attack
  targeting: `canAttackFromPosition` (front / Ranged via effectiveKeywords / Watchtower
  aura), `isLegalAttackTarget` (front-line-priority legality, post-excision), and
  `bindingGuardianIds` — plus `legalAttackTargetIds` composing them (characters only,
  legality, Guardian-within-legal-set, ward filter). beginAttack, resolveAttack,
  CommandZone highlighting, and LoadoutPanel's button ALL consult these; the UI highlights
  exactly the set the reducer accepts, by construction.
- **NO DEAD PROMPTS (per the brief):** beginAttack now refuses loudly when opposing
  characters exist but the targeting rules leave nothing legal (e.g. every legal line
  ward-shielded), instead of arming a highlight-less picker. Empty-of-characters opposing
  boards (test rigs/sandbox only) keep the old pass-through.
- **⚠ ADJACENT HOLE CLOSED (flagged, was NOT in the brief):** resolveAttack SKIPPED the
  targeting rules for construct targets and fell through to commitAttack — the UI never
  offered one, but a direct call ATTACKED the construct, against canon (GRU §Targeting
  Rules, verbatim): "Constructs cannot be attacked and do not satisfy or interfere with
  Front Line priority." Now refused loudly. One tier1 poison pin had used that fall-through
  as its damage VEHICLE ("construct takes the damage") — RETIRED + REWRITTEN dated (the
  poison-scope rule is now structurally guaranteed: no combat damage can reach a construct).
  Overrule if direct construct attacks were somehow intended.
- **FIXTURES — recording has RESUMED (owner recorded 3 games on `5a9a72c`):** t3 + t7
  replay CLEAN under the fixed engine → **COMMITTED (replay coverage restored, 2 fixtures)**;
  t3 contains a Watchtower-granted arming (proven load-bearing by mutation M1). **t9 RETIRED
  pre-commit (deleted per the 2026-07-08 protocol)** — it diverges at step 112 `beginAttack`:
  the recorded board (opposing back-line Long-Quiet Wall warding the front, PC the only
  character) had ZERO legal targets — the zero highlights on THAT board were CORRECT (ward),
  but the old engine armed a dead prompt and the recording captured the ARMED pending
  (pending is hashed); the fix intentionally turns it into a refusal. A wrong refusal is not
  state, but an armed prompt is. **Owner: please re-record the t9-style game from a server
  on THIS commit or later.** NOTE: the brief's reported board (Scholar vs front-line PC) and
  the t9 board are DIFFERENT zero-highlight turns — the first was the bug, the second was
  correct-but-silent; both are now loud and correct.
- **Pins (`attack_target_gate.test.ts`, 7):** PC offered+attackable via front-line AND
  Watchtower paths (1a/1b, 1b = the reported board); back-liners unoffered+refused behind
  occupied front (regression); EMPTY-front branch (companion + back-placed PC legal —
  previously unpinned, hole closed); constructs never in candidate sets + direct attack
  refused + don't occupy the front line; Guardian interop both ways (legal Guardian is the
  whole set; unreachable binds nothing); no-dead-prompt refusal. The set function IS the
  UI highlight computation, so these pin the UI directly.
- **Mutations — 6. M2/M4/M5/M6 EXACT. Two HONEST IMPRECISIONS, both inspected clean:**
  M1 (aura term dropped) predicted 3, failed 4 — the extra was t3's fixture replay
  (Watchtower arming recorded in-game; consistent, and welcome fixture coverage). M3
  (empty-front branch dropped) predicted 2, failed 6 — the 4 extras (gameplay PC-kill,
  t3, t7, tier4 PC-bypasses-ward) are all genuine empty-front reliances: the branch was
  live engine behavior that simply had NO dedicated pin until now (pin 3 closes that).
  No contamination; restores grep-verified.
- **Live-verified through the REAL rendered UI** (fresh server, real click): the reported
  board seeded, beginAttack armed, exactly ONE 'Attack ⚔' badge (the opposing PC's slot),
  clicking it resolved — PC 20→18, Scholar exhausted, back-liners untouched.
- **Docs: NO rules-doc change** — no rule changed; the engine now enforces existing canon
  and the UX is loud. Owner re-uploads: HANDOFF.md only (+ CODE_BUNDLE if refreshing).

## Previous session (2026-07-17, later) — Snapshot regeneration: PROJECT_STATE + CODE_BUNDLE + Rules_Taxonomy gloss
**Suite: 35 files / 364 tests green; tsc ZERO; validate:decks clean. LOCAL housekeeping session —
no engine changes.** Both design-chat snapshots regenerated against main @ `e139ca2`:
- **tasks/PROJECT_STATE.md REWRITTEN** (supersedes the 2026-07-09 version; established
  structure kept): capability program CLOSED (six arcs + carve-outs, flags 0, 100/100 cards
  explained); the July mechanics/rulings ledger (trigger stack, play=from-hand, prevention
  family, restriction auras, on-play/on-sacrifice, no anchor maximum + rewordings, item
  exhaustion, window model, strict Move→Minor→Major, Special-Action atomicity, Guardian
  legal-target, fresh=entered-this-turn, Ranged excision, no turn-1 Major ban); debts updated
  honestly (#1/#3 RESOLVED; #2 half — decay-trigger wiring landed, endTurn extraction open;
  fixtures EMPTY by owner decision, do-not-nag; MP live pass over post-arc-1 holds listed;
  interpreter move op); design-revisit list (Sentinel rework, Grudrik clause option, Ranged
  re-costing, simultaneous-decay UNRULED, Embercast timing flagged, Untamed reserved,
  Glassweaver wording, Translocation Circle); roadmap re-sequenced (playtest/re-record → dev
  deck → inverted pipeline); doc-location fact corrected (root = masters since 2026-07-13).
- **twilight-app/CODE_BUNDLE.md REGENERATED** (was 2026-07-10 — predated arcs 2–5 and every
  fix since; a stale bundle caused the Anchor Stone +1 HP misquote). 100 sections (was 85),
  same format (script kept the old layout: sorted src/ walk, tsx/json/css fences, fixtures
  excluded). PROOF: both embedded deck JSONs byte-identical to src/data; all four reworded
  cards (Anchor Stone, Runic Convergence Staff, Siegeworks, Grudrik) verified verbatim.
- **Rules_Taxonomy §15 gloss tightened** (parent + snapshot hash-identical): "a ranged
  attacker reaches the back" → "a ranged character attacks from the back", + dated Note
  (2026-07-17) stating RANGED grants no reach INTO the opposing back line and no targetability
  (closes the report-only flag from the excision session).
- **⚠ TASK 4 (Embercast rider timing) NOT APPLIED — STOP-AND-SURFACE:** the brief made it
  conditional on "whichever the owner ruled in the design chat", but no ruling is stated in
  the brief or recorded anywhere in the repo. Current encoding stands unchanged (fires ON THE
  PLAY; a countered Magic Action still triggers — the flagged 2026-07-16 engine reading).
  NOTHING was written as "confirmed". Owner: state the ruling and the next session applies it
  (confirm = one HANDOFF line; re-rule = engine + pin rewrite per the brief).
- **Owner re-uploads to the design Project:** tasks/PROJECT_STATE.md, twilight-app/CODE_BUNDLE.md,
  Rules_Taxonomy.md, HANDOFF.md.

## Previous session (2026-07-17) — Fabricated rule EXCISED: defender-Ranged targetability (owner ruling 2026-07-16)
**Suite: 35 files / 364 tests green; tsc ZERO; validate:decks clean. LOCAL session. Fixtures
folder EMPTY by owner decision (recording paused during the correction wave) — no fixture work,
no recording all-clear needed.** The rules docs' targeting rules granted Ranged a DEFENSIVE
effect its keyword never had ("Back Line targets become legal … or when the defender has
Ranged") — owner-ruled a FABRICATION that crept into the docs (never designed,
flavor-incoherent, contradicts canon RANGED: "This character can attack from the Back Line",
one sentence, purely offensive). Removed everywhere. **Corrected rule: back-line characters
are legal attack targets only when the opposing front line is empty of characters OR the
attacker has Evasive; the defender's keywords play NO role in its targetability.** (Guardian
still applies within the legal set per the 2026-07-15 fix — gate structure untouched.)
- **Engine:** the defender-Ranged branch removed from `isLegalTarget` (gameStore.ts
  resolveAttack — the Guardian-fix-era legality gate); the Front-Line-priority refusal toast
  no longer offers "target has no Ranged" ("Must target the Front Line first (attacker has no
  Evasive)."). Ranged's ATTACKER-side eligibility in beginAttack is untouched (and pinned).
- **Full sweep (every phrasing of defender-side Ranged targetability):** parent
  Card_Design_Parameters §23 (step 3 clause REMOVED + verbatim Rules Note 2026-07-16; step 1
  Guardian-note legality list amended — "Front Line priority, Evasive"); parent
  Game_Rules_Updated (Command-Zone back-line protection line + Targeting Rules step 2, both
  clauses REMOVED + the same Rules Note at each site; the 2026-07-15 Guardian Rules Note's
  legality list amended); both docs/ snapshots re-mirrored HASH-IDENTICAL to parents; CDP §27
  Ranged-costing note REFRAMED (pure upside — offense at zero defensive cost — STRENGTHENS
  the re-costing flag; still a playtest-data flag, design content unchanged);
  tasks/PROJECT_STATE.md Watchtower line rationale corrected. Historical records (HANDOFF
  session logs, tasks/todo.md reviews) left as written by convention. Archive untouched
  (stale by design — May-era docs still carry the old clause + an old extended RANGED
  definition; do not consult archive for canon).
- **⚠ WATCHTOWER — ruling stands, RATIONALE corrected (do NOT re-learn the old premise):**
  Watchtower stays eligibility-only, NOT a Ranged grant — but the reason is TEXTUAL FIDELITY
  (cards do what they say; its text grants attack permission, not the keyword). The previously
  recorded rationale ("full Ranged would make companions targetable in the back line") cited
  the fabricated clause and is FALSE — Ranged has no defensive effect at all. Comments
  corrected in stats.ts (hasBackLineAttackAura), types/effects.ts (backLineAttack op),
  rulings_batch2.test.ts, PROJECT_STATE.md.
- **Guardian pins audited (all 7):** ONLY pin 3 relied on the fabrication ("Ranged back-line
  Guardian binds everyone") — RETIRED + REWRITTEN dated: a back-line Guardian with Ranged
  behind an occupied front line is NOT targetable by a normal attacker (absent Evasive) and
  binds nobody it can't be reached by, exactly like any back-line Guardian. Pins 1/2/4–7
  carry no reliance, untouched.
- **Tests (`ranged_targetability.test.ts`, 3 + the rewritten Guardian pin):** back-line Ranged
  behind an occupied front NOT legal for a normal attacker; IS legal for an Evasive attacker
  (Evasive unchanged); back-line Ranged can still ATTACK (offensive-effect regression).
  **Mutations — 4, every failure set predicted EXACTLY and restores grep-verified:** M1
  defender-Ranged branch re-added (2: new pin 1 + Guardian pin 3); M2 Evasive dropped from
  legality (2: new Evasive pin + Guardian pin 2); M3 Guardian binds regardless of legality
  (2: Guardian pins 1 + 3); M4 Ranged dropped from beginAttack eligibility (4: the regression
  pin + 3 restriction_auras pins that arm back-line Ranged attackers).
- **Live-verified (real app, Vite module import — no store hook needed):** exact board (front
  grunt + back-line Ranged defender): attack on the back-liner refused with the corrected
  toast, HP untouched; front-liner takes the hit.
- **REPORT-ONLY observation (not changed, no defender-side claim):** Rules_Taxonomy §15's
  gloss "a ranged attacker reaches the back" is loose — under canon, Ranged attacks FROM the
  back line, it does not reach INTO one. Rationale-doc phrasing only; flag if you want it
  tightened.
- **Docs (parent + snapshots word-identical, hash-verified):** owner re-uploads:
  Game_Rules_Updated.md, Card_Design_Parameters.md, HANDOFF.md. (Master_Keyword_List
  unchanged — its RANGED entry was always the clean canonical sentence.)

## Previous session (2026-07-16) — Partial-gaps CLOSEOUT + item-ability window model — DEBT #3 RESOLVED
**Suite: 34 files / 361 tests green; tsc ZERO; validate:decks clean; fixtures folder was EMPTY
at start (the brief's fixture warning was moot). ✅ FRESH ALL-CLEAR TO RECORD after server
restart on this commit. FULL-CATALOG SWEEP: 100 cards, ZERO unexplained clauses, ZERO
effectsFlags — every sentence maps to ops, parsed keywords, or reminder text.**
- **P1 — ITEM-ABILITY WINDOW MODEL (owner 2026-07-16, supersedes bb0acbc/867652a's Minor-spend
  for Anchor Stone):** an item-hosted activated clause with NO printed action prefix is NOT a
  character action — `windowModel` in activateAbility: cost = the item's exhaustion only, no
  budget spent, no bearer rotation, usable at any point in the bearer's window (before Movement,
  at 90°, fully exhausted); tapping OPENS/CONTINUES the activation (activationPatch — seals
  others); sealed bearer → refusal "<name>'s activation is finished"; controller's-turn-only
  (GRU inactive-player restriction, cited). Quill of Unmaking keeps its printed "As a Major
  Action" via an explicit `actionCost: 'major'`. SUPERSESSION HYGIENE: 3 pins retired+rewritten
  dated (tier1_combat 90°-tap now LEGAL; activation_economy tap costs nothing; strict-order's
  Minor-after-Major ability pin re-based onto a synthetic body ability — Anchor Stone left that
  rule). Item taps = the SECOND member of Special Actions' category.
- **P2 — REWORDINGS (owner 2026-07-16, both verbatim):** Anchor Stone → "Exhaust this trinket:
  add 1 Anchor counter to target Physical Construct."; Runic Convergence Staff → "Equipped
  character has +2 attack. Exhaust this staff: look at the top card of any deck." (activated
  peek clause authored; look-only = dests ['top'] — a single destination grants no choice).
  **ANY-DECK PEEK MACHINERY:** PendingPeek gained an OPTIONAL chooseDeck phase (hash-neutral;
  buildPeek arms it for `deck:'any'` requests; new `resolvePeekDeck(side)`; PeekModal renders
  the two-deck choice; existing pendingPeek hold covers MP).
- **P3 — PARTIAL GAPS, ALL CLOSED:** (1) Embercast Wand rider authored (new Trigger
  `onEquippedPlaysMagicAction`, fired in playAction ON THE PLAY — ⚠ ENGINE READING, flagged:
  a COUNTERED Magic Action still triggers the rider ("plays" is the event, 2026-07-15
  definition); per-wand once-per-turn via ability-used: status). (2) Ashforged Pendant authored
  (new op `firstMagicUncounterable` + per-actor first-Magic tag; PINNED ×Ward of Silence:
  first resolves, second countered, resets next turn). (3) Lens of Foretelling — **FINDING:
  its start-of-turn peek was ENTIRELY dead, not merely missing the deck choice: permanentEffects
  read only the body card, never equipped items. Extended to card+items (combatTriggerEffects
  discipline; 2 call sites audited: startOfTurn gather + ward scan).** Deck-any choice added
  per printed text. (4) Belts: Kit-Master was enter-wired only — the belts' on-equip clause was
  genuinely dead; equipItem now arms the same pendingKit machinery when the equipped item
  declares Kit-Master (fizzle-toast when no move exists). (5) Master of Foundations: ALREADY
  verified+pinned (master_of_foundations.test.ts, the arc-5 correction) — cited, nothing done.
  (6) **Untamed: NO card in the shipped 100 carries the keyword or per-card Untamed text**
  (only the card NAME "Wrath of the Untamed Sky") — nothing to implement; the keyword stays
  registered-unimplemented in the registry (visible, not silent).
- **Tests:** item_window.test.ts (5 — window model per the brief's pin list) +
  partial_gaps_closeout.test.ts (6 — wand/pendant/staff both decks/lens/belts) + 3 supersession
  rewrites. **Mutations — 5. M1 (window disconnected) HONEST IMPRECISION: predicted 8, failed
  9 — right files, 3 wrong itemizations (two over-predictions drive attacks via forced
  `pending`, bypassing beginAttack's exhaust gate; two economy asserts missed). M2 (no
  activation-open) / M3 (rider ignores once-per-turn) / M4 (pendant protects all) / M5
  (permanentEffects items reverted → Lens only) — all EXACT.**
- **Docs (parent + snapshots word-identical):** GRU §Items gained the Item Activated Abilities
  Rules Note (2026-07-16, verbatim); CDP §13 gained the canonical item-ability template
  ("Exhaust this [item]: [effect]." — no action prefix; window timing; printed trigger limits
  keep their wording). Owner re-uploads: Game_Rules_Updated.md, Card_Design_Parameters.md,
  HANDOFF.md.
- **PROJECT_STATE debt #3: RESOLVED** (Grudrik 2026-07-15; the five partials + Lens this
  session; Untamed = no card). Remaining engine-side wants: interpreter `move` op (arc-1 flag,
  must consult movement restrictions when built); MP live pass over all holds.

## Previous session (2026-07-15, bugfix) — STRICT activation order: no Minor after the Major
**Suite: 32 files / 349 tests green; tsc ZERO; validate:decks clean. Fixtures folder was still
EMPTY at session start (no recordings to audit). ✅ FRESH ALL-CLEAR TO RECORD — server restarted
on this commit so the REC chip stamps correctly.** Owner ruling (closes ab8a5b0's observation):
§24's "During activation, in order" is STRICT — rotation only advances; a character at 90° has
no 45° state to enter, so Minor-after-Major is untrackable and illegal.
- **Fix at the shared gate:** new `minorActionReason(ent)` in stats.ts — refuses when
  acts.major / tapped 'major' / exhausted ("Already fully exhausted — Minor Actions must come
  before the Major") or when the Minor is spent ("Minor action already used"). Consulted by
  ALL Minor-cost paths: canPlayActionCard's Minor branch (Action cards + hand UI), the
  activateAbility minor-actionCost branch (Anchor Stone), and equipItem. Legal direction
  untouched and re-pinned: Minor (45°) then Major (90°) — Anchor Stone then attack.
- **⚠ ADJACENT HOLE CLOSED BY THE SAME GATE (flagged, was NOT in the brief): `equipItem` was
  previously UNGATED on action economy entirely** — it never checked acts.minor, so equipping
  was effectively FREE after any action (double-Minor and Minor-after-Major alike). The
  uniform gate closes both; carving equip out of the acts.minor check would have been
  deliberate work to preserve a bug. Pinned as "FLAGGED CLOSURE"; overrule if double-equip
  was somehow intended.
- **Docs:** NO doc change — §24 already says "During activation, in order:" and the prior
  Rules Note names the ordering strict; the docs were right, the engine was wrong (per brief:
  HANDOFF record only). Owner re-uploads: HANDOFF.md only.
- **Tests (`strict_activation_order.test.ts`, 6):** Major→equip refused (companion);
  Major→Minor ability refused (PC covered); Major→Minor Action card refused (shared
  canPlayActionCard gate); Minor→Major legal (regression); Movement-first regression
  ("Move must be the first action"); double-equip refused (the flagged closure).
  **Mutations — 3, all failure sets predicted EXACTLY:** after-Major branch removed (the 3
  after-Major pins); equip gate disconnected (equip pin + flagged closure); gate over-refuses
  everything (the 3 pins asserting LEGAL actions — proves no over-refusal). Live-verified:
  attack → equip refusal with the exact reason in the real app.
- **NOTE for the sandbox:** markAction (the manual tracker buttons in the playtest helpers)
  stays ungated by design — it is the owner's manual override, not a game action.

## Previous session (2026-07-15, bugfix) — Special Actions escape atomic activation CLOSED
**Suite: 31 files / 343 tests green; tsc ZERO; validate:decks clean. ✅ ALL-CLEAR FOR FIXTURE
RECORDING — this legality CONTRACTION is in; record only from a server started at/after commit
(this session).** The exploit (PC plays companions → they act → PC plays MORE, forbidden by
CDP §24 atomicity) is closed per the owner ruling: Specials interleave freely WITHIN the PC's
own activation; any OTHER character acting seals the PC.
- **Fix at the shared gate:** new `specialActionActor(game, lp)` in stats.ts (keywords) —
  returns the PC id (the acting character) or the standard 'Activation already finished'
  refusal; consulted by beginPlay (arming refused, no dangling pendingPlay), placeCard (the
  authoritative re-check + the ACTIVATION PATCH with the PC — which also seals a companion
  mid-activation, the standard character-switch rule = symmetry), and HandFan (companion/
  construct cards dim with the reason) — store and hand UI cannot disagree. Special-cost
  ACTION cards needed nothing: they already route through canPlayActionCard with the PC as
  actor (Specials are PC-only) and playAction applies the patch. No-PC-on-board edge (test
  rigs, setup): gate passes through, nothing to seal.
- **Tests (`special_action_atomicity.test.ts`, 5):** exploit closed (play → companion moves →
  second play refused, hand + CZ untouched, arming refused too); Zealous variant (companion
  attacks) same seal; interleave WITHIN the activation legal (play → PC attacks → play again);
  symmetry (companion mid-activation sealed by the PC's Special); next-turn reset. **Mutations —
  3, all failure sets predicted EXACTLY:** both refusal gates removed (3: exploit/Zealous/reset;
  symmetry survives on the patch); patch removed (4: the PC never registers, so even the gates
  can't see a switch); PC seals itself on its own placement (interleave only). Live-verified:
  the exact exploit sequence refuses with the full reason toast in the real app.
- **OBSERVATION (per the brief — reported, NOT fixed):** intra-activation ordering today:
  Move-first IS enforced (resolveMove: "Move must be the first action — already acted this
  turn", Hit & Run excepted); Minor↔Major MUTUAL ordering is NOT enforced (a character can
  take its Major, then its Minor — markAction/ability charging check budgets, not sequence).
  Flag if §24's "Move→Minor→Major" numbering is meant to be a strict sequence beyond move-first.
- **Docs:** CDP §24 gained the Rules Note verbatim (Specials are part of the PC's activation;
  ordering strictness applies to Move→Minor→Major only), parent + snapshot identical.
  Owner re-uploads: Card_Design_Parameters.md, HANDOFF.md.
- **DREAM-RECORDING LIST (updated):** back-line Guardian board; Anchor Stone activation with
  the exhaustion visible; prior-turn animation attacking; a turn with interleaved Specials +
  PC attack. (A sealed-PC refusal is NOT needed on tape — refusals aren't state.)

## Previous session (2026-07-15, follow-up) — ITEM EXHAUSTION shipped (Anchor Stone cost; closes ef4f0be Q3)
**Suite: 30 files / 338 tests green; tsc ZERO; validate:decks clean; no fixtures committed (none
to diverge — folder still empty pending owner re-recording).** Owner ruling: "exhaust this
trinket" exhausts THE ITEM — item exhaustion is now a real mechanic (self-tracking rationale:
the rotated card is the record).
- **Engine:** `EquippedItem.exhausted?: boolean` — OPTIONAL, key REMOVED on ready, never written
  false (hash discipline: exhaustion-free games serialize identically). New Cost kind
  **`exhaustItem`** (schema + COST_KINDS + Item-cards-only validator check): payability refuses
  on an exhausted host — checked FIRST among gates (most specific reason: "Anchor Stone is
  exhausted" beats "Minor action already used" when both hold; a DUPLICATE payability check
  deeper in the cost block is deliberately load-bearing for the moved-item case — mutation M3
  proved it). Payment stamps the hosting item. **Ready Phase readies the active player's items
  alongside characters** (readyPlayer; only touched when something is exhausted). Kit-Master
  moves carry the item OBJECT wholesale → exhaustion travels (pinned).
- **Anchor Stone data:** `oncePerTurn` REPLACED by `cost: {kind:'exhaustItem'}` (the per-bearer
  marker was WRONG — a Kit-Master move used to grant a second activation). `oncePerTurn` stays
  in the schema for cards whose TEXT says "once per turn" (Glassweaver Adept — NOT migrated,
  printed text is its cost). One prior pin RE-BASED dated (activation_economy: refusal message).
- **UI:** exhausted item chip rotates 90° + dims with an "exhausted" label and a readies-next-
  turn tooltip; the activation button disables with "Anchor Stone is exhausted". Live-verified
  end-to-end (fresh server — the HMR second-store gotcha bit again mid-session; restart first).
- **Tests (`item_exhaustion.test.ts`, 5):** exhausts the ITEM not the bearer + refusal names the
  item; Kit-Master carry → new bearer still refused; readies at the CONTROLLER's turn start only
  (opponent's ready does nothing) + usable again; statics persist while exhausted (Rules-Note
  sentence pinned via a synthetic +1 HP trinket — see the discrepancy below for why synthetic);
  bearer still attacks after activating. **Mutations — 4, all failure sets predicted EXACTLY:**
  cost never paid (5); opponent-ready readies items (1); payability reads the BEARER (2 — and
  the Kit-Master pin surviving via the deep payability check was part of the prediction);
  statics suppressed while exhausted (1).
- **~~⚠ CANON/DATA DISCREPANCY — Anchor Stone's "+1 HP"~~ RESOLVED (owner, 2026-07-15
  micro-session):** the "+1 HP" sentence was INTENTIONALLY REMOVED by the owner — +HP does not
  fit the game's item nomenclature. The SHIPPED card (activation-only) is CORRECT; the
  design-chat briefs quoted a stale draft. Stale drafts carrying the +1 HP clause exist in old
  data snapshots — **do not restore it.** (The statics-persist rule stays pinned via the
  synthetic trinket — unaffected.)
- **⚠ DESIGN-GUIDELINE QUESTION (report-only, per the brief):** Glassweaver Adept's printed
  "Once per turn" is exactly the hard-to-track pattern this ruling disfavors. Want a one-line
  Card_Design_Parameters guideline steering future generation toward exhaust-style costs over
  "once per turn" wording? Not added — needs your yes.
- **Docs:** GRU §Items gained the Item-exhaustion Rules Note verbatim (parent + snapshot).
  Owner re-uploads: Game_Rules_Updated.md, HANDOFF.md. Canon-contradiction check for
  statics-persist: none found (no doc ties item statics to exhaustion).

## Previous session (2026-07-15, bugfix pair) — Anchor Stone activation economy + Animate entry gating FIXED
**Suite: 29 files / 333 tests green; tsc ZERO; validate:decks clean. ⚠ BOTH FIXTURES RETIRED
AGAIN (evidence below — the recordings pinned the bugs' own fingerprints; unavoidable under any
correct fix). RECORDING CAN RESUME immediately after pulling this commit + RESTARTING the dev
server** (restart also fixes the stale commit stamp; please include a back-line-Guardian board —
still owed to the replay net — and ideally an Anchor Stone activation + a prior-turn animation).
- **Bug 1 DIAGNOSIS (hypothesis overturned, evidence in-session):** Anchor Stone was ALWAYS
  UI-reachable (LoadoutPanel has rendered item-hosted activations since the extraction; proven by
  driving the real button). The practical unreachability was ACTION-ECONOMY misclassification:
  every character-hosted activation was hardwired as a MAJOR action — blocked on the bearer's
  entry turn ("No Major Actions on its entry turn"), blocked after attacking, and paying with
  FULL EXHAUSTION + 90° tap. Card text (verbatim): "As a Minor Action, exhaust this trinket: …".
- **Fix (class-level):** new per-clause **`actionCost?: 'minor' | 'major'`** on activated clauses
  (schema + validator + gatherActivated/ActivatedAbility threading). 'minor' → Minor budget, 45°
  tap, NO exhaustion, legal on the entry turn (first-turn ban covers Major only); omitted →
  'major', the pre-existing rule, byte-identical. Anchor Stone data gains actionCost 'minor'.
  LoadoutPanel button title now names the economy ("— Minor Action"). **Class enumeration (all 5
  activated cards, ALL UI-reachable):** Anchor Stone (item, Minor — FIXED), Quill of Unmaking
  (item, "As a Major Action" — default correct), Glassweaver Adept (companion, no action wording
  — default Major stands), Collapsing Tunnel + Translocation Circle (constructs — economy-exempt).
- **Bug 2:** the animate op stamped `fresh: true` unconditionally — a prior-turn construct's
  Manifest was wrongly entry-gated. Fix at the entry-time source of truth: **`fresh` now means
  "entered the encounter this turn" for EVERY permanent** — placeCard stamps all permanents
  (constructs included), readyPlayer clears construct fresh at the controller's ready, and
  animate PRESERVES the target's fresh (type-changing ≠ entering — Rules Note 2026-07-15 in GRU
  §First-Turn). Prior-turn construct → Manifest attacks this turn; same-turn play+animate →
  gated like any new companion. Both live-verified through the real UI.
- **⚠ FIXTURES t3 + t8 RETIRED (2026-07-08 protocol).** Proven, not assumed: t8's recorded
  animation (The Verdant Still on turn 7 converting constructs played turns 5/6) captured the
  BUG'S fresh:true on prior-turn Manifests inside per-action hashes — no correct engine can
  reproduce it; and both games' construct placements hash the old `fresh:false` shape. The
  brief's "divergence = bug in the fix" premise was checked and does not hold for these
  recordings. (Bug-1 changes alone were fixture-safe — zero recorded activations.)
- **Tests (`activation_economy.test.ts`, 9):** Minor economy end-to-end (45°, un-exhausted,
  Major intact, attack afterward); entry-turn Minor activation legal; once-per-turn + loud
  no-target refusal (nothing charged); Quill Major-default regression; animate prior-turn
  attacks / same-turn gated / placeCard-stamps + ready-clears mechanism; PC turn-1 pins (below).
  THREE existing pins REWRITTEN dated (they leaned on Anchor Stone as the convenient ability or
  pinned the old animate stamp): tier1_economy Major-charge (→ Quill), tier2_rulings entry-gate +
  Zealous legs (→ Quill; Minor is entry-legal now), tier1_zones animate fresh (→ preserved).
  **Mutations — 6, one PREDICTION MISS recorded: M4 (constructs unstamped) was predicted to fail
  2 pins but the same-turn animate pin seeds its flag directly — only the mechanism pin caught
  it (coverage composes; miss noted per the lessons rule).** Others exact: actionCost ignored
  (2); minor-exhausts-anyway (1); animate re-stamp (2); ready-clear removed (1); PC turn-1 gate
  added (both PC pins).
- **⚠ VERIFICATION 3 SURFACED — the brief's premise is STALE:** the brief asserted a
  "first-player Major Action ban (which the engine implements)". IT DOES NOT EXIST: canon (GRU
  §First-Turn, verbatim) — "The first player may otherwise act normally on Turn 1 — there is no
  restriction on Major Actions" — the 2026-06-23 FLIPPED RULING, pinned in tier1_economy. Pinned
  per CANON instead: the PC (not a companion, placed at setup) can declare a turn-1 attack as
  EITHER player. If the owner wants a first-player turn-1 Major ban back, that is a NEW re-rule
  (engine + canon + pins), not this fix.
- **⚠ OWNER QUESTION — "exhaust this trinket" vs `oncePerTurn`:** the two are OBSERVABLY
  different in one case: oncePerTurn is tracked on the BEARER (`ability-used:` status), so a
  Kit-Master-moved Anchor Stone could activate AGAIN from its new bearer the same turn; a truly
  exhausted trinket could not. Item exhaustion doesn't exist as an engine/UI concept today
  (items never rotate/ready). Kept oncePerTurn per the brief; rule if the Kit-Master case
  should be legal. RELATED NOTE: Translocation Circle's "As a Minor Action" sits on a CONSTRUCT
  (economy-exempt, pinned tier2 2026-07-03) — its wording is currently economy-inert; flag if
  constructs' "As a [X] Action" should ever charge the controller.
- **Docs:** GRU §First-Turn gained the type-changing Rules Note (parent + snapshot identical).
  Owner re-uploads: Game_Rules_Updated.md, HANDOFF.md.

## Previous session (2026-07-15, bugfix) — Guardian ignores "legal target" (targeting deadlock) FIXED
**Suite: 28 files / 324 tests green; tsc ZERO; validate:decks clean. PRIORITY fix — the owner can
now RESUME FIXTURE RECORDING** (blocked on this; a recorded game SHOULD include a back-line
Guardian board so this territory sits inside the new replay net).
- **FIXTURES RESTORED (owner, same day, committed): two solo games recorded post-fix**
  (`…6d40fa2-t3…` / `…6d40fa2-t8…`, 3 + 10 attacks) — both replay clean; suite 28 files /
  **327** tests. Filename stamp shows the server-BOOT commit (`6d40fa2`, pre-fix) because the
  fix arrived over HMR — known stamp gotcha, cosmetic only: replay against the CURRENT engine
  is the oracle and both pass. **COVERAGE NOTE: neither game contains ANY Guardian entity**
  (scanned all snapshots), so the deadlock territory lives only in the unit pins for now —
  when convenient, record ONE more game featuring a back-line Guardian behind an occupied
  front line.
- **Bug:** resolveAttack's Guardian gate filtered on ready ONLY; canon GUARDIAN (verbatim):
  "While this character is ready (not exhausted) and a legal target, opponents must attack it
  before any other character" — the legal-target clause was unimplemented. A ready BACK-line
  Guardian behind an occupied front line deadlocked every attack for a normal attacker
  (anything else → "Guardian first!"; the Guardian → Front Line priority refusal).
- **Fix (structural reordering, no special case):** Front-Line-priority legality (`isLegalTarget`:
  front slot / empty front / attacker Evasive / defender Ranged) is computed FIRST; Guardian
  binds WITHIN the legal set (`bindingGuardians`); check 2 then applies the same predicate to
  the chosen target (semantics unchanged — off-board ids still pass through as before). The
  "Guardian must be attacked first" toast now fires only when a Guardian is genuinely legally
  attackable. Verified live on the exact reported board (front grunt attackable, no deadlock).
- **Pins (`guardian_legality.test.ts`, 7):** (1) no deadlock + the unreachable Guardian itself
  stays front-line-protected; (2) EVASIVE attacker IS bound by the back Guardian (reach ≠
  bypass — canon EVASIVE "Still subject to Guardian targeting requirement"); (3) RANGED back
  Guardian binds everyone; (4) front Guardian regression; (5) exhausted binds nobody; (6) two
  Guardians — only the legal one binds; (7) legality recomputed per declaration (dead Guardian
  → free targeting, R2 2026-07-15). Interop CONFIRMED: Long-Quiet Wall ward + Crystalline
  Sentinel restriction pins untouched and green (ward check unchanged downstream of the gate).
- **Non-vacuity — 6 mutations. HONEST MISS RECORDED: M5 (chosen-target legality disconnected)
  was predicted to fail pin 6 and failed NOTHING — the Guardian gate shields that assertion, so
  no pin watched check 2 at all. The mutation exposed the coverage hole; pin 1 was STRENGTHENED
  (unreachable Guardian must itself be refused by Front Line priority) and M5 re-run now fails
  pin 1 exactly.** Others as predicted: ready-only revert → pin 1; Evasive-bypasses → pin 2;
  Ranged-ignored → pin 3; ready-check dropped → pin 5; gate disconnected → pins 2/3/4/6.
- **Docs (2026-07-15, parent + snapshots word-identical):** Targeting-Rules step-1 summary line
  CORRECTED in Game_Rules_Updated §Targeting Rules (+ full Rules Note: the summary was in
  error, not the keyword) and Card_Design_Parameters §23 Targeting Priority (inline note).
  Owner re-uploads: Game_Rules_Updated.md, Card_Design_Parameters.md, HANDOFF.md.

## Previous session (2026-07-15) — Capability arc 5 (FINAL): on-sacrifice triggers (Siegeworks) + rewordings — PROGRAM CLOSED
**Suite: 26 files / 316 tests green; tsc ZERO; validate:decks clean. FLAGGED GAPS 1 → 0 — the
2026-07-08 engine-capability program is COMPLETE** (tier4 pin now asserts the flag list is EMPTY
and guards the convention itself). ⚠ **BOTH REPLAY FIXTURES RETIRED — see below; owner must
re-record.**
- **Rewordings (owner-ruled 2026-07-15, R1 — anchor caps removed from the game):** Siegeworks →
  "When one of your Physical Constructs is sacrificed, draw a card." (cap sentence deleted);
  Grudrik Stonebrace → "GUARDIAN. When this enters, add 2 Anchor counters to each Physical
  Construct you control." (cap sentence deleted; his existing onEnter anchor+2 effects already
  implement the surviving text exactly — verified, not rebuilt). Card text found NOWHERE else
  in-repo (CODE_BUNDLE.md is regenerated; archived workbench data is stale by design).
- **⚠ FIXTURES t5 + t8 RETIRED BY NAME (the 2026-07-08 protocol: delete, never edit).** Root
  cause PROVEN by isolation: with old texts restored and ALL new engine code active, both
  replayed clean (29/29) and the new listener never fired — the divergence is SOLELY the
  rewording (recorded board entities carry the old text inside the canonical hash; both games
  placed Grudrik/Siegeworks). The hook itself is byte-neutral. **Replay coverage is EMPTY until
  the owner re-records from a RESTARTED server** (stamp check via the REC chip).
- **Engine:** new reactive Trigger `'ownPhysicalConstructSacrificed'`; `fireSacrificeTriggers`
  (entities.ts) gathers listeners from the controller's board AS OF the event (pre-removal → the
  dying permanent's own listener fires, R3) and resolves in slot-scan order (mandatory, no
  choices, NO new holds); `destroyEntity` gained `cause?: 'sacrifice'` — listeners fire ONLY on
  the sacrifice cause, never on damage deaths. **Audited sacrifice paths, all threaded:**
  interpreter sacrifice-self op (trap self-sac), anchor op drained to 0 (Dismantle), manifest
  bounce-replacement; store: sacrificeSelf ability cost, removeAnchor cost at 0, sacrificeEntity
  (✕ button), Pyre modal cost, moveAnchor drain, resolveTrigger anchor drain, Coercion sacrifice.
  NON-sacrifice (correctly uncaused): combat/effect damage deaths, Reckless recoil death, flee.
  Armor-threshold sacrifice is an ITEM sacrifice — items aren't entities/Physical Constructs;
  filter can't match (brief's "where applicable" = not applicable).
- **Decay wiring (named debt #2, PARTIALLY landed):** ready-phase decay now FIRES on-sacrifice
  listeners — endTurn collects decayed constructs and resolves listeners on the readied state
  BEFORE the turn draw (Ready precedes Draw), gathered from the PRE-ready board. Decay still
  does NOT route through destroyEntity itself (byte-safety; the full readyPlayer/exit-path
  unification remains open with the readyPlayer-split design, owner 2026-07-10) — construct
  onDestroy-style death triggers on decay stay unwired (still no shipped construct carries one).
  ENGINE READING (flagged): same-ready simultaneous decays HEAR EACH OTHER (event-time board) —
  two Siegeworks both decaying = each draws for both events. Confirm or rule sequential.
- **Tests (`onsacrifice_trigger.test.ts`, 8):** decay draw (+turn draw accounting); OWN-decay
  draw (R3); opponent-caused Dismantle drain; arc-1 Tripwire self-sac mid-stack; negatives
  (Incantation sac / OPPOSING Physical sac / damage-destruction via the real chokepoint — no
  shipped card damages constructs, so the cause-gate is pinned at applyDamage directly, as the
  brief provides); two Siegeworks = two draws; R1 no-cap (Reinforce 4→7 above printed, printed
  value untouched). **Non-vacuity — 6 mutations, every failure set predicted exactly:** cause
  gate removed (damage negative only); filter inverted to Incantation (7); opponent-scope at
  destroyEntity (5 — decay pins correctly survive, they ride the endTurn call); decay wiring
  disconnected (both decay pins); R3 self-exclusion (own-decay only); anchor clipped at printed
  (R1 only). Hygiene grep clean.
- **Grudrik flag audit (mechanism found):** his effects AND the never-implemented cap sentence
  both date from the INITIAL COMMIT — pre-dating the effectsFlag convention (invented
  2026-07-08). The prose-completeness gate is structurally blind to partials
  (validateCards.ts:267 — any card WITH effects returns early), and the 2026-07-08 PARTIAL list
  was human triage that missed him. **Sweep of the other 99 (sentence-vs-op heuristic, 29 hits
  eyeballed): ONE suspected Grudrik-shaped partial — `Master of Foundations` — ⚠ CORRECTED
  SAME DAY (owner asked to author it; investigation found it was NEVER a partial): its enter
  sentence is the REINFORCE 3 reminder text, implemented via the KEYWORD path
  (parseEnterTrigger → pendingTrigger → resolveTrigger, registry `done: true`) — the sweep
  compared sentences to OPS only and ignored keyword-driven implementations, failing its own
  checklist (op OR keyword OR reminder). Pinned working end-to-end in
  `master_of_foundations.test.ts` (prompt arms on enter, own-side eligibility per canon
  REINFORCE "you control", +3 anchors). Reminder-text tidy APPLIED (owner-ruled same day):
  the card's enter sentence now carries canon's "you control" — data-only change, engine
  behavior was always canonical; verified rendering in the Library.** The
  five known 2026-07-08 partials remain open (Embercast Wand, Ashforged Pendant, Captain's
  Belt, Engineer's Toolbelt, Runic Convergence Staff); everything else was a false positive
  (single ops covering multi-sentence prose). **Guard adopted (cheap):** authoring-checklist
  line added to Conventions below; the sweep script is re-runnable but too noisy to be a hard
  gate (24 false positives) — offered to the owner as an optional advisory validate:decks
  section, not built.
- **Docs (2026-07-15, parent + snapshots word-identical):** Game_Rules_Updated §Constructs
  gained the R1 no-cap Rules Note + the sacrifice-events/triggers Rules Note (R2 restated
  legibly in one place + R3). No residual "maximum Anchor" text anywhere in canon (grep-clean).
  Owner re-uploads: Game_Rules_Updated.md, HANDOFF.md.
- **Open flags for owner:** (1) ⚠ re-record replay fixtures (coverage empty); (2) ~~Master of
  Foundations partial~~ RESOLVED same day — false alarm, see the corrected audit bullet (only a
  cosmetic "you control" text tidy remains optional); (3) simultaneous-decay mutual-hearing reading (above); (4) the
  owner's standing design note: Crystalline Sentinel's text may be replaced later (recorded
  arc 3); (5) live two-peer MP pass over arcs 1–5 holds (unchanged list; arc 5 added none).

## Previous session (2026-07-15, later) — Capability arc 4: on-play triggers (Patient Conjurer) DONE
**Suite: 25 files / 311 tests green (t5 + t8 replay clean, hashes untouched); tsc ZERO;
validate:decks clean.** LOCAL session. Lightest arc as briefed — a LISTENER on arc-1's stack, no
new machinery. Authored **Patient Conjurer** ("When you play a Magical Construct, this character
heals 1.") — **flagged gaps 2 → 1 (Siegeworks only).**
- **Schema:** new reactive Trigger `'ownPlaysMagicalConstruct'` (OWN-side play-window listener).
  `heal` op already existed with the cap-at-max convention (interpreter: min(effectiveMaxHp,
  hp+amt)) — matches the owner-expected reading, nothing surfaced. Magical Construct =
  subtype 'Incantation' (engine-wide convention: eligibleTargets + Animate Magic both key it).
- **Engine:** `gatherOwnPlay` in stack.ts (gatherParanoia discipline, scans the PLACER'S OWN
  board); placeCard queues on-play listeners ABOVE the 'enter' entry for from-hand Incantation
  plays (resolves BEFORE the construct enters — 2026-07-12 canon); >1 listeners ride the
  existing pendingTriggerOrder (identical triggers actively ordered, 2026-07-13 canon — NOT a
  new hold kind). From-hand only (R1 2026-07-15): placeCard IS the sole play path; Animate
  Magic conversions + placePc emit nothing (verified: no other entry-into-play path emits a
  play event). Card play windows never coexist: companion plays gather only Paranoia,
  construct plays only on-play listeners. Zero new GameState fields — t5/t8 byte-identical.
- **Card:** Patient Conjurer = `{ownPlaysMagicalConstruct: [{heal 1, self}]}` — resolution via
  resolveReactiveEntry binds sourceId → 'self' = the Conjurer; a departed Conjurer's queued
  trigger resolves as a no-op (R1 2026-07-12 survival). Toast via the reactive-entry
  "<source> triggers: …" line (no silent outcomes).
- **Tests (`onplay_trigger.test.ts`, 8):** heals 1 (+toast); mandatory no-op at full HP (capped,
  toast still fires); NOT on the opponent's play ("you"); NOT on Animate Magic conversion (real
  interpreter path, R1); NOT on Physical-construct or companion plays; **stack order pinned via
  a synthetic CATALOG listener gated on `controlsType Incantation`** — no draw proves the
  trigger resolved before the construct entered (the condition could only be true post-enter);
  two listeners → active-player ordering prompt + departed-listener no-op + survivor heals;
  arc-1 interop both directions (companion play trips Tripwire not the Conjurer; construct play
  trips the Conjurer not the companion-scoped trap). **Non-vacuity — 5 mutations, every failure
  set predicted EXACTLY in advance and grep-verified restored (arc-3 lesson applied):** gather
  disconnected (4 pins); enter-above-window order flip (order pin only); Incantation filter
  dropped (filter pin only); gather scans the opponent (5 pins incl. the "you" pin); a
  conversion wrongly emitting the event (R1 pin only).
- **INTEROP NOTE (brief's "played construct trips arc-1 reactions" test):** no shipped arc-1
  reaction fires on a CONSTRUCT entering — all three trap windows are companion-scoped — so a
  same-play collision is impossible; the interop pin covers both windows across the two play
  kinds instead (the arc-3 Watchtower-note discipline).
- **Docs (2026-07-15, parent + snapshots word-identical):** Game_Rules_Updated §Triggered
  Abilities gained the R1 note ("Play" means from hand, universally — generalizes the
  2026-07-04 Paranoia ruling); Master_Keyword_List §PARANOIA note now cross-references it as
  the game-wide definition rather than a Paranoia special case. Owner re-uploads:
  Game_Rules_Updated.md, Master_Keyword_List.md, HANDOFF.md.
- **Open flags for owner:** none new. Capability program: ONE flagged system left (Siegeworks).

## Previous session (2026-07-15) — Capability arc 3: restriction auras (Crystalline Sentinel + Reinforced Gate) DONE
**Suite: 24 files / 303 tests green (t5 + t8 fixtures replay clean, hashes untouched); tsc ZERO;
validate:decks clean (100 cards).** LOCAL session — Rules Notes (2026-07-15) in parent +
docs/ snapshots word-identical. Built standing-restriction ("cannot X") aura evaluation at the
legality gates per owner-ratified R1–R4 (2026-07-15) and authored BOTH cards (owner-approved
bundling): **Crystalline Sentinel** ("Opposing back-line companions cannot attack.") +
**Reinforced Gate** ("Opposing companions cannot move between front and back lines.") —
**flagged gaps 4 → 2 (remaining: Patient Conjurer, Siegeworks).**
- **Schema/validator:** static ops `restrictAttack {scope:'oppCompanions', where?.line}` and
  `restrictMove {scope:'oppCompanions', between:'lines'}` — scope deliberately narrowed to the
  engine-supported value (contract honesty; own side is never restricted by design). Tier4
  negative tests (bad scope / where.line / between). **STANDING REQUIREMENT recorded at the
  validator's 'move'-op stub AND in Conventions below: when the interpreter's forced-'move' op
  lands (arc-1 flag), it MUST consult moveRestrictedBy (R3 — restrictions cover forced movement).**
- **Engine (stats.ts):** `attackRestrictedBy` / `moveRestrictedBy` — aura-style gather from the
  OPPOSING side's in-play statics at check time (arc-2 discipline, no cached state → the
  restriction dies with its source, R4). Companions only; moveRestrictedBy returns null for
  same-line (lateral) steps structurally (R4). Both return the SOURCE NAME for player-facing
  reasons.
- **Gates (R1 structural: restrictions AFTER permissions, so "cannot" has the final word):**
  beginAttack (after the Ranged/Watchtower permission block) + resolveAttack (the declaration
  COMMIT re-checks — covers a Sentinel arriving while the targeting UI is up, R2); resolveMove
  (after adjacency/occupancy); reposition arming (resolveActionTarget filters cross-line
  eligibleSlots out — never offered) + resolveActionSlot (defense-in-depth re-check). endTurn
  untouched (restrictions are passive legality). **NO new MP holds — passive legality only, no
  prompts, as the brief predicted.** Zero-cost when absent: no new GameState fields at all;
  t5/t8 byte-identical.
- **Effect-driven attack ops audited:** `extraAttack` only refreshes the budget — the actual
  attack still routes through beginAttack/resolveAttack → restriction applies; `forceAttack`
  resolves from the controller's own FRONT-line companions only → cannot collide with a
  back-line attack restriction (noted, nothing to change). **Watchtower interop: the brief said
  Watchtower affects constructs — it actually covers back-line COMPANIONS (engine + doc), so it
  CAN collide with the Sentinel; pinned: the restriction overrides the Watchtower grant.**
- **UI (no silent outcomes):** LoadoutPanel's Attack button renders DISABLED (0.45 'used' state)
  with tooltip "Cannot attack — <source> (opposing aura)"; beginAttack/resolveAttack/resolveMove
  refusals toast the source; CommandZone never highlights a Gate-blocked destination (verified
  live: back-line mover with the Gate up offers exactly "Empty slot B2", the lateral step);
  reposition prompts never offer cross-line slots. DOM/eval verification (screenshot tool still
  hangs on the live board — known gotcha).
- **Tests (`restriction_auras.test.ts`, 14):** R1 Ranged-vs-Sentinel + Watchtower-grant-vs-
  Sentinel (with no-Sentinel control); Sentinel scope (front-liner attacks; OWN back-line Ranged
  free; legal again after a REAL destruction path — sacrificeEntity → destroyEntity); R2
  (unrestricted declaration resolves; the commit re-check refuses a mid-targeting Sentinel);
  Gate scope (front→back AND back→front blocked, no move consumed on refusal; own side crosses
  freely; lateral unrestricted; entry-not-movement via real placeCard; legal again on leave);
  R3 reposition (cross-line slots not offered + executor re-check refuses a forced slot); both
  auras independent (combined board). **Non-vacuity — 7 mutations, each caught by exactly the
  expected pins, all restored:** gate disconnected (5 pins); attack-scope inverted to own side
  (6 pins incl. the own-side pin); move-scope inverted (move pins incl. own-crosses-freely);
  permission-overrides-restriction (the 4 cannot-beats-can pins — commit-recheck pin correctly
  survives); lateral guard removed (3); where.line ignored (3); reposition arming filter
  removed (1). HARNESS NOTE: one mutation's restore initially failed silently (python
  string-replace didn't match after a line merge) and CONTAMINATED two runs — caught because
  the failure set didn't match the prediction; re-ran clean. Predict the exact failure set for
  every mutation and verify `grep MUTATION` returns nothing before the final gate.
- **Docs (2026-07-15, parent + snapshots word-identical):** Game_Rules_Updated §Core Mechanics
  gained the "Standing Restrictions" block (R1/R2/R3 + scope bullets, card-agnostic);
  Master_Keyword_List §RANGED gained the permission-vs-restriction pointer note. Owner should
  re-upload Game_Rules_Updated.md + Master_Keyword_List.md + HANDOFF.md to the design Project.
- **OWNER DESIGN NOTE (recorded here, NOT in the rules docs):** the owner considers Crystalline
  Sentinel's current text weak and may replace/re-word it later (e.g. "Characters with Ranged
  cannot attack from the back line"). The CURRENT canon text is implemented as written, for
  completeness — do not redesign the card without an owner ruling.
- **Open flags for owner:** none new. (Standing: live two-peer MP over the arc-1/arc-2 holds;
  the forced-'move'-op requirement above when that op lands.)

## Previous session (2026-07-14) — Capability arc 2: damage prevention + Reflecting Pool DONE
**Suite: 23 files / 286 tests green (t5 + t8 fixtures replay clean, hashes untouched); tsc ZERO;
validate:decks clean (100 cards).** LOCAL session — Rules Notes landed in parent + docs/ snapshots
word-identical in the same change. Built the damage-prevention capability at the applyDamage
chokepoint per owner-ratified R1–R4 (2026-07-14) and authored **Reflecting Pool** (effectsFlag
removed — flagged gaps 5 → 4: Crystalline Sentinel, Patient Conjurer, Reinforced Gate, Siegeworks).
- **Schema/validator:** new `preventDamage` op (static aura; `amount`, `scope:
  'ownCompanions'|'ownParty'`, `where?.cls`) — scope deliberately narrowed to engine-supported
  values (contract-honesty precedent); tier4 negative tests (amount<1, unsupported scope, empty
  where.cls). Reflecting Pool = `{static: [{preventDamage 1, ownCompanions, cls Wizard}]}`.
- **Engine (combat.ts):** `preventionEffectsFor` (aura-style gather from the AFFECTED side's board
  statics at damage time; constructs never covered; 'ownCompanions' excludes the PC),
  `combatDealt` (R1: Bane doubling forms the dealt amount BEFORE prevention — single source for
  applyCombatHit + the pause), `applyPreventionOrder` (the shared ordered walk: prevent-N cuts;
  an armor piece reached with damage remaining prevents ALL of it + takes its counter; a piece
  reached at 0 never engages — R3's canonical consequence). `applyDamage` now: forced-plan walk
  (combat resume) / single-pool silent-apply-with-toast / ≥2-items NON-COMBAT DEFERRAL (HP outcome
  is order-independent — armor present → 0, else dmg−Σ — and lands at damage time; only the
  counter decision defers via the new OPTIONAL `game.preventOrderQueue`, armed at armPrompts) /
  legacy armor path byte-identical when no pools. R2 falls out of tookDamage: a prevented-to-0
  hit produces no DamageEvent, no Poison, no onDealDamage.
- **Prompt (R3):** new synced OPTIONAL `game.pendingPreventOrder` (both new fields undefined when
  absent/drained → prevention-free games keep their exact canonical replay hash, same discipline
  as the stack fields — t5/t8 prove it). Combat: driveAttack pre-pauses per hit when ≥1 pool and
  pools+armorPieces ≥ 2 (each armor piece is its own orderable item — ordering a piece first both
  engages armor and picks the piece, so the pause subsumes the legacy piece-pick when pools are
  present; ARMOR-ONLY hits keep the legacy PendingArmor flow untouched). Store
  `resolvePreventOrder(idx)` = blind picks (PendingTriggerOrder pattern), then combat-resume via
  applyCombatHit(plan)+driveAttack+finalizeAttack, or deferred counter-only walk + arm-next.
  UI `PreventOrderModal` (forced, no decline; render-gated behind pendingArmor). endTurn refuses
  on open ordering/queue; resumeStack + StackResumeDriver + keyboard modalUp gates extended;
  armNextItemTransfer holds behind it. **reactiveHold covers the non-chooser — live two-peer MP
  UNTESTED, joins the existing list (arc-1 holds, hand-off).**
- **Chokepoint audit (every damage source):** THROUGH applyDamage: combat hits + Cleave splash
  (applyCombatHit), interpreter `damage` op (actions, activated abilities, attackDisarm, arc-1
  reactive/trap damage via resolveActionEffects), `damageSelfPC`, and — **RE-RULED same day
  (owner 2026-07-14, ruling round below)** — **Reckless recoil**, which now routes through
  applyDamage: armor absorbs it (counter spent) and prevent-N effects reduce it (a pools+armor
  collision takes the non-combat deferral — the after-phase never pauses; PC-defeat credit
  attribution unchanged). The 2026-07-03 tier1 pin "Reckless bypasses armor" was REWRITTEN as
  the re-ruled pin (dated comment), + a pool-prevents-recoil pin in prevention.test.ts; both
  mutation-proven against the old direct write; recoil now also honors hpFloor1 (chokepoint
  side-benefit). Rules Notes: Master_Keyword_List §RECKLESS + Game_Rules_Updated (keyword line +
  the prevention scope bullet), parent + snapshots. t5/t8 still replay clean (no recorded
  armored-Reckless attack). REMAINING BYPASSES (deliberate): **Poison-failure damage** (resolvePoison
  → setPcHp — dealt to the PLAYER per canon, never companion-covered; also bypasses PC armor —
  consistent with "player damage", flagged for awareness); **payHP costs** (costs, not damage —
  documented); **sandbox adjustHp** (manual debug control, not damage). armNextPreventOrder's
  collapsed-case auto-counter drops its msgs like armNextArmorChoice always has (board chip shows it).
- **Armor prompt conformance VERIFIED (no divergence):** ArmorModal is a forced piece-pick — no
  decline/skip path exists anywhere (modal has no cancel footer; resolveArmor requires a real
  candidate; non-combat single piece auto-absorbs). Canon "prevention is mandatory" holds.
- **Tests (`prevention.test.ts`, 10):** R1 4−1=3 Bane×pool pin; R2 prevent-to-zero (no Poison, no
  Burning Heir onDealDamage ping); R3 armor+pool 1-damage BOTH ways through the real prompt (incl.
  endTurn refusal + chooser=defender); two-pool stacking (prevent 2, via prompt); per-hit Cleave
  splash; scope exclusions (Rogue companion + Wizard PC uncovered); trap interop (Tripwire's
  damage prevented; Iron Spikes' declaration-window damage → the non-combat DEFERRAL path:
  HP at damage time, ordering armed post-stack, pool-first spends no counter). **Non-vacuity —
  8 mutations, each caught by exactly the expected pin(s), all restored:** (2−1)×2 reading → R1;
  poison ignores tookDamage → R2; chooser flipped to attacker → R3; armor engages at 0 → both
  no-counter pins; splash-slot uncovered → Cleave; gather sliced to 1 → stacking; scope guards
  deleted → scope; gather returns [] → all 9 positive pins.
- **Preview E2E (real UI):** modal renders on a live pool+armor hit; clicking "Reflecting Pool —
  prevent 1" resolves pool-first: hp intact, 0 counters, toast "Reflecting Pool prevents 1 of the
  damage to Storm-Touched" (no silent outcomes). Screenshot tool still hangs on the live board
  (known gotcha) — DOM/eval verification used.
- **Docs (dated 2026-07-14, parent + docs/ snapshots word-identical):** Game_Rules_Updated
  §Core Mechanics gained the "Damage Prevention" block (R1/R2/R3 Rules Notes + scope/application
  bullets, card-agnostic); Master_Keyword_List §ARMOR X gained the prevention-family Rules Note;
  Card_Design_Parameters §15 gained the prevention pointer note + **PRINCIPLE (2026-07-14): No
  arbitrary orderings between cards** (R4 verbatim). Owner should re-upload all three + HANDOFF
  to the design Project.
- **Ruling round (owner, in-session 2026-07-14):** (1) Reckless recoil IS covered by prevention
  → implemented same day (see the audit bullet above); (2) two-pool-no-armor ordering prompts
  stay AS IS ("correct as is") — literal R3, no engine default; (3) the MP-untested note was
  informational only.
- **Open flags for owner:** (1) live two-peer MP pass over the new prevention hold (joins the
  existing untested-holds list); (2) deferred orderings re-derive items at arm time (armor-queue
  discipline) — a pool destroyed between damage and arming silently drops out (mild
  counterfactual, documented).

## Previous session (2026-07-13, later) — design-doc housekeeping: root cleanup + archive/ DONE
LOCAL filing session (no engine/test/doc-content changes; owner-approved proposal in
`tasks/cleanup_proposal_2026-07-13.md`). Every duplicate was compared by CONTENT before moving;
NOTHING was deleted — moves only, into a new root `archive/` (subfoldered by origin).
- **Root is now the single master location for every design doc.** `Rules_Taxonomy.md` PROMOTED
  to the root (the `play testing/` copy; all three prior copies were byte-identical). The
  `May 2026 files/` and `play testing/` folders (identical-twin May 4 snapshots, fully superseded
  by the July root masters — verified keyword-by-keyword and section-by-section) moved wholesale
  to `archive/from May 2026 files/` + `archive/from play testing/`.
- **Archived from the root**: Card_Generation_Workflow.docx (quarter-length partial of the .md),
  USER_GUIDE.md.pdf (manual for the RETIRED pre-app Python card tool), Keyword_Glossary_New.txt
  (folded into Master_Keyword_List — owner confirmed), twilight-workbench-v5.html +
  sorcerer_warrior_50.json (pre-app workbench — owner confirmed retired), three `~$` Word lock
  files, stale root `node_modules/` + `.vite/` caches. From `Ashglow March/`: the July 31
  .docx.pdf + ashglow_march_word_doc.md exports (the .md holds some early-draft wording, e.g.
  "Ashgrove" — preserved in archive). Old `Archive (old versions)/` folded in as
  `archive/old versions/`.
- **Verified after the moves**: all five `twilight-app/docs/` snapshots (3 canon docs,
  Rules_Taxonomy, HANDOFF) hash-identical to their root masters; `start-dev.js` still boots the
  app clean via the preview launcher (full library renders, zero console errors) — it never used
  the root caches.
- **NEW root guide `WHERE_THINGS_LIVE.md`** — one-page owner-facing map: root = masters,
  archive/ = never-delete, docs/ = session-managed snapshots, the LOCAL vs CLOUD environment
  rule (also added to Conventions below).
- **Owner should refresh the design Project uploads**: Game_Rules_Updated.md,
  Master_Keyword_List.md, Card_Design_Parameters.md, **Rules_Taxonomy.md (likely never uploaded
  before)**, tasks/HANDOFF.md; REMOVE from the Project if present: Keyword_Glossary_New.txt and
  any May-era copies of the canon docs.

## Previous session (2026-07-13) — trap-arc branch merged + Rules Notes mirrored to parent canon DONE
Documentation-only session (no engine or test changes). **Suite re-confirmed post-merge: 22
files / 276 tests green; tsc ZERO.**
- **Merged `origin/claude/reactive-trigger-traps-3qpvsf` (b99e142) into main** (fast-forward)
  and pushed — the 2026-07-12 trap-arc session below existed only on that remote branch until
  now.
- **Task 1 — parent canonical docs updated** (owner-supplied card-agnostic wording, inserted
  verbatim): parent `Game_Rules_Updated.md` gained the "Triggered Abilities & The Trigger
  Stack" block (Rules Notes: The Trigger Stack 2026-07-12; Mandatory triggers 2026-07-12;
  Identical simultaneous triggers 2026-07-13 — active player orders even identical copies, no
  auto-ordering exception; "Moves into" a line or zone 2026-07-13 — movement-only, entering
  directly onto a line or lateral same-line repositioning does not count) + the attack
  declaration/damage separation note under Targeting Rules; parent `Master_Keyword_List.md`
  §PARANOIA gained the ordering RE-RULE (peek resolves BEFORE the played companion enters —
  supersedes the 2026-07-04 ordering); parent `Card_Design_Parameters.md` gained the §Triggered
  Abilities pointer line (mirror of the snapshot's).
- **Task 2 — docs/ snapshots aligned**: b99e142's card-named Rules Note phrasings (Tripwire
  Snare / Pit Trap / Iron Spikes examples) in `docs/Game_Rules_Updated.md` +
  `docs/Master_Keyword_List.md` replaced by the card-agnostic wording, now WORD-IDENTICAL to
  the parent docs (owner convention 2026-07-13: rules docs never reference individual cards —
  card-level specifics stay in the pinning tests, unchanged). The two 2026-07-13 notes are new
  canon. The trap-windows note's card specifics (Pit Trap movement-only; Iron Spikes
  declaration window) are now expressed by the generic "Moves into" + attack-separation notes
  and remain pinned in `trigger_stack_traps.test.ts`.
- **Task 3 — `docs/Rules_Taxonomy.md` added** (verbatim copy of the parent taxonomy; the two
  parent copies in `play testing/` and `May 2026 files/` are byte-identical). It is
  load-bearing: gameStore/engine cite Rules_Taxonomy Tier 5 #9 / Tier 3 #18 (active player
  orders simultaneous triggers).
- **Canonical `tasks/HANDOFF.md` (parent) re-synced from this file** — it had been missing the
  2026-07-10 and 2026-07-12 entries (those sessions were repo-only and updated docs/HANDOFF.md
  directly).
- Parent files touched (outside the repo — owner should re-upload to the design Project):
  `Game_Rules_Updated.md`, `Master_Keyword_List.md`, `Card_Design_Parameters.md`,
  `tasks/HANDOFF.md`.

## Previous session (2026-07-12) — Capability arc 1: trigger stack + the three trap cards DONE
**Suite: 22 files / 276 tests green (t5 + t8 fixtures replay clean); tsc ZERO; validate:decks
clean (100 cards).** Built the reactive-trigger foundation (owner-ratified rulings R1–R4,
2026-07-12) and authored **Tripwire Snare / Pit Trap / Iron Spikes** (effectsFlags removed —
8 deferred gaps → 5). Dated Rules Notes: Game_Rules_Updated.md §Core Mechanics "Triggered
Abilities & The Trigger Stack", Master_Keyword_List §PARANOIA (R3 supersession),
Card_Design_Parameters §13 (pointer). **docs/ snapshots only — the parent-dir canonical docs
are NOT in this repo; owner must mirror the new Rules Notes there.**
- **`src/engine/stack.ts` (new, headless)** — the LIFO trigger stack primitives: `StackEntry`/
  `ReactiveStackEntry`/`PendingTriggerOrder` types live in engine/state.ts as OPTIONAL
  GameState fields (`triggerStack?`, `pendingTriggerOrder?` — set back to `undefined` when
  drained, so stack-free games keep their exact pre-arc canonical replay hash);
  `gatherReactive`/`gatherParanoia` (slot-order scans), `resolveReactiveEntry` (runs the
  source CARD's clauses with the subject bound to the new `eventSubject` TargetSpec),
  `orderedForStack`, `setStack`/`pushStack`, `reactiveLabel`. The DRIVER (`runStack`) is
  store-level (gameStore): 'attackDamage' finalizes via finalizeAttack (activation seal) and
  'ownEnter' arms store-LOCAL prompts. Pauses: Paranoia peek, `pendingTriggerOrder` (synced,
  TriggerOrderModal in Play.tsx, blind picks, resolveTriggerOrder), mid-combat armor, and the
  MP 'ownEnter' hand-off (`resumeStack` + StackResumeDriver effect in Play.tsx; reactiveHold
  covers the non-owner for both new pause kinds). endTurn refuses while the stack/ordering is
  unresolved. NOT LIVE-TWO-PEER TESTED yet (the hand-off + ordering holds ride the existing
  reactiveHold wire machinery).
- **R1 (placeCard restructured):** playing a card puts it ON the stack (costs paid up front;
  the entity + hand Card ride the 'enter' entry); it enters only when the stack empties down
  to it. The old placeCard back-half is extracted VERBATIM as `runOnEnter` (an 'ownEnter'
  stack item — Oathsworn arming included); enter-event queue order is the ruled sequence:
  own on-enter first, reactive traps above (traps resolve first; a queued on-enter still
  resolves if the enterer died to a trap — pinned with a 1-HP + draw test AND an
  order-observable heal test).
- **R2 (commitAttack restructured):** declaration and damage are separate steps. onAttack is
  now a DECLARATION-window trigger: `resolveCombatTriggers` gained a `which` filter,
  driveAttack's after-phase fires only onDealDamage/onKill, and commitAttack queues
  [attackDamage, ownAttack?, reactive traps…] — dead attacker → damage never queued, the
  attack FIZZLES (toast). Attacks with no declaration triggers take the legacy inline path
  byte-identically. NOTE: optional onAttack clauses (Mara) still resolve as no-ops so the
  per-clause interpreter die keeps the recorded RNG cadence of committed fixtures.
- **R3 (Paranoia RE-RULED — supersedes the 2026-07-04 order):** the peek resolves BEFORE the
  companion enters ("Peek first 100%"). armParanoia + the PeekRequest path are GONE — each
  Paranoia is a stack entry arming pendingPeek at resolution (multi-Paranoia re-slices
  naturally); resolvePeek/cancelPeek re-enter the stack, then fall back to the start-of-turn
  peek queue. The old pins were REWRITTEN with dated re-rule comments (keyword_paranoia).
  CONSEQUENCE: two Paranoias on one play now hit the >1-simultaneous ordering prompt (the
  placer orders two identical peeks — flag if the owner wants identical triggers auto-ordered).
- **R4 (traps authored, wizard_builder_50.json):** new Triggers `oppCompanionEnters` /
  `oppCompanionMovesToFront` / `oppCompanionAttacksCompanion`, new `exhaust` op, `sacrifice`
  implemented for target:'self' ONLY (routes destroyEntity — sacrifice IS a death; other
  targets stay documented no-ops). Pit Trap is wired at resolveMove + the reposition
  resolveActionSlot (movement only; **"moves into the front line" encoded as arriving from
  OUTSIDE it — a lateral front→front step does not trip it; pinned as ENGINE reading, flag
  for owner confirm**). Mandatory-trigger rule: an exhausted mover still trips Pit Trap.
  Iron Spikes persists (no self-sac). Validator mirrors updated (AssertNever forced it).
- **Fixture RETIRED by name: `twilight-solo-d4d3311-t5b.replay.json`** — replay hit an RNG
  underrun at step 67 (`resolveMove`): a companion moved into the front line with an opposing
  Pit Trap on the board, which was a flagged no-op when recorded and now FIRES (intentional
  rule change). Owner re-records on the new engine from a RESTARTED server. t5 + t8 replay
  clean — the R2 onAttack reorder did NOT diverge them.
- **Non-vacuity (all mutation-proven, then restored):** fizzle disabled → 2 R2 pins fail;
  enter-queue inverted → heal-order pin fails; Pit Trap gathered on enter → movement-only pin
  fails; orderer flipped to trap controller → active-player pin fails; enter-before-peek →
  both R3 pins fail.
- **Open flags for owner:** (1) mirror the 2026-07-12 Rules Notes into the parent canonical
  docs (repo holds only snapshots); (2) Rules_Taxonomy is cited by reference but NOT
  snapshotted in docs/ — consider adding it; (3) re-record t5b; (4) the interpreter 'move'
  op (forced movement) is still unimplemented — when it lands, Pit Trap wiring must cover it;
  (5) live two-peer MP pass over the new holds/hand-off; (6) identical-simultaneous-trigger
  auto-order UX question above. Decay-death-trigger wiring (named debt #2) stays OUT of this
  arc per instructions.

## Previous session (2026-07-10) — gameStore extraction: headless src/engine/ DONE
**Suite: 21 files / 263 tests green (incl. all three replay fixtures); tsc ZERO; validate:decks
clean.** Executed `tasks/refactor_extraction_plan.md` as 8 slices / 8 commits, move-only (zero
behavior edits, zero test edits beyond the new guard test). `gameStore.ts` 3,843 → ~2,300 lines.

**New module map — `src/engine/` (headless; no store/screens/React/Zustand imports, enforced
transitively by the PERMANENT `src/__tests__/engine_deps.test.ts`):**
- `engine/geometry.ts` — SlotId/Board types, ADJ, FRONT_SLOTS/BACK_SLOTS, isFront, findSlot.
- `engine/state.ts` — GameState/PlayerState/ClassZoneCard/Phase + every game-level (synced)
  prompt type: PendingPeek/PeekRequest, PendingDeadPick, PendingCoercion, AttackCtx/DamageEvent/
  ArmorChoiceData/PendingArmor, PendingAttackChoice, PendingModalChoice, PendingItemTransfer.
- `engine/stats.ts` — the whole former `store/keywords.ts` (effectiveAttack/MaxHp/Keywords,
  recomputeStatics, auras, suppression, wardedLines, currentWillpower, canPlayActionCard…).
- `engine/entities.ts` — findEntityAnywhere/updateEntity/removeEntity, destroyEntity (the shared
  exit path), deadCardsOf/itemCardsOf/itemTransferOf/itemProfileOf, itemTransferCandidates,
  armNextItemTransfer, setPcHp/payPcHp, pcIdOf/companionIds/constructIds/charsOf/
  ownPhysicalConstructIds.
- `engine/interpreter.ts` — resolveActionEffects (the big op switch), eligibleTargets,
  isInteractiveSpec, conditionMet, amountValue, effectsWouldAffectSomething, effectTargetSpec/
  actionTargetSpec, twoStepKind, permanentEffects, effectsOfCard, gatherActivated/
  ActivatedAbility, abilityUsedTag, magicCtx/staticMagicBonusOf/magicActionDamageBonus, EffectCtx.
- `engine/combat.ts` — applyDamage, applyCombatHit, driveAttack, optionalAttackAbility,
  attackDamageBonus, armor helpers (armorPiecesOf/pickDefaultArmor/applyArmorCounter), trigger
  machinery (CombatClause, combatTriggerEffects, eventMatches, resolveCombatTriggers,
  resolveRemovalTriggers, hasRemovalTrigger), prompt arming (armDeadPicks, armNextArmorChoice,
  armPrompts).
- `engine/lifecycle.ts` — resolveStartOfTurn, buildPeek/nextPeek, controlsPreventAnchorDecay,
  makeNewGame/dealPlayer/makePc/SETUP_SEQUENCE, computeWillpower, freshActs, seatName, shuffle,
  rollD6, uid, equipOnto, kitDests.
- `engine/rng.ts` — the randomness boundary (moved from store/rng.ts).
- `engine/index.ts` — barrel; gameStore does `export * from '../engine'` so EVERY old import
  site still works. `store/keywords.ts` and `store/rng.ts` are one-line re-export shims.

**The store shell (`gameStore.ts`) retains:** the create chain (persist/record/
subscribeWithSelector), all reducers (gates → engine calls → prompt arming → broadcast),
store-local prompt types + LOCAL_PROMPTS_CLEARED, reactiveHold, gameIsOver/notActionPhase,
isSealed/activationPatch (activation-lock, per plan), and — documented deviations from the
plan's slice lists — `commitAttack`/`finalizeAttack` (they seal activation via activationPatch,
which the plan rules store-level) and `readyPlayer` (an inline closure in endTurn writing into
closure-captured sinks; extracting it needs a NEW signature = a design decision, not a move —
RULED by the owner 2026-07-10: stays as-is, folded into the decay-trigger wiring item of the
engine-capability program — decay will route through the engine's shared exit path there, and
the readyPlayer split gets designed with it). Engine-internal module cycle entities↔combat↔interpreter is
function-level only (hoisted, runtime-safe) and mirrors the plan's own module map. The plan's
"~700–900 line" shell estimate was written against a 4,100-line file; the reducers + store-local
types are simply bigger than estimated — nothing pure remains that could move without redesign.

## Previous session (2026-07-08) — playtest bug batch, Item Transfer, sacrifice audit, completeness gate
**Suite: 20 files / 262 tests green; tsc ZERO; validate:decks clean (100 cards).** Two commits:
`fd0ef36` (bug batch) and the combined follow-up (Item Transfer + audit + gate + rulings batch 2).
The committed replay fixture was DELETED (it pinned superseded behavior) — the owner re-records on
the fixed engine from a RESTARTED server; the REC chip now shows its build stamp (`⏺ REC @<hash>`).
- **Bug batch (`fd0ef36`)**: Cleave splash hits CHARACTERS only (constructs can't be attacked);
  PC attack exhaust was store-correct but PcCard never RENDERED rotation (fixed + Rules Note);
  Hit & Run pinned per canon (optional extra move; exception to movement-first; Rules Note);
  GAME-OVER GATE on every gameplay reducer (also fixes endTurn WIPING gameOver to null);
  ACTION-PHASE GATE at reducer level (mutators refuse outside 'action'; czToHand/handToCz now
  enforce cz-phase + once-per-turn — czExchangeUsed was write-only; CZ panel says "Skip
  exchange →"); modal scrim lightened + CardFace default hover → preview pane works from modals;
  replay divergence report labels checkpoint diffs as CUMULATIVE + carries live state.
- **Item Transfer on Character Exit** (rules §Items; RULED: ALL exits incl. death): synced
  `pendingItemTransfer` + queue. Items go to the Dead Zone IMMEDIATELY (zone behavior unchanged —
  zero old tests broke); the window CLAIMS them back (`resolveItemTransfer(charId)` → equipOnto +
  exhaust the rescuer, once per event via usedIds; `declineItemTransfer`). Collection: destroyEntity
  (all destructions), bounce (incl. FIXED Manifest leave-sacrifice item loss), ready-phase flee.
  Arming defers to resolution boundaries (`armNextItemTransfer` via armPrompts + every prompt
  resolver); RULED: Poison resolves BEFORE transfer windows (Rules Note §Ready Phase); PC is an
  eligible rescuer; mid-combat windows defer. reactiveHold + banner cover the non-owner.
- **Sacrifice/ability audit** ("silent no-op" bug class): `sacrifice`/`discard` Cost kinds had NO
  payment branch (abilities resolved COST-FREE) → RULED: REMOVED from the schema (re-add with
  engine support); runtime guard still refuses legacy data. sacrificeSelf now routes through
  destroyEntity. Costs + targets validated BEFORE paying (a Quill with no construct keeps its
  quill). The "✕ Sacrifice" button was adjustHp(-999) — clamps to 0, removes NOTHING, toasts
  success — now a real `sacrificeEntity` reducer. Payability gates: payHP never lethal,
  exhaustSelf refuses when exhausted, removeAnchor refuses when short + sacrifices at 0 (pinned
  engine default). CATEGORICAL UX RULE: every refusal in activateAbility toasts its reason.
  PERMANENT `ability_sweep.test.ts`: dynamic catalog sweep — zero silent outcomes, auto-covers
  minted cards; per-cost-kind contract via synthetic CATALOG cards.
- **RULED (2026-07-08): sacrifice IS a death** — death/destroy triggers (Memory Stone) fire on
  EVERY sacrifice, centralized in destroyEntity (Rules Note §Dead Zone). Ready-phase decay is
  worded as sacrifice too but runs in readyPlayer — no shipped construct carries a death trigger,
  so wiring is deferred + FLAGGED. RULED: an ability that would affect NOTHING cannot be
  activated (universal pre-cost refusal, incl. non-interactive recipients).
- **Prose-completeness mint gate**: a card whose rules text implies behavior beyond its DECLARED
  keywords must carry effects or a dated owner-approved `effectsFlag` (new Card field). Reminder
  text exempt via ≥75% vocabulary containment in the keyword's CANONICAL definition —
  KEYWORD_DEFS (src/data/keywords.ts) was rewritten to QUOTE Master_Keyword_List VERBATIM (old
  entries were paraphrases; Untamed had drifted "Items"→canon "Gear"). The sweep found 11 gaps;
  owner triaged: **AUTHORED Bastion Wall (new `grantKeywords` static aura op), Watchtower (new
  `backLineAttack` op — attack eligibility only, deliberately NOT a Ranged grant), Pyre of the
  Unbound (new startOfTurn MODAL flow: `pendingModalChoice` + queue, resolveModalChoice/
  declineModalChoice, ModalChoiceHost; cost paid at resolution)**; the other 8 carry
  `effectsFlag: "awaiting engine capability: <system> (owner 2026-07-08)"` (Patient Conjurer,
  Reflecting Pool, Crystalline Sentinel, Tripwire Snare, Pit Trap, Iron Spikes, Reinforced Gate,
  Siegeworks) — the engine-capability program is scheduled post-refactor. PARTIAL gaps (authored
  cards whose text exceeds their clauses, human triage): Embercast Wand, Ashforged Pendant,
  Captain's Belt, Engineer's Toolbelt, Runic Convergence Staff.
- **FIXTURES RE-RECORDED (owner, same day, committed)**: three solo fixtures on `d4d3311`
  (t5 / t5b / t8), all replay clean with `demotions: []`. GOTCHA FIXED: two same-turn-count
  games on one commit produced the SAME filename — the browser's "(1)" copy fell outside the
  test glob and sat silently untested. `download.ts` now appends a base36 `recordedAt`
  uniquifier, and a fixtures-folder HYGIENE test (replay.test.ts) fails the suite BY NAME on
  any non-conforming or unglobbed file in `src/replay/fixtures/`.
- **NEXT**: the engine-capability program (8 flagged systems) post-refactor.

## Previous session (2026-07-06) — Phase 2 replay recorder + runner DONE (solo v1)
test_seed_plan.md Phase 2: record a solo game's action/state sequence to JSON, replay it against
current code, fail loudly on any divergence. Every real sandbox playtest can now become a
permanent regression fixture. **Suite: 15 files / 187 tests green; tsc ZERO; validate:decks clean.**
- **One randomness boundary** (`src/store/rng.ts`): `rng.next()` (delegates to `Math.random()` via
  a wrapper so `vi.spyOn(Math,'random')` still works). `rollD6` + `shuffle` (gameStore) and the
  PoisonModal die route through it. `beginCapture/endCapture` (recorder) and `setSource` (replay).
- **Entity ids were non-reproducible** (`placed-<cardid>-${Date.now()}`, `cz-${Date.now()}`). NEW
  `uid(prefix)` (gameStore) draws the unique suffix from `rng` → captured + replayed. This was the
  bug the round-trip test caught. (deckStore's `deck-${Date.now()}` left alone — not game state.)
- **Interception = a `record` middleware** innermost in the store's create chain
  (`src/store/recordMiddleware.ts`): wraps every action; re-entrancy depth guard (only the
  outermost records); a DENY list (cosmetic/session: setHovered, pushToast, open/closePile,
  setConn, set/clearBroadcast, saveGame, backToLobby, resumeGame, startMultiplayer, assembleMpGame);
  captures RNG draws per action.
- **Recorder** (`src/replay/recorder.ts`): always-on, in-memory. `startSolo` → snapshot `init`
  (post-shuffle) + begin. Each action → `{action,args,rng,hash}` (or a `paste` entry when an arg is
  a function, e.g. setGame(fn) — the primitive MP will reuse). Full snapshot at each turn boundary.
  Recording is a **pure append**. `subscribe/getStatus` drive the UI.
- **Validity is decided at EXPORT by replaying the log** (owner redesign 2026-07-06 — the original
  per-action hash-drift check was too fragile in a live React runtime: benign interleaving from
  StrictMode double-invoke / render-driven setGame effects made `preHash != lastHash` fire on
  normal sandbox play, spuriously invalidating recordings). `src/replay/exportReplay.ts`
  **`tryExport()`** runs the log through `replay()` in-process against the live store —
  **non-destructively** (snapshots the store, replays, restores; React never sees the transient
  state since it's all synchronous) — the deterministic oracle for "is this a valid fixture":
  clean → export; `ReplayDivergence` → refuse with the full step/action report. Plus a small **hard
  BOUNDARY list** (`resumeGame`, `startMultiplayer`, `assembleMpGame`) — enumerable, deterministic,
  genuinely unreplayable game-replacements — that refuses early (`recorder.onBoundary`, surfaced as
  `status.invalidReason`). Hot-path per-action hashing is GONE (perf + no false drift).
- **Log format** (`src/replay/format.ts`): `{format, commit (vite `__COMMIT_HASH__` define), mode,
  init, initHash, entries[]}`. Hash = cyrb53 over a key-sorted **canonical slice** = `game +
  localPlayer + conn.mode + the store-local prompts` (pending/pendingPlay/pendingTrigger/pendingKit/
  pendingActionTarget/pendingEquipPick/oathContext/modalQueue); EXCLUDES toasts/hovered/pileView/
  savedGame/_broadcast (volatile). NB: NOT identical to LOCAL_PROMPTS_CLEARED (−pileView, +oathContext
  +modalQueue). All combat/scry prompts live in `game` → hashed there.
- **Runner** (`src/replay/replay.ts`): version-gate → apply `init` (assert initHash) → per entry a
  fresh RNG cursor over `entry.rng` that **throws on underrun** (drawn past the end) and asserts
  **exact-empty after** (surplus); re-execute action / paste `setState`; hash-diff → `ReplayDivergence`.
  The divergence report names the **first diverging canonical field** (`firstDiff` in format.ts,
  recorded-vs-replayed with both values) — not just two opaque hashes. Action entries carry a full
  `state` snapshot IN MEMORY for that diff; `download.ts` strips it so fixtures stay compact.
  `recorder.suspend()` during replay so it doesn't self-record.
- **UI**: `RecorderButton` (bottom-left chip, `useSyncExternalStore`) — "⏺ REC · N actions · T turns"
  during play (NO in-play "invalidated" state — pass/fail moved to export). Click → `downloadReplay()`
  (validate + download); a **failed validation shows a COPYABLE error panel** (readonly textarea +
  Copy button, and `console.error`) because the hashes/field-diff are impossible to transcribe by
  hand. Same copyable panel on GameOverScreen (its z-index sits above the chip at game-over). Fixtures
  dir `src/replay/fixtures/*.replay.json` (a Vitest test globs + replays them; none committed yet).
- **Tests** (`src/__tests__/replay.test.ts`): rng capture→inject reproduces a shuffle; record a real
  die-rolling solo game (Flame-Spinner on-enter, via a seeded position + a `_beginForTest` seam) →
  **replay through actual `JSON.parse(JSON.stringify)`** clean (reference-identity guard); tamper /
  underrun / surplus throw; **export validation** (`tryExport(logOverride?)`): a normal game (incl.
  a die roll) + inter-action churn export clean; a resumeGame-crossing recording refuses with a
  `resumeGame` reason; a **hash-tampered** log AND an **rng-short** log are BOTH refused at export
  with the divergence/underrun report (tryExport inherits replay()'s rejection, not only boundaries);
  and export is **non-destructive** — a diverge-every-canonical-field-then-export test asserts the
  full canonical slice (game + localPlayer + conn.mode + every store-local prompt) is restored
  exactly (proven non-vacuous: a game-only restore fails it).
- **Preview E2E**: sandbox game runs with the middleware over all 126 actions (no console errors);
  the chip stays "⏺ REC" through setup + endTurn + switchSides (the exact flow that spuriously
  invalidated under the old drift check); clicking it validates via replay + downloads with no error,
  and the live game is intact afterwards (non-destructive validation confirmed).
- **FLAG / next**: v1 is **solo two-handed only** — MP host recording (own actions + guest turns as
  `paste` remote-syncs) is the documented follow-up that reuses the paste primitive. No fixtures are
  committed yet — the owner records real games and drops the JSON into `src/replay/fixtures/`.

## Session (2026-07-04, later) — audit batch 4: guest deck in READY (audit #11) DONE
*(Landed alongside the same-day keyword/Paranoia session below, on its combined tree — suite
was green at 14 files / 178 tests after both.)* The guest's built deck used to be **silently
discarded**: the host assembled the game from its own two Lobby dropdowns ("Your deck" → p1,
"Opponent deck (sandbox)" → p2) and broadcast it wholesale, so the guest played whatever the
host picked in the sandbox dropdown. FIX — *guest sends deck ids in READY; the host assembles*:
- **Protocol (`lib/multiplayer.ts`)**: `READY` now carries `deck?: string[]` (guest's card ids).
  `PROTOCOL_VERSION` bumped **1 → 2** (a v1 host ignores `deck` → the substitution bug survives
  in mixed builds, so mixed builds must refuse via the existing version gate). Guest's
  `join(code,name,avatar,deckIds)` stores `myDeck`; `_wireConn` sends it (host sends none).
  `SessionPeer.deck` added; the READY handler forwards it to `onOpponentJoined`. New method
  **`rejectOpponent(reason)`** (mirrors the version-mismatch refusal: `onError` + close the conn,
  keep the peer alive so the same code keeps hosting).
- **Store (`gameStore.ts`)**: new action **`assembleMpGame(p1Cards,p2Cards)`** — rebuilds via
  the existing `makeNewGame`, resetting local prompts like `startMultiplayer` but keeping
  `conn`/`localPlayer`. Safe pre-setup (host is on the Matching screen).
- **Hook (`lib/useMultiplayer.ts`)**: `hostDeckRef`/`isHostRef` added. `host(myCards,oppCards)`
  retains its own deck; the old one-shot `opponentStatus→sendStateSync` subscription was
  **removed** (the assemble's own broadcast is now the handoff — avoids a double-send).
  `join(code,myCards)` (signature changed — drops the opp-deck arg) sends `myCards.map(c=>c.id)`.
  `onOpponentJoined` **host branch** resolves the guest ids against CATALOG and either
  `assembleMpGame(hostDeck, guestCards)` then marks ready, **or REFUSES** (owner ruling
  2026-07-04) on no/empty deck, any unresolved id, **or duplicate ids** (unique-id engine
  invariant — id-keyed dead picks/equips/targeting; the wire is a second entry path).
- **Lobby/Play**: `join` prop is now `(code, myCards)`; `handleJoin` drops the opp arg. The
  "Opponent deck (sandbox)" dropdown now affects **only Sandbox solo** (no effect on a hosted match).
- **Tests**: `tier3_mp_wire.test.ts` — `hostGame()` now passes a valid deck (host assembles;
  broadcast count stays 2), item-3 `join` call updated, + NEW assembly test (distinct
  `CATALOG.slice(50,100)` guest deck → p2 drawn entirely from it, p1 stays host's) + NEW refusal
  test (no / unresolvable / duplicate deck → `rejectOpponent`, seat not ready, no handoff).
  `multiplayer.test.ts` — `PROTOCOL_VERSION` assertion 1→2 + a READY-carries-deck protocol test
  (set `myDeck`+`conn` via the internals cast, like the lifecycle test). **typecheck ZERO;
  validate:decks clean.**
- **Runtime smoke (single-window preview)**: app loads, Lobby renders, **Host** → Matching
  screen + real PeerJS code generated, no console/server errors.
- **LIVE TWO-WINDOW PLAYTEST — PASSED (2026-07-04, owner-run).** The guest joined and played
  their OWN deck (not the host's sandbox pick) — audit #11 confirmed end-to-end over real PeerJS.
  The batch's REQUIRED done-criterion is met; **audit #11 fully closed.**
- **CORRECTION to a long-standing handoff error (owner, 2026-07-04):** the owner has live-tested
  WHOLE GAMES two-window MANY TIMES. The recurring "state-sync has never had a live two-peer
  playtest" / "STILL NEEDS a live two-peer playtest" caveat threaded through older entries and the
  DONE §Multiplayer notes is FALSE — do NOT repeat it, and do not treat a first live playtest as
  outstanding work. Full-game two-window play is an established, working reality.
- **Open flags for owner**: (1) a refused guest currently sees only a generic disconnect — a
  dedicated `REJECT` message carrying the reason is a possible small follow-up; (2) no deck-SIZE
  gate on received decks (Lobby tolerates <50, warning-only — matched); (3) the "Opponent deck
  (sandbox)" dropdown could be de-emphasized/hidden when hosting.
- NOT started (next candidates): the audit's join-lifecycle items (M4/M5), reconnect (M1),
  Phase 2 replay recorder, quality refactors (audit §d).

## Session (2026-07-04, earlier) — six keywords merged; Paranoia corrected to canon; canon in docs/
**CANON NOW LIVES IN-REPO: `twilight-app/docs/Master_Keyword_List.md` + `Card_Design_Parameters.md`
(snapshots of the parent-dir canonical docs). CHECK THEM before writing/implementing any keyword —
Paranoia was twice described/implemented from invented paraphrases (owner correction; see
tasks/lessons.md 2026-07-04).**
- **Merged the cloud session's PR #1** (branch `claude/todo-implementation-3n3uwh`, merged on
  GitHub while this session worked locally): Bane (parseBanes → per-hit doubling), Poison
  APPLICATION (poisonHitPatch in combat; resolution already existed), Scavenger (Dead-Zone pick
  with attachTo → equipOnto), Animate Magic keyword parsing (parseAnimateMagic → animate op),
  Coercion (pendingCoercion → victim CoercionModal, PC excluded at arm/reducer/modal — matches the
  ruling ratified this session). Only Untamed remains unimplemented in the registry.
- **Paranoia CORRECTED + re-implemented per canon** — the PR had built it from an invented
  definition (on-enter trigger, the VICTIM resolving their OWN deck, invented "Paranoia X").
  Canon: "Whenever an opponent plays a Companion, look at the top card of that player's deck. You
  may put that card on the top or bottom of their deck." The CONTROLLER decides; the placing
  player makes no choice and never sees the card. `placeCard` (companion plays only) queues one
  controller-owned `PeekRequest` per opposing Paranoia permanent (effectiveKeywords → suppression
  honored) via `armParanoia` on every return path, BEHIND the placer's own on-enter scry;
  parseParanoia deleted (canonical keyword is bare). `reactiveHold` holds on an opponent-owned
  `pendingPeek` (the armer is the placer, the owner is the inactive controller). `resolvePeek`
  hardened: un-offered destinations coerce to 'top' (a stray 'hand' on an opponent-deck peek used
  to DELETE the card). Registry: `KwEvent 'oppPlay'`, canonical note; KEYWORD_DEFS entry = canon
  text. PeekModal title says "— opponent's deck" when deckSide ≠ lp. The PR's invented Paranoia
  tests were replaced with correction-pinning tests (tier1_zones) + NEW `keyword_paranoia.test.ts`
  (10, full canonical coverage). Suite **12 files / 164 tests green, tsc ZERO, validate:decks clean.**
- **Ratified rulings recorded**: (1) Incantation constructs = Magical Constructs (engine keys
  `subtype==='Incantation'`); Animate Magic leave-sacrifice replacement confirmed ('manifest'
  status → sacrificed on bounce). (2) Poison failed roll = 1 dmg/counter to the poisoned
  character's controller — implemented + tested (tier1_zones item 4). (3) **Coercion PC-exclusion
  is THE RULE** — Rules Note added to Master_Keyword_List.md (parent + docs/), KEYWORD_DEFS
  updated, and the merged implementation already enforces it.
- **All three open questions RATIFIED same day (batch 2, commit `0fea53d`):**
  1. Trigger order: placer's own on-enter scry FIRST, Paranoia peek after — pinned by test.
  2. "Plays a Companion" = from hand only: placePc and Animate Magic conversions do NOT
     trigger Paranoia — pinned by tests through the real reducers.
  3. **ONE "current Willpower"** (Class-Zone count −1 while Dismayed, floor 0) read by EVERY
     check — new accessor **`currentWillpower(player)`** in store/keywords.ts replaces
     `playWillpower` (renamed) + dead `effectiveWillpower` (deleted) + readyPlayer's inline
     effWP copy. Fixed raw readers: the Poison roll (PoisonModal — its un-canonical floor-at-1
     also removed; at current WP 0 a d6 can never cleanse, ruled consequence) and the
     `willpowerAtLeast` card condition. **Dismay pressure CAN cause fleeing — intended and
     tested** (willpower_current.test.ts; Poison's Dismayed flip in
     willpower_poison_modal.test.tsx, jsdom). Rules Note dated 2026-07-04 added to
     Game_Rules_Updated.md §Willpower (parent + docs/). Tray/Mulligan still display the BASE
     stat (display, not a check) — flag if the owner wants the adjusted value shown.
  Suite at commit `0fea53d`: 14 files / 175 tests green in an isolated worktree of the
  committed tree; tsc ZERO.
- **CONCURRENT SESSION (2026-07-04, in-flight)**: audit batch 4 (guest deck in READY,
  PROTOCOL_VERSION 2) is being built by ANOTHER session in the same working tree
  (multiplayer.ts / useMultiplayer.ts / Lobby.tsx / a gameStore host-rebuild action + their
  tests). This session's commits exclude those hunks (gameStore was staged from a
  my-hunks-only blob). If you see multiplayer/tier3 test failures in the WORKING tree, they
  belong to that in-flight work — check `git log` / `git status` before assuming a regression.

## Previous session (2026-07-03) — owner rulings applied + test suite seeded (Phase 0)
Two resolved owner rulings from `tasks/test_seed_plan.md` applied, then Phase 0 executed.
- **Ruling 1 (fled/decayed → Dead Zone, CONFIRMED):** wording added to the parent
  `Game_Rules_Updated.md` AND `twilight-app/docs/Game_Rules_Updated.md` (Constructs §, Dead Zone §
  incl. recursion-recoverability, Ready Phase step). Engine already correct since Batch 2.
  RESOLVED same day: owner confirmed the flee rule did NOT change (the plan's "WP < companion
  count" parenthetical was an error — corrected in place in test_seed_plan.md so it can't be
  re-imported) and confirmed decay is UNIVERSAL (all Constructs, Physical and Magical, carry
  Anchor counters and decay identically — an explicit line now states this in both rules docs).
- **Ruling 2 (Stone Rampart → anchors):** re-authored in `wizard_builder_50.json` — interim heal
  REMOVED, now "onEnter: anchor +1 ownPhysicalConstructs", text updated. The `anchor` group op
  (gameStore) now EXCLUDES the source (`x.id !== sourceId`) — self-exclusion is the default per the
  ruling; Grudrik (companion source) regression-verified unaffected.
- **Vitest 4.1.9 installed** (dedupes against vite 8). NEW `src/__tests__/`: `helpers.ts`
  (mkComp/mkPc/mkConstruct/mkItem/freshGame), `gameplay.test.ts` (batch-2's 23 assertions),
  `multiplayer.test.ts` (batch-3's 19 — peerjs `vi.mock`'d; private `conn`/`_wireConn` reached via
  a typed `internals()` cast), `rulings.test.ts` (Stone Rampart + self-exclusion + Grudrik).
  Tests import the store DIRECTLY — no `__gs` window hook, no ssrLoadModule. `vitest.config.ts`
  (node env, standalone — keeps React/Tailwind plugins out). `npm test` + `npm run typecheck`
  scripts added. **19 tests green, typecheck ZERO errors.**
- **CI:** `.github/workflows/ci.yml` (push/PR → npm ci → typecheck → vitest run). Untested until
  the owner's next push — check the Actions tab then.
- The old scratchpads were recovered from the PREVIOUS session's temp scratchpad directory (temp
  dirs get wiped eventually — this nearly lost the suite).
- **Tier 1 DONE (same day, follow-on):** all 12 owner-caught regressions codified — NEW
  `tier1_economy.test.ts` (WP survives Special Actions via real placeCard; WP≥Level gates;
  Patient Study charges Minor through real playAction; ability consumes Major, constructs
  exempt; activation lock; skip-draw handicap + no Turn-1 Major), `tier1_zones.test.ts`
  (Reckless recoil buries + fires Memory Stone; Dismantle/moveAnchor sacrifices; sworn→hand;
  heavy dedupe; Mara payHP→setPcHp mirror; canHoldItem/Kit-Master caps; weapon swap;
  dead-pick skips departed cards; all lifecycle prompt resets + cancel-leak), and
  `tier1_combat.test.ts` (armor: single auto/2+ pause/resolveArmor resume/Cleave chain/
  non-combat armorSink defer/Reckless bypasses armor; Binding Sigil suppresses printed+
  granted keywords, positional). **Suite: 6 files / 62 tests; tsc ZERO errors.**
  helpers.ts gained `mkCz`.
- **Poison sliver CLOSED by extraction (same day):** PoisonModal.commit was hand-duplicating
  the PC-HP write (manual board+headline+gameOver) — the exact bug shape item 4 guards. NEW
  store action **`resolvePoison(player, outcomes)`**: cleansed → counters cleared + readied;
  failed → counter-count damage to the PC **via setPcHp**; un-rolled omitted; clears
  pendingPoison. Modal now calls it (rolls/display stay component-side). +3 store tests, AND
  preview-verified through the real modal (temp __gs hook removed after): roll 1 cleansed /
  roll 5 held → PC entity 17 == headline 17, pendingPoison null. Tier 1 = 12/12 closed.
- **Tier 2 DONE (same day):** all six locked rulings codified. NEW `tier2_rulings.test.ts`
  (no-HP-buffs data contract + all-100-cards effectiveMaxHp behavior loop — NOTE the
  documented floor-at-1 for 0-HP constructs; Conflagration self vs Wrath damageSelfPC,
  shared-die relationship asserted; Translocation Circle own-only/oncePerTurn/ready-clears;
  no Initiative/Exile anywhere; entry restriction incl. Zealous-attacks-only) and
  `tier2_classbonus.test.tsx` — the FIRST COMPONENT TEST: jsdom + @testing-library/react
  installed (devDeps), vitest include now `.test.{ts,tsx}`, jsdom opt-in per file via a
  `@vitest-environment jsdom` docblock (store tests stay node). It proves the ClassBonus
  offer set locks at mount: applying Gear Up! swaps a Sorcerer card into the live CZ
  (store-verified) and Elemental Fury still never appears. **Suite: 8 files / 73 tests.**
- **Tier 3 DONE (same day) — and it caught a REAL MP DEADLOCK.** NEW `tier3_mp_wire.test.ts`
  (jsdom renderHook over the real useMultiplayer subscription; MultiplayerSession faked as
  a recorder): wire-level reactiveHold incl. selectEntity clicks, guest pre-sync silence +
  wholesale apply preserving local `selected` + no echo, STATE_SYNC shape check. Items
  2/4/6 were already in multiplayer.test.ts.
  **BUG FIXED (useMultiplayer.ts): the wire hold also suppressed the snapshot that ARMS an
  opponent-owned prompt** — the armer is always the non-owner, so the owner never learned
  their armor/dead-pick existed; armer stuck behind ReactiveHoldBanner forever; self-heal
  can't rescue it (skipped sends never bump sentSeq). FIX: `armedHoldRef` sends the arming
  snapshot exactly ONCE per hold source, suppresses the rest of the hold window, re-derives
  from applied remote snapshots, resets on host/join/disconnect. This was invisible to
  batch-3's session-level tests and would have hit the first live two-peer armor/Memory-
  Stone moment. **Suite: 9 files / 77 tests; tsc ZERO errors.**
- **Tier 4 DONE (same day) — the whole test_seed_plan Tier 0–4 is now closed.** NEW
  `src/data/validateCards.ts`: the REUSABLE deck validator (the future generation-pipeline
  MINT-GATE). Runtime mirrors of every schema union, honest both ways at compile time
  (`satisfies` + exported `AssertNever<Exclude<…>>` aliases — effects.ts cannot grow a
  member the validator ignores). **CATALOG validates CLEAN (all 100 cards).**
  `tier4_validator.test.ts` proves 11 mistake classes are caught (bad op/trigger/target/
  amount/cost/condition/keyword, costless activated, dup id/name, per-type fields).
  `tier4_ops.test.ts` (30) = happy+edge per op through the real store paths, mocked d6 for
  die ops. GOTCHAS reconfirmed: zone moves are CATALOG-name-keyed (synthetic entities that
  change zones need real names); a caster's Minor is spent per cast (resetActions between
  synthetic plays). ENGINE NOTES: `perControlled` ignores its spec value (always counts
  companions); discard/mill/sacrifice/sacrificeItem/search/modal/gainControl are
  schema-valid interpreter NO-OPS. **Suite: 11 files / 119 tests; tsc ZERO errors.**
- **Validator follow-ups DONE (owner-directed, same day):** `npm run validate:decks`
  (scripts/validate-decks.mjs, ssrLoadModule harness) + CI step — negative path verified
  (injected +HP buff + Initiative text → both caught, exit 1; decks restored). Validator is
  now a PURE mint-gate `validateCards(candidates, existingNames, keywords)` — KEYWORDS
  moved to dependency-free `src/data/keywordRegistry.ts` (store/keywords re-exports), no
  transitive catalog import; minted-name collisions rejected, duplicate mechanics allowed;
  keyword contract injectable. HARD BANS in the gate: +HP effects and Initiative references.
  Suite: 11 files / 123 tests. Both open questions RULED same day: (1) **Exile joined
  Initiative in the gate** — both bans deliberately BROAD (name + flavor + keywords + text
  + effects; rules-text-only scoping is the documented future loosening; shipped 100 stay
  clean). (2) **perControlled 'constructs' REMOVED from schema + validator** (no card
  authored perControlled at all → removal path; re-add with engine support when needed;
  'companions' stays, engine-implemented + tested).
- NOT started (next session candidates): audit batch 4 guest-deck-in-READY (H3), Phase 2
  replay recorder (the seed plan's last item), quality refactors (§d), live two-peer playtest.

## Previous session (2026-07-02, latest) — keyboard a11y on click flows
Last §UI M item done. NEW `lib/a11y.ts` `btnProps(onClick, disabled?)` — spread onto clickable divs
for role/tabIndex/aria-disabled + Enter/Space activation (stopPropagation so the game-level Enter/
Tab handler never doubles up). Applied to ActBtn, CommandZone slots (tab order only while clickable,
aria-labels), HandFan cards (focus drives the preview pane), CZExchangePanel, Tray dead-pile, Lobby
name spans. Global handler fixes: while ANY modal is up, Tab yields to focus traversal and Enter no
longer advances the phase underneath (latent bug); Escape stays live (skips prompts). Global
`:focus-visible` amber ring in index.css. Verified: full keyboard loop (place PC → pass CZ →
Tab-cycle → arm Move → move), modal gates, disabled controls out of tab order. FLAG for owner: Tab
in plain board view still cycles units (documented UX) — full board traversal would need rebinding.
HARNESS GOTCHA: preview window has no OS focus — element.focus() fires no focus events; dispatch
`focusin` to test onFocus. Convention: use `btnProps` for any new clickable div.

## Previous session (2026-07-02) — selector-based store subscriptions
Hover no longer re-renders the board (audit §UI M item). Every hot-path Play component now uses
individual `useGameStore(s => s.x)` selectors instead of a bare `useGameStore()` whole-store
subscription; **GameView + useMultiplayer subscribe to nothing** (keyboard handler + MP hook read
via `useGameStore.getState()` — the keydown listener also now registers ONCE). Converted:
CommandZone, Playmat, HandFan, LoadoutPanel(+ItemSlot), Tray(CzSlot/StatsContent/CZContent),
PhaseRail, PileViewer, CZExchangePanel, ModalHost, useMultiplayer, GameView. Cold-path setup modals
left bare deliberately. CONVENTION: in Play-screen components, never call `useGameStore()` bare —
select fields/actions individually (actions are referentially stable). Verified: 20 hover changes →
0 CommandZone/Playmat re-renders (temp counters, removed); full real-UI setup→move flow + Tab/Esc/
Enter still work. GOTCHA: synthetic KeyboardEvents must be dispatched from document.body (window
target has no tagName → dies in the input guard). Remaining §UI M item: keyboard a11y.

## Previous session (2026-07-02, later still) — CardPickModal extraction
The six copy-pasted inline modals in Play.tsx (Kit-item / Peek / DeadPick / AttackChoice / Armor /
EquipPick) now share ModalShell chrome. NEW `modals/CardPickModal.tsx` (ModalShell + clickable
CardFace row; picks {key,name,card?,caption?}, onPick, optional cancel footer) hosts the four pure
pickers; Peek + AttackChoice sit on ModalShell directly with custom bodies. ModalShell: `footer` now
OPTIONAL (forced picks render no foot bar), `width` override added, and the scrim's
`backdropFilter: blur` was REMOVED (documented preview-tooling hang + GPU cost; gradient darkened to
compensate). Pickers render at Z.modal (300); Z.setup (360) is now only the SetupWaiting overlay.
Play.tsx 468→366 lines. All six DOM-verified in preview incl. Peek's maxHand Confirm gate and
Mulligan regression. Remaining §UI M items: selector-based store subscriptions, keyboard a11y.

## Previous session (2026-07-02, later) — aesthetic quick-win batch
Owner-directed visual polish (six §UI audit slices, all preview-verified; tsc + build green;
`tasks/todo.md` Review has full detail): Action cards render a Minor/Major/Special cost chip on the
type line (actionTypeOf-driven); ready-phase flee/decay emit toasts (perspective-prefixed, store-local
like the draw toast); `czSwapById` keeps `cardData`/`faceDown` (swapped CZ slot keeps hover preview +
caption); NEW `Z` layering table in `tokens.ts` for all fixed Play-screen layers (PileViewer 380 now
explicitly BELOW GameOverScreen 400; use `Z.*`, never a magic z-index); `index.css :root` pruned to
the 2 consumed vars (palette source of truth = TBL) and legacy `App.css` deleted; Lobby pointer-cursor
honesty + `handleJoin` in-flight guard; MulliganModal CZ resolution prefers `cz.cardData` and drops
misses (no more `?? CATALOG[0]`), gameStore `shuffle` EXPORTED and reused (mulligan redeal + Bard —
never reintroduce `sort(() => Math.random()-0.5)`). TOOLING: `.claude/launch.json` `autoPort: true` +
`start-dev.js` honors the launcher's `PORT` env, so a second CC session can preview on its own port
while another chat holds 5173. NOT DONE (M, ask owner first): shared `CardPickModal` extraction,
selector-based store subscriptions, keyboard a11y on div-onClick controls.

## Previous session (2026-07-02) — Fable audit + fix batches 1-3
A 4-agent codebase audit produced **`tasks/audit_2026-07-02.md`** (~50 findings, file:line refs,
severities, ranked batch plan) — read it before proposing engine/MP work. Three fix batches landed:
- **Batch 1 (build-green)**: all 10 "pre-existing" TS errors fixed — they were failing `tsc -b`, so
  `npm run build` NEVER worked. Typecheck is now a ZERO-error gate; treat any error as yours.
- **Batch 2 (gameplay correctness, 23/23 runtime-verified)**: `destroyEntity`/`deadCardsOf` — every
  destruction path now moves cards to the Dead Zone (previously ALL destruction lost cards from the
  game); `setPcHp` — single PC-HP write (entity→headline mirror + win check); **`game.gameOver` now
  stores the winning SIDE 'p1'|'p2'** (render via seatName); equip slot-capacity gate (no more silent
  item destruction); dead-pick queue resolves by card id; Zealous/Acrobatics via effectiveKeywords;
  `actionPM` wired (4 Minor Actions were overcharged as Major); OathswornModal localPlayer + sworn-card
  capture fix + sacrifice→dead; PoisonModal PC-entity write + pure updaters; Tab-cycle localPlayer;
  `LOCAL_PROMPTS_CLEARED` reset constant.
- **Batch 3 (MP races, 19/19 protocol-verified)**: reactiveHold enforced at the BROADCAST layer
  (`startStateSync` skips sends while held; reactiveHold exported + covers pendingAttackChoice);
  owner-gated cancelPeek/cancelDeadPick; guest silent until the host's first snapshot; PROTOCOL_VERSION
  handshake (mismatch → refuse); STATE_SYNC shape check; lost-sync self-heal via sentSeq/recvSeq on
  PING/PONG (fixes the endTurn-deadlock); latency via origTs.
- **NEW VERIFICATION HARNESS** (when preview tools are blocked/insufficient): drive the REAL store or
  MultiplayerSession under Node via Vite — scratchpad .mjs, `createServer({server:{middlewareMode:true},
  appType:'custom'})`, `ssrLoadModule('/src/store/gameStore.ts')`; alias `peerjs` to a stub via
  `resolve.alias` for protocol tests (two sessions over fake DataConnections). Import vite by absolute
  file URL (`node_modules/vite/dist/node/index.js`) since the script lives outside the app.
- Remaining audit work: **batch 4 = guest deck in READY (H3)**, then join-lifecycle (M4/M5),
  reconnect (M1), Vitest data-contract test, quality refactors (§d of the audit).

## Previous session (2026-06-23) — deferred player-choice pickers
Three previously-deferred pickers were built + preview-verified (store + real UI), typecheck clean:
- **Kit-Master multi-item picker** — when a source character holds 2+ items the player chooses which to
  move (`allItemsOf`, `PendingKit.step:'item'`, `pickKitItem`, `KitItemModal`); 1 item still skips the
  modal. `pendingKit` stays store-local (active-player-only) → no MP change.
- **Kit-Master slot-capacity enforcement** — transfers now respect 1 weapon + 2 gear (heavy = both gear
  slots): `canHoldItem`/`gearFreeSlots`/`GEAR_CAP` + `kitDests` gate the arm list, the placeable-item
  filter, and the dest list; placement fills the correct slot and normalizes gear to length 2 (was
  appending past the cap). `allItemsOf` dedups heavy items.
- **Armor per-hit picker (resumable combat)** — the rule "controlling player chooses which armor prevents
  the damage" now prompts the DEFENDER per hit when a struck character has 2+ armor pieces. The post-tap
  damage section of `resolveAttack` was refactored into a serializable state machine (`AttackCtx`,
  `driveAttack`/`applyCombatHit`/`finalizeAttack`) that PAUSES on a 2+armor hit and resumes via
  `resolveArmor`. New synced `GameState.pendingArmor` routes the choice to the defender; `reactiveHold`
  holds the attacker meanwhile; `ArmorModal` is the forced picker. `applyDamage` gained an optional forced
  `armorPieceId` + a most-worn-first default. **Now covers ALL damage** (2026-06-23 follow-up): non-attack
  damage (Action cards, combat triggers, start-of-turn constructs, on-enter, abilities) DEFERS the choice
  via an `armorSink` (threaded alongside `deadSink` through `resolveActionEffects`/`applyDamage`) and arms
  it after the effect resolves (`armPrompts`/`armNextArmorChoice`; `PendingArmor.queue` chains multiple,
  candidates re-derived per choice). Combat primary/Cleave still pauses immediately (necessary — a piece
  sacrificed mid-combat changes later hits). FLAGS: Reckless self-damage still bypasses armor;
  companion-variant Armor (printed on a card, not an item) unimplemented; a single non-combat effect that
  hit the SAME character twice would defer with re-derived candidates (no current card does this).
- **Deferred pickers still open**: Scavenger (unwired — no card carries it), Lens any-deck, Untamed keyword.
  See `tasks/todo.md` Review sections (newest at the bottom) for full per-slice detail.
- **First-player handicap FLIPPED** (owner ruling, supersedes 2026-06-22): the first player now **skips their
  Turn-1 draw**, and the **"no Major Actions on Turn 1" restriction is REMOVED**. One handicap only
  (skip-draw), matching the original `.docx`. Removed the `placePc` first-player draw + all `turn1Block`
  guards (beginAttack / canPlayActionCard / activateAbility / LoadoutPanel); Zealous's now-moot Turn-1
  attack bypass deleted (it still bypasses the entry-turn "fresh" restriction). Rules doc + snapshot
  updated; `rules_reconciliation.md` has the resolution log.
- **UI copy fixes**: removed the user-facing "summoning sickness" label (kept the no-attack-on-entry logic;
  reworded the hover/toast reasons to "Cannot attack on its entry turn" / "No Major Actions on its entry
  turn"); MP waiting overlays now say "the opponent" instead of the synced (perspective-broken) player name.
- **Client-relative player names (DONE)**: player names are stored as perspective placeholders
  (p1="You"/p2="Opponent") and the whole `game` is broadcast wholesale, so the GUEST used to see names
  backwards. New exported `seatName(side, localPlayer)` (gameStore) → "You" for your own seat, "Opponent"
  for the other; used in every UI name display (Tray stats/dead-zone, PhaseRail turn pill, GameOverScreen
  title+labels, PileViewer header, Mulligan/ClassBonus/PCPlacement setup titles, endTurn draw toast). The
  `gameOver` win-flag stays name-based internally (seat names are unique → winnerSide/localWon still
  correct). Verified both host (p1) and guest (p2) perspectives render correctly. The ⇄ sandbox button now
  reads "Other side".
- **Bug fixes from live 2-player testing (DONE)**:
  - **Class bonuses lock at phase start** — `ClassBonusModal` derived the offered bonus set LIVE from
    `ps.classZone`, so a CZ-swapping bonus changed which bonuses were available mid-application. Now
    snapshotted on mount: `const [czClasses] = useState(() => [...new Set(game[player].classZone…)])`. Live
    CZ still used for swap-target lookups.
  - **Wizard "Knowledge is Power" / Doom-Whisperer "Seeds of Despair" — order the kept cards.** The view-deck
    picker only did top/bottom; the rule says "the rest on top in any order." New `reorderTopCards` helper +
    `topOrder` state + `TOP n` rank badges + ◀▶ arrows; `apply` gained `topOrderIds`.
  - **Card type line forced to one line** (CardFace) — long companion subtypes wrapped to 2 lines and
    cramped the `flex:1` rules textbox; now `nowrap` + ellipsis + smaller font so the textbox keeps height.
  - **Preview pane shows tapped cards upright** — new `CardFace` `upright` prop (board cards still rotate).

## Repo / sharing (2026-06-07)
- The app is on GitHub: **https://github.com/logisticrib/twilight-effect** (PRIVATE), scoped to
  `twilight-app/` only (`main` branch). Push updates with `git add -A && git commit -m "…" && git push`
  from `twilight-app/`. Owner mirrors it into their claude.ai Project knowledge.
- Snapshots that DRIFT and must be refreshed before a push if the owner wants the Project current:
  `twilight-app/docs/HANDOFF.md` + `docs/Game_Rules_Updated.md` + `docs/Card_Design_Parameters.md`
  (copies of the canonical `tasks/HANDOFF.md` and the parent design docs), and
  `twilight-app/CODE_BUNDLE.md` (a flattened single-file dump of `src/`, generated via a throwaway
  Node script, used for direct Project-knowledge upload since the GitHub connector was erroring).
  CODE_BUNDLE.md is git-untracked. When code changes, offer to regenerate these before the owner pushes.

## Project / run
- App: `twilight-app/` (React 19 + Vite + Zustand + TS + Tailwind 4 + PeerJS).
- Start server (npm not on PATH): from `twilight-app/`, run
  `"C:\Program Files\nodejs\node.exe" node_modules/vite/bin/vite.js --host` — or use the
  Claude Preview tool: `preview_start` with config name `twilight-app` (port 5173).
- Typecheck: `"C:\Program Files\nodejs\node.exe" node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`
  - ZERO errors expected (2026-07-02: the old "pre-existing errors to ignore" list was fixed —
    they were breaking `npm run build`, which runs `tsc -b`). Treat ANY error as yours.
- Audit: `tasks/audit_2026-07-02.md` — 4-agent codebase audit (~50 findings with file:line refs,
  severities, and a batch plan). Batch 1 (build-green) done; gameplay-correctness + MP-race batches open.
- Design docs one level up: `Game_Rules_Updated.md`, `Card_Design_Parameters.md` (the
  machine-readable spec — authoritative), `Card_Generation_Master_Prompt.md`,
  `Master_Keyword_List.md`, `Class Design Guide.docx`.

## Architecture: structured effects on cards (NO parser)
DECIDED with the owner: card behaviour is **structured effect descriptors authored as a
field ON the card** (`Card.effects?: CardEffect[]`), resolved by a **card-agnostic
interpreter**. Reason: decks churn rapidly, so a name-keyed side-catalog would drift and a
text parser would be brittle/non-deterministic. **Strip `Initiative` and `Exile` from cards**
(Initiative undefined in rules; Exile forbidden by Card_Design_Parameters §7).

### Key files
- `src/types/effects.ts` — the schema: `Trigger`, `TargetSpec`, `Condition`, `Amount`,
  `Cost`, `Modifier`, the `Effect` union (~30 ops), `CardEffect` (trigger + effects +
  optional/oncePerTurn/if/cost/uncounterable/where).
- `src/types/card.ts` — `Card.effects?`, `BoardEntity.buffs?: ActiveBuff[]`.
- `src/engine/` — the headless engine (2026-07-10 extraction; module map in the latest-session
  note above): `stats.ts` (the former store/keywords.ts: `effectiveAttack(ent,game)`,
  `effectiveMaxHp`, `effectiveKeywords` — printed + buff grants + item keyword grants MINUS
  opposing suppression auras — `hasModifier`, `isPhysicalConstruct`, `parseEnterTrigger`,
  `firstItemOf`, aura/item-bonus internals), `interpreter.ts` (`resolveActionEffects` — the big
  op switch — `eligibleTargets`, `actionTargetSpec`/`effectTargetSpec`, `twoStepKind`,
  `permanentEffects`, `gatherActivated`, `amountValue`), `combat.ts` (`applyDamage`:
  Armor→hpFloor1→PC-defeat, used by combat AND actions; `driveAttack`; trigger machinery),
  `entities.ts` (`destroyEntity`, `charsOf`, `companionIds`, `constructIds`, `pcIdOf`),
  `lifecycle.ts` (`resolveStartOfTurn`, `makeNewGame`, `rollD6`), `state.ts` (GameState + all
  synced prompt types), `geometry.ts`, `rng.ts`. `store/keywords.ts` + `store/rng.ts` are
  re-export shims; gameStore re-exports the whole engine barrel.
- `src/store/gameStore.ts` — the store SHELL: the Zustand create chain and all reducers
  (gates → engine calls → prompt arming → broadcast), store-local prompt state,
  isSealed/activationPatch, reactiveHold, commitAttack/finalizeAttack, readyPlayer (in endTurn).

### Resolution flows (all reuse one targeting layer)
- **`playAction`** (Action cards): counter-check → two-step? → deck-peek? → needs a single
  target? (arm `pendingActionTarget`) → else resolve immediately → card to Dead Zone.
- **`placeCard`** on-enter: keyword triggers (Reinforce/Dismantle/Kit-Master/Oathsworn) →
  else structured `onEnter` effects (deck-peek / target / immediate).
- **`activateAbility(entityId,idx)`**: pay cost (sacrificeSelf item/entity, exhaustSelf,
  payHP, removeAnchor) + oncePerTurn (status `ability-used:<name>`, cleared on ready) →
  resolve (target or immediate). Surfaced as buttons in LoadoutPanel.
- **start-of-turn**: `resolveStartOfTurn` fires in `endTurn` for the player whose turn begins
  (auto-picks first enemy for single-target — interim, not a prompt).
- **Pending UI states** (all in gameStore, reset in switchSides/init): `pendingActionTarget`
  (source action|enter|ability; + twoStep reposition|disarm, firstId, eligibleSlots),
  `pendingPeek`, `pendingTrigger`, `pendingKit`. CommandZone highlights eligible
  entities/slots; Play.tsx renders `ActionPrompt`/`TriggerPrompt`/`KitPrompt`/`PeekModal`.

## Authoring workflow
Author effects by editing the deck JSONs (`src/data/sorcerer_warrior_50.json`,
`wizard_builder_50.json`). Use a Node script to patch by card name (parse text → structured
at authoring time; the engine stays structured). Example:
```
node -e "const fs=require('fs');const p='src/data/wizard_builder_50.json';
const w=JSON.parse(fs.readFileSync(p,'utf8'));const E={'Card Name':[{trigger:'onPlay',effects:[...]}]};
w.cards.forEach(c=>{if(E[c.name])c.effects=E[c.name];});fs.writeFileSync(p,JSON.stringify(w,null,2)+'\n');"
```
(sorcerer_warrior is a raw array; wizard_builder is `{cards:[...]}`.) Both files are 2-space indent.

## Verification workflow (IMPORTANT — every slice was verified this way)
**Since 2026-07-03 there is a Vitest suite (`src/__tests__/`, `npm test`): store/protocol behavior
should be verified with a COMMITTED test (import the store directly — no `__gs` hook needed), not a
throwaway script. The preview workflow below remains for UI/DOM verification.**
1. Add a temp hook at the very end of gameStore.ts (after the store `create`):
   `if (import.meta.env.DEV) (window as unknown as Record<string,unknown>).__gs = useGameStore;`
   (expose extra helpers as `__ea`/`__ek`/`__emh` as needed).
2. `preview_start` (reuse server), then `preview_eval` with an IIFE that grabs `window.__gs`,
   sets up a board via `gs.setState`, calls reducers, reads results. Build synthetic
   BoardEntity/Card objects inline. For cards resolved via CATALOG-name lookup (bounce, item
   bonuses), use REAL catalog names.
3. **Always remove the temp hook before finishing** and re-typecheck.
- Gotchas: `preview_eval` with rAF/Promise can hang — query synchronously after a prior call
  instead. Screenshot tool is flaky (query the DOM via fiber/eval instead). Math.random in
  the sandbox is noisy for distribution checks — verify CORRECTNESS (exactly-one-branch,
  value range), not the distribution.

## DONE (all verified in preview)
- **Multiplayer**: switched from lossy action-replay to authoritative **state-sync**
  (`useMultiplayer.ts` subscribes to `s.game`, broadcasts on local change; receiver applies,
  preserving local `game.selected`). **Game-over screen** (`GameOverScreen.tsx`).
  ⚠️ STILL NEEDS A LIVE TWO-PEER PLAYTEST (armored hit, cleave, reckless, placement, PC kill).
- **MP prompt routing (2026-06-22)** — only `game` syncs, so cross-client prompts that armed on the
  wrong peer are now part of `game`: `pendingPeek`/`pendingPeekQueue`/`pendingDeadPick`/
  `pendingDeadPickQueue` moved from store-local into `GameState`; modals render gated by
  `isSolo || prompt.lp === localPlayer` (sandbox bypasses). Fixes start-of-turn deck-peeks (High
  Reader/Lens), Library of Memory, and Memory Stone arming on the wrong client. **Poison** routed via
  new `GameState.pendingPoison` (set for the *starting* player in `endTurn`, no longer `modalQueue`);
  `PoisonModal` parameterized by `player` (was hardcoded `game.p1`) + new `PoisonHost` gate.
  Active-player-only prompts (action-target/trigger/kit/equip) stay store-local. Verified single-client;
  see todo.md Review + KNOWN REMAINING MP ITEMS (reactive-pick race, dead ACTION path, the live
  two-peer playtest itself).
- **MP setup serialization (2026-06-22)** — parallel setup clobbered under wholesale sync and dropped
  cross-half class bonuses; `startMultiplayer` also seeded setup modals hardcoded `:p1` (guest ran the
  wrong half). FIX: serialized setup via synced `GameState.setupQueue` (one player acts at a time →
  wholesale sync correct). `makeNewGame` seeds the 6-step sequence; `advanceSetup` shifts it; `placePc`
  gates+advances; `ModalHost` drives setup gated `isSolo || player===localPlayer` with a `SetupWaiting`
  overlay for the other peer; `PCPlacementModal` now single-player; `CommandZone`/`CZExchangePanel`
  re-keyed off `setupQueue`. Verified the full sandbox setup→CZ flow through the real UI. todo.md Review
  has detail; live two-peer handoff still wants the playtest.
- **Reactive Memory-Stone race hold (2026-06-22)** — the defender's onDestroy pick (armed by the
  attacker's kill, owned by the defender) could be clobbered by the attacker's continued wholesale
  broadcasts. FIX: `reactiveHold(game,localPlayer)` (opponent-owned `pendingDeadPick`) no-ops the 8
  action-phase mutators (move/attack/equip/ability/play/place/markAction/endTurn) until the owner
  resolves (`resolveDeadPick`/`cancelDeadPick` unguarded — the escape hatch). `ReactiveHoldBanner`
  (MP-only) tells the held player to wait. Verified in preview; sandbox safe (modal already blocks).
  Last flagged MP item closed.
- **Dead action-replay path removed (2026-06-22)** — multiplayer is authoritative state-sync, so the old
  per-action replay protocol was deleted: `GameAction` union, `{type:'ACTION'}` message, `sendAction`,
  and `receiveAction` (≈60-line dead reducer) are gone; the 7 no-op `_broadcast?.({kind:…})` emissions
  removed. `_broadcast` KEPT purely as the "in multiplayer?" flag (no-op set by useMultiplayer, checked
  in backToLobby); real sync stays the store→`sendStateSync` subscription. Typecheck clean; app renders.
  **All flagged MP items closed — only the live two-peer playtest remains.**
- **MP connection lifecycle bug FIXED (2026-06-22)** — first two-window playtest: both peers stuck on the
  Matching screen; console showed the PeerJS WebSocket "closed before connection established" with
  `destroy()` firing from `useMultiplayer` cleanup on unmount. CAUSE: `useMultiplayer()` was called in
  **Lobby**/**Matching** (per-instance `useRef` session); Host/Join flips `playPhase`→`game`, Lobby
  unmounts, its cleanup `destroy()`s the peer before it connects. FIX: hoisted `useMultiplayer()` into
  `Play()` (stays mounted across lobby→matching→game); `host`/`join` passed to Lobby, `disconnect` to
  Matching, as props. Verified render/typecheck; **owner still needs to retry the live connect** — if it
  still fails, suspect the public `0.peerjs.com` server (→ run a local PeerServer).
- **Playtest bugfixes (2026-06-22)** — live two-window play found: (1) **companions showed no atk/hp off
  the board** — `CardFace` read `maxHp` (BoardEntity-only) for hand/library `Card`s → stat block hidden;
  FIX falls back to printed `hp`. (2) **opponent's draw was revealed** — the draw toast in `endTurn`
  (runs on the ender, draws for the next player) named the card; FIX redacts to "<name> draws a card"
  unless solo or the local player is the drawer. (3) **Special Action lowers Willpower** — REAL bug per
  owner correction (I initially mis-called it intended). FIXED: `computeWillpower` now = `classZone.length`
  (TOTAL cards; was face-up only), so a spent/faded card still counts → Special Actions don't reduce the
  WP stat. `playWillpower` reads that − Dismayed; special-action availability still gated on a face-up
  card to flip (independent of WP). Rules doc corrected (parent + snapshot): WP = "number of cards in your
  Class Zone", "temporarily reduces Willpower" removed, fleeing reworded. Verified WP stays 3 after 1–2
  special actions. **Supersedes earlier "WP = face-up count" notes.** (All 3 fixes preview-verified;
  typecheck clean.)
- **All keywords**: Cleave, Reckless, Armor, Guardian, Zealous, Ranged, Hit & Run, Reinforce,
  Dismantle, Kit-Master, Dismay/Dismayed, Acrobatics. (Earlier keyword-engine slices.)
- **All 20 Action cards** (damage/AoE/die/draw/buffs/move/bounce/extra-attack/force-attack/
  anchor/deck-peek/two-step attack-disarm).
- **On-enter companions**: draw, damage-target, anchor, die-conditional (dieCheck), animate.
- **All equipment**: item `+atk`/`+HP` (16 weapons/armor), item keyword grants (Cleave/Ranged/
  Hit & Run via effectiveKeywords — text-string hacks removed).
- **Activated abilities** (Quill, Anchor Stone, Collapsing Tunnel, Glassweaver).
- **Deck-peek** modal (Patient Study, Tower Apprentice).
- **Aura system** complete: unconditional team auras, conditional/positional + class
  (`where:{line,cls}`), item-projected (Banner), `effectiveAttack`/`effectiveMaxHp`.
- **Keyword suppression** (Binding Sigil).
- **Animate / Manifest** (Sigil-Bound Scholar, Eiralyth; Manifest leave-sacrifice via 'manifest' status).
- **Start-of-turn triggers** (Lingering Spark, Storm-Mark, Echoing Glyph, Conflagration Mage).
- **Counter system** (Ward of Silence; `uncounterable` flag on Crackling Bolt).
- **Rider tail (this session, 2026-06-05)** — ALL DONE + preview-verified: attacker-side combat
  triggers (onAttack/onDealDamage/onKill) + removal triggers (onDestroy via applyDamage); Magic-Action
  & attack damage modifiers (`magicDamageBonus`/`attackBonus`); anchor-decay mods (`preventAnchorDecay`,
  group `ownPhysicalConstructs` anchor); Long-Quiet Wall `lineWard`; deferred start-of-turn deck-peeks
  (`PeekRequest` queue + re-slice); Dead-Zone picker + Library of Memory (`PendingDeadPick`,
  `exhaustSelf`, construct-ready bugfix); misc on-enter (Veteran `equipFromHand` picker via `equipOnto`;
  Field Engineer two-step `moveAnchor`). See todo.md Review sections for the per-slice detail.
- **Card-face UI polish (this session)** — `CardFace`: rules text scrolls on wheel when it overflows
  (`scrollText` prop + `.tcard-scroll` class; scrollbar HIDDEN); removed the on-card loadout strip AND
  keyword chips (textbox reclaims the space; loadout still shown in LoadoutPanel, keywords still lead
  the rules text + drive logic/search). Applied scrollText in Library (detail+grid), Decks pool, and the
  Play PreviewPane. **Play preview scroll-without-leaving-the-card**: `src/screens/play/previewScroll.ts`
  (`previewScrollRef` + `handlePreviewWheel`); `CardFace` gained `textboxRef` + `onWheel`; PreviewPane
  registers its textbox + retains the last hovered card; source cards (CommandZone/HandFan/Tray/
  LoadoutPanel) forward wheel → preview scrolls. Verified live.
- **Action economy (2026-06-07)** — ENFORCED + preview-verified. Character-centric: playing an
  Action card spends the selected character's action by `actionSub` (default Major); class +
  Two-Handed-vs-Magic + first-turn gates; activated abilities consume the Major (constructs exempt).
  Shared gate `canPlayActionCard` (keywords.ts) used by `playAction`, `activateAbility`, HandFan,
  LoadoutPanel. See OPEN QUESTIONS (resolved entry) + todo.md Review for detail.
- **Atomic activation lock (2026-06-07)** — ENFORCED + preview-verified. New `GameState.currentActor`
  + `finishedActors` (reset each turn). A character is sealed once a *different* character acts (only
  after it has itself acted — selecting/inspecting doesn't seal). Helpers `isSealed`/`activationPatch`
  gate all character action seams (move/attack/equip/ability/playAction/markAction; constructs exempt);
  `resetActions` lifts it. See todo.md Review.
- **Action-economy bugfix + visibility (2026-06-07)** — `PendingPlay.actorId` captures the activating
  character at arm time (fixes `beginPlay` clearing `game.selected`, which had silently broken play
  attribution + the class gate). UI: `LoadoutPanel` MOVE→MINOR→MAJOR pip strip + `● activating`/
  `activation finished` tag; `CommandZone` green glow + `▶ activating` badge on the current actor and
  dim + `done` badge on sealed characters. See todo.md Review (follow-up 2).
- **Zealous on turn 1 (2026-06-07, RULING)** — ⚠️ SUPERSEDED 2026-06-23: the first-player "no Major
  Actions on Turn 1" restriction was REMOVED entirely (owner flipped the handicap to skip-first-draw — see
  the 2026-06-23 session block at the top + `rules_reconciliation.md`). Zealous's Turn-1 attack bypass is
  therefore moot and was deleted; Zealous now only bypasses the entry-turn ("fresh") restriction for attacks.
- **PC HP married (2026-06-07)** — the PC had TWO unsynced HP values (PlayerState vs PC BoardEntity;
  `makePc` even started at 25 vs 20). FIX: **PC BoardEntity = single source of truth**. `makePc` 25→20;
  `applyDamage`+`adjustHp` PC branches mirror entity HP→`game[owner].hp`; `StatsContent` (Tray) reads
  the PC entity (board PC ?? `_pc` ?? PlayerState); class bonuses use `bumpPcHp` (headline + `_pc` +
  board PC together). Combat damage + Paladin/Sorcerer bonuses now show in the stats pane.
- **Willpower ≥ Level play gate (2026-06-07)** — must have Willpower ≥ a card's Level to play it from
  hand (`Card_Design_Parameters` §1). `playWillpower(player)` = face-up CZ − Dismayed. Gated in
  `canPlayActionCard` (actions), `placeCard` (companions/constructs, vs PRE-flip WP), `equipItem`
  (items); HandFan dims over-level cards (all types). HARD gate (prose "function at full power"
  soft-play NOT used — flag if wanted).
- **Targeting prompt pulse (2026-06-07, UX)** — the "choose a target" step was easy to miss. `index.css`
  `.prompt-pulse` (gold) on `PromptBanner` + `.target-pulse` (`--pulse-col`: red attack / amber
  trigger-move / violet PC-placement) on highlighted `CommandZone` target slots.
- **CZ spent-card redesign (2026-06-07)** — face-down (spent Special Action) Class-Zone cards kept
  their glyph+name + a `✓ spent` tag (muted class tint, dashed border, grayscale) instead of blanking
  to a faint `◦` box (`Tray.tsx` CzSlot).

## REMAINING — the rider tail ✅ COMPLETE (2026-06-05)
All seven items below are DONE and preview-verified. The structured-effects engine now covers
every card across both decks. The biggest open work is now the **live two-peer multiplayer
playtest** of the state-sync rework (see DONE §Multiplayer). Deferred polish: player-choice pickers —
DONE: Memory Stone mid-combat, Kit-Master multi-item (+slot-capacity), Armor per-hit (see 2026-06-23
session at top); STILL DEFERRED: Scavenger (unwired), Lens any-deck, Untamed keyword — plus the
owner-ruling flags in OPEN QUESTIONS.

1. ~~**on-attack / on-kill triggers (attacker-side)**~~ — DONE 2026-06-05. `resolveCombatTriggers`
   in `resolveAttack` (after Cleave, before Reckless) fires onAttack/onDealDamage/onKill from the
   attacker's own card + equipped items, driven by per-hit `DamageEvent`s. Authored Vael (d6→AoE),
   Burning Heir (PC burn on companion damage), Greatsword (draw on kill), Mason's Hammer (anchor on
   physical-construct kill). Removal triggers also DONE 2026-06-05: `resolveRemovalTriggers` fires
   onDestroy/onLeave (card + items) from `applyDamage`'s destroy branch (shared path → combat AND
   action kills). Authored **Memory Stone** (onDestroy → returnFromDead, auto-picks most-recent dead
   card — player picker deferred). SCOPE: only HP→0 destruction is hooked; bounce/anchor-decay/
   Dismantle/Manifest leaves don't fire onLeave yet. Scorching Brand / Heart of the Convergence are
   damage MODIFIERS → item #2 (done).
2. ~~**Magic-Action damage modifiers**~~ — DONE 2026-06-05. `magicDamageBonus` static op +
   `magicCtx`/`magicActionDamageBonus`; the `damage` op adds `ctx.damageBonus` to each enemy a
   Magic Action damages (subtype-gated, excludes self/PC). Also `attackBonus` onAttack op for
   Scorching Brand. Authored Burning Eye, Wildfire Sigil, Heart of the Convergence (+Reckless
   grant via effectiveKeywords), Scorching Brand. FLAG: Heart modeled as a static aura.
3. ~~**Anchor-decay modifiers**~~ — DONE 2026-06-05. `preventAnchorDecay` static op + helper
   `controlsPreventAnchorDecay`; `readyPlayer` skips the −1 decrement for that player's Physical
   Constructs. New group TargetSpec `ownPhysicalConstructs` handled in the `anchor` op. Authored
   Master of Foundations (Reinforce 3 keyword + static no-decay) and Grudrik Stonebrace (Guardian +
   onEnter anchor +2 to ownPhysicalConstructs). FLAG: Grudrik's "+1 max anchor" is a no-op (no
   anchor-cap system exists).
4. ~~**Deferred start-of-turn deck-peeks**~~ — DONE 2026-06-05. `resolveStartOfTurn` defers
   `deckPeek` ops as `PeekRequest`s; `endTurn` arms `pendingPeek` + `pendingPeekQueue`;
   `resolvePeek`/`cancelPeek` dequeue via `nextPeek` (re-slices the live deck so chained peeks on the
   same deck don't go stale). Reused the existing PeekModal. Authored High Reader (look 2) + Lens
   (look 1). FLAGS: Lens "any deck" → own only; "one to bottom" not strictly enforced; peek arms on
   the endTurn client (local state — MP caveat).
5. ~~**Library of Memory**~~ — DONE 2026-06-05. Built a generic Dead-Zone picker: `PendingDeadPick`
   state + `DeadPickModal` + `resolveDeadPick`/`cancelDeadPick`; `resolveStartOfTurn` defers
   `returnFromDead` SoT clauses (postEffects like `exhaustSelf` run only if a card is taken). Also
   fixed `readyPlayer` to ready constructs (clear exhausted + ability-used markers) so the exhaust
   expires. Authored Library of Memory. NOTE: Memory Stone's onDestroy returnFromDead still auto-picks
   (mid-combat deferral is a separate follow-up).
6. ~~**Misc on-enter**~~ — DONE 2026-06-05. Veteran of the Ashgrove (equip-from-hand picker:
   `PendingEquipPick` + `EquipPickModal`; `equipOnto` extracted from `equipItem` for a free equip)
   and Field Engineer (two-step `moveAnchor` on-enter via `pendingActionTarget twoStep:'moveAnchor'`,
   source→dest among own Physical Constructs). FLAG: Field Engineer endpoints read as your own.
7. ~~**Long-Quiet Wall** attack-restriction~~ — DONE 2026-06-05. Static op `lineWard` +
   `wardedLines(board)` in keywords.ts (a front-line ward protects the back line, and vice-versa).
   `resolveAttack` rule #3 + CommandZone `legalAttackTargets` block COMPANION attackers from a
   warded line (PC attackers bypass). FLAG: "opposite line" = controller's other line; absolute
   (Evasive doesn't bypass).

## OPEN QUESTIONS / FLAGS for the owner
- ~~**Conflagration** "This character takes 1 damage"~~ — RESOLVED 2026-06-22: ruled to mean the
  character *performing the action*. Re-authored to `damage target:'self'` with the acting character
  threaded as `sourceId`. (Wrath of the Untamed Sky keeps `damageSelfPC` — its text says "your own PC".)
- ~~**Translocation Circle** activated ability vs §11~~ — RESOLVED 2026-06-22: ruled ALLOW as an
  exception. Authored `activated`/`oncePerTurn` bounce `target:'ownCompanion'` (oncePerTurn guards abuse
  since constructs have no action budget). FLAG: this is a sanctioned §11 exception.
- ~~**State-based HP** (+HP aura cap-vs-remove)~~ — RESOLVED 2026-06-22: owner clarified there should be
  NO HP buffs at all (max HP fixed, only healing — Card_Design_Parameters §8). Stripped +HP from all 4
  offending cards (Memory Stone, Anchor Stone, Long-Quiet Wall kept +atk/lineWard; **Stone Rampart**
  converted to `onEnter heal ownParty 1` — FLAG: confirm the heal re-theme). `effectiveMaxHp` now always
  == printed, so no over-damaged SBA is needed; the hp-aura machinery is left dormant.
- ~~**Action-economy not enforced**~~ — DONE 2026-06-07 (character-centric model). Playing an
  Action card now requires a selected own character and spends its action by the card's type
  (`actionSub`, default Major): Major→exhaust, Minor→tap, Special→PC-only + flip a Class-Zone card.
  Class-in-Class-Zone (`class1`/`class2`) and Two-Handed-blocks-Magic are enforced; activated
  abilities consume the character's Major (constructs exempt); first-turn Major restriction now
  covers actions + abilities (was attacks only). Shared gate `canPlayActionCard` in keywords.ts
  drives both store + UI. STILL NOT enforced: Dismayed reducing the Special-Action count; playing
  an Item card from the fan still uses the old equip path (Minor-from-hand). See todo.md Review.
- **Start-of-turn single-target auto-picks** the first enemy (not a player prompt).
- **Heart of the Convergence** ("when equipped character plays a Magic Action…") modeled as a
  static aura (+2 to your Magic-Action damage) since the engine doesn't bind Actions to a caster.
- **Scorching Brand** +1 on-attack bonus also rides Cleave splash (it's one damage value).
- **Grudrik Stonebrace** "+1 maximum Anchor counters" is a NO-OP — no anchor-cap system exists.
- **The Long-Quiet Wall** "line opposite this construct" read as the controller's other line
  (front↔back); restriction is companion-only and absolute (Evasive does NOT bypass).
- ~~**Memory Stone** auto-picks the most-recent Dead-Zone card~~ — RESOLVED 2026-06-22: built the
  interactive picker. Additive `sink?: PendingDeadPick[]` threads through
  `applyDamage`/`resolveRemovalTriggers`/`resolveActionEffects`; the `returnFromDead` op defers to the
  picker when a sink is passed (auto-pick fallback otherwise). Combat (`resolveAttack`, incl. Cleave) +
  action paths (`resolveActionTarget` single/disarm, `playAction` immediate) collect a sink and arm
  `pendingDeadPick` + new `pendingDeadPickQueue` (chains multi-bearer kills). Reuses `DeadPickModal`
  (forced pick). MP CAVEAT: `pendingDeadPick` is local (unsynced) — arms on the kill-running client, so
  a defender's Memory Stone would prompt the attacker in true MP; fine in sandbox. **Scavenger still
  unwired — no card carries it; would need an item-equip variant of the picker.**
- **Field Engineer** "move one Anchor counter from one Physical Construct to another" read as your
  OWN Physical Constructs (source→dest).

## Conventions / lessons
- **CARD-HISTORY NOTE (owner, 2026-07-15) — Anchor Stone has NO "+1 HP":** the former
  "Equipped character has +1 HP." sentence was intentionally removed (+HP doesn't fit item
  nomenclature). The shipped activation-only card is correct. Stale drafts with the +1 HP
  clause survive in old data snapshots and in older design-chat quotes — do not restore it,
  and diff any brief-quoted card text against the repo data before pinning to it.
- **DESIGN GUIDELINE (owner-ratified 2026-07-15, in Card_Design_Parameters §13):** prefer
  exhaust-style costs over "once per turn" wording for future generation/rework — exhaustion
  is self-tracking; printed "once per turn" cards keep their text.
- **AUTHORING CHECKLIST (2026-07-15, from the Grudrik audit):** when authoring or rewording ANY
  card's structured effects, verify EVERY sentence of its rules text maps to an op, a declared
  keyword, or reminder text — the prose-completeness gate returns early for any card that has
  effects at all (validateCards.ts) and CANNOT see partial implementations. A partial without
  an effectsFlag is invisible to every automated sweep.
- **STANDING REQUIREMENT (owner 2026-07-15):** when the interpreter's forced-movement `move` op
  is implemented (arc-1 flag #4), it MUST consult `moveRestrictedBy` — "cannot move between
  lines" covers effect-driven/forced movement too (R3, restriction-aura arc). A matching comment
  sits at the op's case in `src/data/validateCards.ts`. There is nothing to test until the op
  exists; whoever builds it writes the pin.
- **ENVIRONMENT RULE (2026-07-13):** parent/root design docs are reachable from LOCAL sessions
  only. CLOUD sessions see only the `twilight-app/` repo and read the `docs/` snapshots
  (sessions update snapshots; never hand-edit them). LOCAL sessions must `git fetch` inside
  twilight-app before trusting the repo's state — cloud work arrives on remote branches.
  One master per design doc, at the ROOT; every other copy is an archive copy (root
  `archive/`, never deleted — see `WHERE_THINGS_LIVE.md`).
- Keep `tasks/todo.md` review sections + the memory file (`memory/project_state.md`) updated
  per slice. Follow the user's global CLAUDE.md (plan-first, verify-before-done, simplicity).
- One slice at a time, verify in preview, remove temp hook, typecheck, update memory.
- **Every slice's verification script gets COMMITTED as a Vitest test (`src/__tests__/`,
  `npm test`), never run-and-discarded** (test_seed_plan.md Phase 0 rule, 2026-07-03). CI
  (`.github/workflows/ci.yml`) runs typecheck + deck validation + tests on every push.
- **OWNER STANDING RULE (2026-07-03): if an op's edge behavior isn't specified in the rules
  docs, list it as an OPEN QUESTION for the owner — never encode a reasonable-seeming answer
  as a test.** Corollary: the validator/mint-gate carries only ABSOLUTE rulings (no +HP, no
  Initiative); softer design constraints (no straight draw, no mill, token limits) are
  generation POLICY, not validator rules. Tests may pin current ENGINE state if labeled as such.
- **Deck authoring gate:** after hand-patching deck JSONs, run `npm run validate:decks`
  (scripts/validate-decks.mjs; also a CI step). The validator (`src/data/validateCards.ts`)
  is a PURE mint-gate: `validateCards(candidates, existingNames, keywords)` — previously
  minted names are a parameter (unique names, mechanics may repeat); the keyword vocabulary
  lives dependency-free in `src/data/keywordRegistry.ts` (store/keywords re-exports it).
- Don't touch pre-existing unrelated TS errors.
