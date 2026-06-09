# The Twilight Effect — Engine Hand-off

Self-contained context for continuing the card-effect engine work in a fresh session.

## Project / run
- App: `twilight-app/` (React 19 + Vite + Zustand + TS + Tailwind 4 + PeerJS).
- Start server (npm not on PATH): from `twilight-app/`, run
  `"C:\Program Files\nodejs\node.exe" node_modules/vite/bin/vite.js --host` — or use the
  Claude Preview tool: `preview_start` with config name `twilight-app` (port 5173).
- Typecheck: `"C:\Program Files\nodejs\node.exe" node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`
  - PRE-EXISTING errors (ignore, not ours): CardFace.tsx `cls` unused + 2 arg errors;
    Play.tsx `isMatchingPhase` unused; CZExchangePanel(108/113); HandFan(8/14);
    ClassBonusModal(261); deckStore(35). Filter these out when checking your work.
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
- `src/store/keywords.ts` — pure helpers: `effectiveAttack(ent,game)`,
  `effectiveMaxHp(ent,game)`, `effectiveKeywords(ent,game)` (printed + buff grants + item
  keyword grants, MINUS opposing keyword-suppression auras), `hasModifier`, `isPhysicalConstruct`,
  `parseEnterTrigger`, `firstItemOf`, `gatherActivated`, plus the static-aura/item-bonus
  internals (`staticAuraStat`, `selfItemStat`, `isKeywordSuppressed`).
- `src/store/gameStore.ts` — the interpreter + all reducers. Module-level (above the store):
  `applyDamage` (Armor→hpFloor1→PC-defeat; used by combat AND actions),
  `resolveActionEffects(game,lp,sourceName,effects,targetId?,sourceId?)` (the big switch:
  damage/heal/buff/draw/discard/mill/bounce/extraAttack/forceAttack/anchor/animate/dieCheck),
  `resolveStartOfTurn`, `eligibleTargets`, `actionTargetSpec`/`effectTargetSpec`,
  `twoStepKind`, `permanentEffects`, helpers (`charsOf`, `companionIds`, `constructIds`,
  `pcIdOf`, `amountValue`, `rollD6`).

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
- **Zealous on turn 1 (2026-06-07, RULING)** — Zealous now bypasses the first-turn "no Major Actions"
  restriction **for attacks only** (non-attack Majors still blocked). `beginAttack` skips the turn-1
  block for Zealous; `computeActions` uses `attackTurn1Block = turn1Block && !zealous`.
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
playtest** of the state-sync rework (see DONE §Multiplayer). Deferred polish: player-choice pickers
(Memory Stone mid-combat, Scavenger, Armor auto-select, Kit-Master multi-item, Lens any-deck) and
the owner-ruling flags in OPEN QUESTIONS.

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
- **Conflagration** text "This character takes 1 damage" is ambiguous (an Action has no
  character) — interpreted as caster's PC self-damage. Confirm or revise.
- **Translocation Circle** is a *construct* with a Minor-Action activated ability, but
  Card_Design_Parameters §11 says constructs CANNOT have activated abilities. Deferred —
  needs a ruling (strip the ability or allow it).
- **State-based HP**: when a +HP aura drops, current code CAPS hp to effectiveMaxHp rather
  than removing the unit (rules say remove-if-damaged-beyond). Confirm the gentler behaviour is OK.
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
- **Memory Stone** auto-picks the most-recent Dead-Zone card instead of a "target card" choice.
  A generic Dead-Zone picker modal NOW EXISTS (Library of Memory uses it), but Memory Stone's
  onDestroy fires deep inside `applyDamage`, so wiring it to the picker needs deferral plumbing out
  of combat resolution (follow-up). Same picker would unblock Scavenger.
- **Field Engineer** "move one Anchor counter from one Physical Construct to another" read as your
  OWN Physical Constructs (source→dest).

## Conventions / lessons
- Keep `tasks/todo.md` review sections + the memory file (`memory/project_state.md`) updated
  per slice. Follow the user's global CLAUDE.md (plan-first, verify-before-done, simplicity).
- One slice at a time, verify in preview, remove temp hook, typecheck, update memory.
- Don't touch pre-existing unrelated TS errors.
