# The Twilight Effect — Engine Hand-off

Self-contained context for continuing the card-effect engine work in a fresh session.

## Latest session (2026-07-06) — Phase 2 replay recorder + runner DONE (solo v1)
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
  **exact-empty after** (surplus); re-execute action / paste `setState`; hash-diff → `ReplayDivergence`
  with step/action/last-good-turn. `recorder.suspend()` during replay so it doesn't self-record.
- **UI**: `RecorderButton` (bottom-left chip, `useSyncExternalStore`) — "⏺ REC · N actions · T turns"
  during play (NO in-play "invalidated" state anymore — pass/fail moved to export). Click →
  `downloadReplay()` (validate + download); a failed validation or a boundary surfaces as a toast.
  Same download on the GameOverScreen (disabled+reasoned on a boundary). Fixtures dir
  `src/replay/fixtures/*.replay.json` (a Vitest test globs + replays them; none committed yet).
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
