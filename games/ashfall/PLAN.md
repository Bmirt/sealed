# ASHFALL DYNASTY - Build Plan

A 5×3, 243-ways video slot. Dark medieval dragon-dynasty theme. Target RTP 96.5 %, high volatility, max win 5,000× bet.

This document is the contract for the build. Anything that deviates from the brief is listed in §10 with the reason. Nothing is written until this plan is approved.

---

## 1. Art direction (one sentence, then the rules)

**"Obsidian & Ember"** - a volcanic keep at night, lit from below by lava and from above by nothing; everything is black stone, carved relief, and molten gold, with drifting ash and ember as the only motion when the player is idle.

- **Palette (fixed, exported from one file):** obsidian `#0B0A0D`, charcoal stone `#1D1B22`, ash `#8A8690`, molten gold `#F2B134` → highlight `#FFD66B`, ember `#FF6A1F`, garnet accent `#8F1D2C`, emerald `#2EC27E` (used *only* by the Emerald Dragon). Free-spins sky adds a deep indigo `#141A33` and cold starlight `#C9D4FF`.
- **Light model:** warm key-light from *below* (lava) in the base game; in free spins the keep is backlit by a cold night sky while the reel frame still glows warm from underneath. This contrast is the visual signature of the feature.
- **Symbols:** every symbol is a heavy stone tile with a carved inner relief. Highs are heraldic dragon silhouettes (stylised, rim-lit in gold - imposing, not cute). Mids are gold-metal objects on stone. Lows are **monochrome carved sigils** - readable by silhouette alone (flame / wolf head / kraken / rose), never by colour.
- **Motion language:** heavy. Reels have mass (overshoot + settle), wins *burn* rather than sparkle, big wins shake the camera. Nothing bounces cheerfully.
- **Type:** heavy serif display via a system stack (`"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`), all-caps with wide tracking for titles. No external font files (see §10). A licensed display font can be dropped in through the asset manifest later.
- **Names (all original):** game title *Ashfall Dynasty*. Houses: **House Vaelor** (Gold Dragon), **House Cindrath** (Ash Dragon), **House Myrrowen** (Emerald Dragon). Wild: *The Molten Throne*. Scatter: *Dragon Egg*. Feature: *Dragonfire Free Spins*; multiplier: *Dragonfire Meter*. Buy tiers: *Summon the Dragons* (100×) and *Wake the Elder* (300×).

---

## 2. Stack & tooling

| Concern | Choice |
|---|---|
| Build | Vite 6, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `any`, ESLint rule `@typescript-eslint/no-explicit-any: error`) |
| Canvas | PixiJS v8 (WebGL preferred, WebGPU not relied on) |
| Tweening | GSAP 3 - *all* timed animation goes through GSAP timelines (this is what makes skipping tractable, §7) |
| Audio | Howler 2 for playback/mixing/mobile-unlock; Web Audio `OfflineAudioContext` to synthesise every sound into WAV blobs at boot |
| UI chrome | Plain DOM + CSS (custom properties, `clamp()`), no framework |
| Tests | Vitest (+ jsdom for DOM/GSAP tests), golden JSON fixtures |
| Sim | `tsx` CLI scripts under `scripts/` - pure Node, import only `src/math` and `src/config` |
| Package manager | pnpm (via `corepack` - see §10) |

Single app, single `package.json`, no monorepo.

---

## 3. Module boundaries

```
src/
  math/              PURE. No DOM, no Pixi, no GSAP, no Howler imports (enforced by an ESLint
                     no-restricted-imports rule + a test that greps the module).
    rng.ts             cyrb128 string hash → sfc32 PRNG. rngFor(seed, nonce) → stream
    types.ts           GameConfig, SpinOutcome, SpinResult, WayWin, FeatureOutcome…
    grid.ts            stops → visible 5×3 grid from reel strips (wrapping)
    ways.ts            243-ways evaluation (wild substitution, scatter counting)
    feature.ts         free-spins resolution: spin count, retriggers, Dragonfire Meter
    spin.ts            spin(config, seed, nonce) → SpinOutcome   (base + optional feature)
    buy.ts             buySpin(config, seed, nonce, tier) → SpinOutcome
    cap.ts             max-win cap applied to a whole round
    validate.ts        config sanity (strip lengths, symbol ids, scatter spacing, cost > 0…)
    exact.ts           closed-form base-game RTP (line + scatter pays) for fast tuning
    index.ts           public surface: spin, buySpin, validateConfig, exactBaseRtp
  config/
    game.config.ts     THE GameConfig object (symbols, strips, paytable, feature, buy, bets, flags)
    speeds.ts          SpeedProfile per turbo mode (all presentation durations)
    palette.ts         colour tokens (single source for Pixi + CSS)
  assets/
    manifest.ts        AssetManifest: id → { kind:'procedural', draw } | { kind:'texture', url }
                       Everything visual/audible is looked up here; swapping real art = edit this file
    procedural/        symbol painters (Pixi Graphics → baked textures), frame, background, dragon
    sfx/               synth recipes (Web Audio) → WAV blob per sound id, music loops
  audio/
    AudioEngine.ts     Howler wrapper: buses (music/sfx/ambient), ducking, pitch ramps, unlock
  game/                Pixi scene graph
    GameScene.ts       root; layout (portrait/landscape); resize; ticker budget
    Background.ts      volcanic keep / night-sky variants, dragon pass-by, firelight flicker
    ReelsView.ts       5 × ReelView; spin/stop choreography driven by SpeedProfile
    ReelView.ts        strip cycling, blur textures, overshoot/settle; wild fire-trail hook
    SymbolView.ts      pooled sprite + frame + dim/pulse states
    Anticipation.ts    scatter-tease controller (reel slow, frame pulse, ember surge, music duck)
    WinPresenter.ts    dim/pulse/trace-way/roll-up; tiered Big/Mega/Epic/Legendary sequences
    Particles.ts       pooled ember/spark/ash emitters on Pixi ParticleContainer
    FeatureScenes.ts   free-spins intro/outro, buy-bonus cinematic (dragon pass, reels ignite)
  presentation/        the skip/interrupt system (§7)
    Sequencer.ts       queue of Presentation objects; skip(), abortToEndState()
    Presentation.ts    { play(): Promise<void>; skip(): void } over a GSAP timeline
  state/
    GameStore.ts       balance, bet, turbo, autoplay, sound, settings; localStorage persistence
    GameController.ts  the state machine: IDLE→SPINNING→STOPPING→PRESENTING→FEATURE→IDLE;
                       owns seed/nonce, calls math, feeds outcomes to the renderer, never mutates them
  ui/                  DOM chrome
    Hud.ts  BetSelector.ts  SpinButton.ts (hold-to-repeat)  TurboButton.ts  AutoplayPanel.ts
    BuyBonusModal.ts  PaytableModal.ts  SettingsPanel.ts  Modal.ts  styles/*.css
  main.ts
scripts/
  sim.ts             pnpm sim - 1M headless spins, report
  exact-rtp.ts       pnpm rtp:exact - analytic base RTP
  update-golden.ts   pnpm golden:update - regenerate fixtures (explicit, never automatic)
tests/
  math/*.test.ts     rng, grid, ways, feature, buy, cap, validate, exact-vs-sim
  golden/*.json      fixed (seed, nonce) → full outcome
  presentation/*.test.ts   skip / interrupt / hold-to-repeat
  state/*.test.ts    store persistence, controller transitions
```

**Hard rule:** `src/math` returns the *entire* round (base spin + every free spin, every multiplier step, every retrigger, cap flag). The renderer is a playback device. `GameController` does not contain a single `Math.random()`; the only RNG seed is created in the store (a random session seed + incrementing nonce), and a dev panel lets you type a seed so any outcome is reproducible on screen.

---

## 4. Symbol set

| Id | Code | Name | Tier | Notes |
|---|---|---|---|---|
| `H1` | 0 | Gold Dragon (House Vaelor) | High | top pay |
| `H2` | 1 | Ash Dragon (House Cindrath) | High | |
| `H3` | 2 | Emerald Dragon (House Myrrowen) | High | only symbol with green |
| `M1` | 3 | Obsidian Crown | Mid | |
| `M2` | 4 | Ancestral Blade | Mid | |
| `L1` | 5 | Flame Sigil | Low | tall tapering silhouette |
| `L2` | 6 | Wolf Sigil | Low | pointed ears, wide |
| `L3` | 7 | Kraken Sigil | Low | tentacled, round |
| `L4` | 8 | Rose Sigil | Low | petalled, compact |
| `W`  | 9 | The Molten Throne | Wild | reels 2–5 only (config), fire-trail on land |
| `S`  | 10 | Dragon Egg | Scatter | all reels, max one visible per reel |

Strips use numeric codes (fast sim); config exposes the names.

**Money model (integers only, no floats in math):** total bet = **20 coins**. Paytable is coins per way. The UI maps coins → currency with `coinValue = bet / 20` and keeps all money in integer cents. Bet levels (currency): 0.20 · 0.50 · 1 · 2 · 5 · 10 · 20 · 50 · 100. Max win cap = 5,000 × 20 = 100,000 coins. Golden files compare integer outcomes, so they are exact.

**Draft paytable (coins per way; 3 / 4 / 5 of a kind) - starting point, the sim tunes it:**

| Symbol | 3 | 4 | 5 | 5-oak in ×bet per way |
|---|---|---|---|---|
| H1 | 10 | 25 | 60 | 3.0× |
| H2 | 8 | 20 | 40 | 2.0× |
| H3 | 6 | 15 | 30 | 1.5× |
| M1 | 4 | 10 | 20 | 1.0× |
| M2 | 3 | 8 | 16 | 0.8× |
| L1, L2 | 2 | 4 | 8 | 0.4× |
| L3, L4 | 1 | 3 | 6 | 0.3× |
| S (scatter pay, total, not per way) | 40 | 200 | 1000 | 2× / 10× / 50× |

Full screen of H1 = 243 × 60 = 14,580 coins = 729× bet; with Dragonfire ×7+ it hits the 5,000× cap - so the cap is reachable without being common.

---

## 5. Config schema

```ts
export interface GameConfig {
  id: 'ashfall-dynasty';
  version: string;                          // bump when maths changes → golden files must be regenerated
  layout: { reels: 5; rows: 3 };
  coinsPerBet: 20;
  betLevels: number[];                      // currency, e.g. [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]
  defaultBetIndex: number;
  symbols: Record<SymbolId, { code: SymbolCode; name: string; tier: 'high'|'mid'|'low'|'wild'|'scatter' }>;
  wild: { id: 'W'; reels: boolean[] };      // which reels may carry wilds
  scatter: { id: 'S' };
  paytable: Record<PayingSymbolId, [three: number, four: number, five: number]>;
  scatterPays: [three: number, four: number, five: number];
  strips: { base: SymbolCode[][]; free: SymbolCode[][] };   // 5 strips each, any length ≥ 30
  freeSpins: {
    awards: { 3: 10; 4: 15; 5: 20 };        // scatters → spins (retrigger uses same table)
    retrigger: boolean;
    meter: { start: 1; winsPerStep: 3; step: 1; cap: 10 };
  };
  buy: {
    free:  { costX: 100; minScatters: 3 };
    super: { costX: 300; spins: 8; meterStart: 3 };
  };
  maxWinX: 5000;
  rtp: { target: 0.965; declaredBase: number; declaredBuyFree: number; declaredBuySuper: number };
                                           // declared values are written from sim output and
                                           // asserted by a deterministic 200k-spin test (±1.5 %)
  features: { bonusBuy: { enabled: boolean; superTier: boolean }; autoplay: { enabled: boolean; options: number[] } };
}
```

Outcome shape (what the renderer receives):

```ts
interface SpinOutcome {
  configVersion: string; seed: string; nonce: number; kind: 'base' | 'buyFree' | 'buySuper';
  base: SpinResult;
  feature: FeatureOutcome | null;
  totalWinCoins: number;                     // after cap
  capped: boolean;
}
interface SpinResult {
  stops: number[];                           // 5 strip indices
  grid: SymbolCode[][];                      // [reel][row], top → bottom
  wins: WayWin[];                            // per symbol
  scatter: { count: number; positions: Array<[reel, row]>; pay: number };
  lineWinCoins: number; multiplier: number; totalWinCoins: number;
  triggersSpins: number;                     // 0 unless ≥3 scatters
}
interface WayWin { symbol: SymbolId; length: 3|4|5; ways: number; payPerWay: number; win: number;
                   positions: Array<[reel, row]> }   // every participating cell incl. wilds
interface FeatureOutcome {
  tier: 'free' | 'super'; spinsAwarded: number; meterStart: number;
  spins: FreeSpinResult[];                   // in play order
  totalWinCoins: number; meterEnd: number; endedByCap: boolean;
}
interface FreeSpinResult extends SpinResult {
  index: number; spinsRemainingAfter: number;
  meterBefore: number; meterAfter: number; winsTowardStep: number;  // (0..winsPerStep-1) after this spin
  retriggerSpins: number;
}
```

**Deterministic rules baked into the maths**

- Each reel stop is one uniform draw on its strip; visible window = `strip[i], strip[i+1], strip[i+2]` (wrapping).
- Ways: for each paying symbol, `count_r` = number of cells on reel *r* equal to the symbol or wild; length = consecutive reels from reel 1 with `count_r ≥ 1`; ways = Π `count_r`; pay only if length ≥ 3. Wild never appears on reel 1, so no double-counting and no "wild pays" ambiguity.
- Scatters count anywhere on screen. Scatter pay is added to line wins.
- Dragonfire Meter: a spin's win is multiplied by `meterBefore`. After the spin, if its (unmultiplied) win > 0, `winsTowardStep++`; on reaching `winsPerStep` the meter steps by `step` (capped) and the counter resets. The step is therefore always *visible* as a separate beat after the win is paid.
- Retrigger: ≥3 scatters in a free spin add spins per the awards table; the scatter pay is also paid.
- Max-win cap applies to the **round** (base spin + its feature). The feature ends at the spin where the cumulative round win reaches the cap; that spin's win is clipped; `capped = true`.
- Buy: rejection-sample base-strip stops until the base spin shows ≥ `minScatters` scatters (deterministic given the stream; ~1/200 per attempt so it's cheap). The triggering spin's own line/scatter wins are paid. Super tier forces exactly 3 scatters, awards `spins` (8), starts the meter at 3.

---

## 6. Reel-strip tuning approach

1. **Targets** (high-volatility profile): base hit-rate ≈ 25–28 % of spins; feature frequency ≈ 1 in 180–220; RTP split ≈ 60 % base / 36.5 % feature; buy-free RTP 96–97 %; buy-super RTP 96–97 %; max win reachable (≥ 1 hit per ~3M spins, uncapped distribution must exceed 5,000× occasionally); cap hits logged.
2. **Strips are explicit arrays** in `game.config.ts` (auditable, golden-stable). They are *authored* by `scripts/strip-gen.ts` from a per-reel symbol-count table + constraints (no two scatters within 3 positions so ≤1 visible per reel; wild never adjacent to scatter; same high symbol not adjacent to itself on reels 1–2 to control "near miss" frequency), with a fixed internal seed so re-running gives the same strip. The generated arrays are pasted/written into the config - the game never generates strips at runtime.
3. **Fast loop:** `pnpm rtp:exact` computes base-game line+scatter RTP in closed form (reels are independent, so `E[ways of exactly n reels] = Π_{r≤n} E[count_r] · P(count_{n+1}=0)`) - instant feedback while adjusting counts/paytable.
4. **Truth loop:** `pnpm sim` (1M spins, seeded, ~3–5 s) reports total RTP, base/feature split, hit frequency, feature frequency, avg feature win, meter distribution, win-distribution buckets (×bet), max win, cap hits, volatility (std-dev). `pnpm sim --mode buy|super` does the same for bought features.
5. **Levers, in order:** free-strip scatter density (feature length/retriggers) → free-strip high-symbol density (feature RTP) → base-strip scatter density (feature frequency) → low-pay values (hit rate without moving RTP much) → high-pay values (volatility/max-win reach).
6. The tuned numbers are written into `config.rtp.declared*` and locked by the 200k-spin deterministic test. Changing maths = bump `config.version` + `pnpm golden:update` (a conscious act, reviewed in diff).

---

## 7. Presentation, skip & interrupt system (the part that usually breaks)

Every timed thing on screen is a **Presentation**: `{ play(): Promise<void>; skip(): void; readonly done: boolean }` wrapping one GSAP timeline. `skip()` = `timeline.progress(1)` which runs every `onComplete`, so the end state is *guaranteed identical* to letting it finish (balance credited once, symbols un-dimmed, counter at the final value). A **Sequencer** runs presentations in order and exposes:

- `skipCurrent()` - bound to click-on-canvas and Space.
- `abortToEndState()` - synchronously skips the current *and* every queued presentation, then resolves. Used when Spin is pressed during a win presentation: the win is fully credited, the screen is reset, and the next spin starts on the next frame.

**Controller state machine:** `IDLE → SPINNING → STOPPING → PRESENTING_WINS → (FEATURE_INTRO → FEATURE_SPIN…→ FEATURE_OUTRO) → IDLE`.

| Input | State | Behaviour |
|---|---|---|
| Spin / Space | IDLE | start spin |
| Spin / Space / click | SPINNING | slam-stop: reels stop at the outcome now (outcome unchanged) |
| click / Space | anticipation | stops reels (deliberate skip allowed; **turbo** never does this automatically) |
| Spin | PRESENTING_WINS | `abortToEndState()` then start next spin (next frame) |
| click / Space | PRESENTING_WINS | skip current beat (e.g. roll-up snaps to total) |
| click / Space | Big/Mega/Epic/Legendary | counter snaps to final total, holds 600 ms, dismiss; second click dismisses immediately |
| Spin held | IDLE | auto-repeat spins (hold ≥ 350 ms, repeats as soon as IDLE) |
| Spin | FEATURE_* | disabled; click/Space skips current beat only |
| anything | buy-bonus cinematic | click/Space skips to the feature's first spin |

**Turbo rules (SpeedProfile):** Normal / Turbo (≈40 % durations, shortened win beats, faster roll-up) / Quick (near-instant, wins shown as a single flash + snap-to-total). Anticipation and Big-Win+ sequences are *outside* the profile and always play at full length unless the player skips them. Persisted as `turboMode` in localStorage.

**Tests (jsdom + GSAP with `gsap.globalTimeline` paused and stepped manually):**
1. skip mid-roll-up → balance equals outcome exactly once, counter shows total.
2. spin during win presentation → presentation end-state reached, spin begins, no leftover dim/pulse.
3. spin during anticipation → reels land on the pre-computed stops (outcome identical).
4. double skip / skip after completion → no-op, no double credit.
5. turbo mode does not shorten anticipation or Big-Win+ timelines.
6. hold spin → repeats; release → stops after current spin.
7. autoplay stops on feature trigger / insufficient balance.
8. store persists turbo/sound/bet across reloads.

---

## 8. Rendering & performance budget

- Symbols are **baked textures**: each procedural painter draws into Graphics once and `renderer.generateTexture()`s it (and a vertically-stretched "blur" variant) at boot. Reels render plain Sprites - no Graphics, no filters in the spin loop.
- Reel mask = one rect mask; reel blur = swap to the pre-baked blur texture, not BlurFilter.
- Particles on `ParticleContainer` with a fixed pool (≈ 400 embers, 200 sparks); emitters reuse, never allocate in `ticker`.
- One `ticker` update per frame with a frame budget; ambient effects degrade first (ember count halves if the 1-s rolling FPS < 50).
- Resolution capped at `min(devicePixelRatio, 2)`; canvas sized to a 1600×900 landscape / 900×1600 portrait design space letterboxed into the viewport; DOM HUD reflows with CSS (360 px → desktop).
- Dev overlay (`?dev`): FPS, draw calls, seed/nonce entry, force-outcome buttons (which just call `spin` with a chosen seed - still never bypassing the maths).
- Physical-device 60 fps validation is on the reviewer's side (§10).

---

## 9. Stages, deliverables, acceptance

Each stage ends with tests green, a commit, and a stop for review.

| # | Stage | Deliverable | Accept when |
|---|---|---|---|
| 1 | **Maths** | `src/math`, `src/config`, `scripts/sim.ts`, `rtp:exact`, strip-gen, golden fixtures, README (art direction, rules, jurisdiction note) | `pnpm test` green; `pnpm sim` reports 96.5 % ± 0.3 % at 1M spins, buy tiers 96–97 %, max win reachable; determinism test passes |
| 2 | **Static reels** | Pixi app, asset manifest, all 11 procedural symbols, frame, background, DOM HUD skeleton; press Spin → outcome rendered instantly (no animation) with win amount | real outcomes on screen, responsive layout both orientations |
| 3 | **Motion** | spin-up/blur/stop with overshoot, scatter anticipation, win presentation + tiers, Sequencer + skip tests | all §7 tests green; every animation skippable |
| 4 | **Features** | free spins scene (night sky, alt strips, meter), retrigger, buy modal + cinematic, turbo cycle, autoplay, paytable/settings | feature flows end-to-end from both natural trigger and buy; `bonusBuy.enabled=false` removes the button |
| 5 | **Juice** | audio engine + synthesised SFX/music, ducking, ambient embers/flicker/dragon, camera shake, pitch-ramped counters, perf pass | FPS overlay stable; dev-audit of allocation in the spin loop; final README |

Commits: `stage-1: maths`, `stage-2: static reels`, … on `main` of a fresh repo initialised at stage 1.

---

## 10. Deviations / interpretations to confirm

1. **pnpm is not installed** on this machine (Node 22, corepack 0.34 present). I will run `corepack enable pnpm` (machine-level shim in the Node bin dir) unless you'd rather I use `corepack pnpm …` per command. Say which.
2. **Howler + synthesised audio.** Howler plays from URLs, not raw buffers. I'll render every sound with `OfflineAudioContext` → WAV → `Blob` URL and feed those to Howler, keeping Howler's bus/fade/pitch/mobile-unlock. This satisfies both "Howler for audio" and "synthesise all sound with Web Audio".
3. **Fonts.** "No external assets" read strictly → system serif stack, no Google Fonts / bundled font files. Swappable via the manifest.
4. **Dragonfire Meter step size.** "Steps up every third win, capped at ×10" - implemented as +1 per three winning spins (×1→×10 needs 27 winning spins; realistically reached only in long retriggered features, which is the high-volatility payoff). `step`, `winsPerStep`, `cap` are config so a ladder like 1→2→3→5→8→10 is a one-line change if the sim says the meter is too cold.
5. **Max-win cap** is applied to the whole round (base + feature) and ends the feature when hit - standard practice; the alternative (per-spin cap) is a one-line change in `cap.ts`.
6. **Buy-bonus triggering** uses deterministic rejection sampling of the base strips rather than a special strip set, so the bought feature's 3/4/5-scatter distribution matches the natural one. Super tier forces exactly 3.
7. **Skip vs. turbo.** Turbo never auto-skips anticipation or Big Win+; a deliberate click/Space does (the brief requires every animation to be skippable). Both rules are tested.
8. **60 fps on a mid-range phone** cannot be measured from this machine. I'll build to the budget in §8 and expose the FPS overlay; please run it on a real device at stage 5 review.
9. **Wild reel availability**: reels 2–5 to start (config); the sim may push this to 2–4 for volatility.
10. **Autoplay** ships with 10/25/50/100 + stop-on-feature + stop-on-insufficient-balance. Loss-limit / single-win-limit controls are not in the brief; I'll add them only if you ask (some jurisdictions require them - noted in README).

---

## 11. Open questions - answered

- Currency / locale: `€`, `en-GB`, starting balance 1,000.00.
- Scatter pays: on.
- Super tier spin count: 8.
- Buy modal: both tiers, super flag-gated (default on).

---

## 12. Amendments made during the build (approved plan → what shipped)

**Stage 3**

0. The presenter was put behind a Pixi-free `PresenterDeps` interface so the real sequencing/skip
   logic runs in tests against fake visuals - a structural addition, not a behaviour change.

**Stage 5**

0. Audio cues piggyback on the visual callbacks (via `audioBus`) instead of a parallel cue
   channel in the presenter - audio cannot desynchronise from what is on screen, and skipped
   beats fire their cue exactly once for free. Pixi v8's `ParticleContainer` turned out to need
   a shared texture source **and** a per-frame `update()` - both handled inside `ParticleSystem`.

**Post-ship art & animation pass (user feedback, 2026-08-25)**

0. Symbol art relaunched: stone tiles dropped in favour of floating emblems (bold outline,
   layered gradients, rim light, baked drop shadow) over recessed cell slots; the full-body
   dragons became dragon-HEAD emblems (far stronger silhouettes); lows moved onto four distinct
   plate shapes. Animation move-set extended to the premium set (win pop with flash + wiggle,
   landing squash-and-stretch, spin-up pull-back, win plume, cell sprays, tier ember fountain) -
   modelled on the Stake Engine reference bar (idle breathe / win pop / anticipation shake).

**Stage 1**

1. **Super tier meter rules.** At 300× the super feature must be worth ≈ 3× the regular one; "×3 start, fewer spins" on the same reels is worth ≈ 1.1× and cannot reach 96.5 %. Shipped: super = 8 spins, meter **starts ×3 and steps +2 on every win** (cap ×10). `buy.super.meter` is a full `MeterRules` object, so this is data, not code. Same free strips are used. Documented in README.
2. **`cap.ts` folded in.** The round cap lives inside `feature.ts`/`spin.ts` (three lines each); a separate module added nothing.
3. **Strip builder gained block placement** (`blocks` per reel recipe) - stacking lows was needed to bring hit frequency into the high-volatility range. Strips remain explicit committed arrays.
4. **Paytable retuned** from the draft: highs 3/4/5 = 1.0/3.25/8.0× … lows 0.15/0.45/1.1× (see README). Final hit frequency 22 % (plan said 25–28 %; lower was required to make the bought feature and base RTP close simultaneously - standard for a Hacksaw-style profile).
5. **Declared RTP uses exact base + precise feature EV** (200k bought features), because a 1M Monte-Carlo still has ±1 % noise on the feature share. The 1M sim remains the headline check (96.46 %).
