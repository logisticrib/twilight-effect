# The Twilight Effect — Engine Hand-off

Self-contained context for continuing the card-effect engine work in a fresh session.

## Latest session (2026-06-23) — deferred player-choice pickers
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
- Keep `tasks/todo.md` review sections + the memory file (`memory/project_state.md`) updated
  per slice. Follow the user's global CLAUDE.md (plan-first, verify-before-done, simplicity).
- One slice at a time, verify in preview, remove temp hook, typecheck, update memory.
- Don't touch pre-existing unrelated TS errors.
