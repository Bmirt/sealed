# Ashfall Dynasty

A 5-reel × 3-row, 243-ways video slot. Dark medieval dragon-dynasty theme: obsidian, molten gold, ember and ash, house sigils carved in stone, dragons circling a volcanic keep.

Browser-based, single app: **Vite + TypeScript (strict) + PixiJS v8 + GSAP + Howler**. No external art or audio — every symbol and effect is drawn procedurally and every sound is synthesised with the Web Audio API. Mock balance only; no wallet, no real money.

> Build status: **Stage 2 of 5 — static reels rendering real outcomes.** Stages 3–5 (animation, features, polish) follow. See [PLAN.md](PLAN.md).
>
> `pnpm dev` then open the URL; add `?dev` for the dev overlay (FPS, seed/nonce entry, "find me a scatter / wild / big win" buttons — all of which still go through the maths).

---

## Art direction — "Obsidian & Ember"

A volcanic keep at night, lit from below by lava and from above by nothing. Everything is black stone, carved relief and molten gold; drifting ash and ember are the only motion when the player is idle.

- **Palette** (one source file, shared by Pixi and CSS): obsidian `#0B0A0D` · charcoal stone `#1D1B22` · ash `#8A8690` · molten gold `#F2B134` → highlight `#FFD66B` · ember `#FF6A1F` · garnet `#8F1D2C` · emerald `#2EC27E` (Emerald Dragon only). Free spins add night-sky indigo `#141A33` and starlight `#C9D4FF`.
- **Light model:** warm key-light from *below* (lava) in the base game; in free spins the keep is backlit by a cold night sky while the reel frame still glows warm from underneath.
- **Symbols:** heavy stone tiles with carved inner relief. Highs are heraldic dragon silhouettes, rim-lit in gold — imposing, never cute. Mids are gold objects on stone. Lows are monochrome carved sigils readable by *silhouette alone* (flame / wolf / kraken / rose), never by colour.
- **Motion:** heavy. Reels have mass (overshoot + settle), wins burn rather than sparkle, big wins shake the camera. Nothing bounces cheerfully.
- **Type:** heavy serif display from a system stack; no external font files (swappable via the asset manifest).

All names are original: *Ashfall Dynasty*; Houses **Vaelor** (Gold Dragon), **Cindrath** (Ash Dragon), **Myrrowen** (Emerald Dragon); wild *The Molten Throne*; scatter *Dragon Egg*; feature *Dragonfire Free Spins* with the *Dragonfire Meter*; buy tiers *Summon the Dragons* and *Wake the Elder*.

---

## Game rules

| | |
|---|---|
| Layout | 5 reels × 3 rows, **243 ways** (adjacent reels, left to right, any row) |
| RTP | **96.5 %** target · measured 96.46 % (1M spins) / 96.56 % (exact + feature EV) |
| Volatility | High · hit frequency ≈ 22 % · std-dev ≈ 9.9× bet |
| Max win | **5,000× bet**, applied to the whole round (base spin + its feature); the feature ends when the cap is reached |
| Bet | 0.20 – 100 (9 levels); total bet = 20 coins; all maths in integer coins |

**Symbols** (pays in × bet per way, 3 / 4 / 5 of a kind)

| Symbol | Tier | 3 | 4 | 5 |
|---|---|---|---|---|
| Gold Dragon — House Vaelor | High | 1.00 | 3.25 | 8.00 |
| Ash Dragon — House Cindrath | High | 0.80 | 2.50 | 6.00 |
| Emerald Dragon — House Myrrowen | High | 0.60 | 2.00 | 5.00 |
| Obsidian Crown | Mid | 0.50 | 1.25 | 3.00 |
| Ancestral Blade | Mid | 0.40 | 1.10 | 2.75 |
| Flame Sigil, Wolf Sigil | Low | 0.25 | 0.60 | 1.25 |
| Kraken Sigil, Rose Sigil | Low | 0.15 | 0.45 | 1.10 |
| Dragon Egg (scatter, total) | — | 2× | 10× | 50× |

- **The Molten Throne (wild)** substitutes for every symbol except the scatter. Appears on reels 2–5. Burns a fire trail down its reel when it lands.
- **Dragon Egg (scatter)** appears on all reels, at most one per reel. 3 / 4 / 5 scatters award **10 / 15 / 20 Dragonfire Free Spins** and pay the scatter prize.

**Dragonfire Free Spins**

- Played on a hotter, higher-variance reel set under a night-sky volcanic backdrop.
- The **Dragonfire Meter** multiplies every free-spin win. It starts at ×1 and steps up **+1 every third winning spin**, capped at ×10. A spin is paid at the meter's current value; the step is shown afterwards, so the climb is always visible.
- 3 / 4 / 5 scatters during the feature **retrigger** 10 / 15 / 20 more spins.

**Buy Bonus** (can be disabled — see *Jurisdictions*)

| Tier | Cost | What you get | Feature RTP |
|---|---|---|---|
| Summon the Dragons | 100× bet | A spin guaranteed to land ≥ 3 scatters; the normal feature | 97.7 % |
| Wake the Elder (super) | 300× bet | 8 free spins; the meter **starts at ×3 and jumps +2 on every win** (cap ×10) | 95.8 % |

Why the super tier's meter differs from the natural feature: at 300× a super feature must be worth ≈ 3× a regular one. "Starts at ×3 with fewer spins" on the same reels is only worth ≈ 1.1× — the numbers cannot close. Making the meter the thing that is *super* (it climbs on every win, by two) closes them while keeping the feature's identity intact and using the same reel strips.

---

## Maths

Everything that decides an outcome lives in [`src/math/`](src/math) — pure TypeScript, no DOM, no Pixi, no GSAP, no Howler (enforced by ESLint and a purity test).

```ts
spin(config, seed, nonce)            // → SpinOutcome: base spin + the entire feature if triggered
buySpin(config, seed, nonce, tier)   // → SpinOutcome for a bought feature ('free' | 'super')
```

Same `(config, seed, nonce)` → byte-identical outcome, on every platform (sfc32 seeded from a cyrb128 hash; only uint32 arithmetic). The renderer is a playback device: it never decides or adjusts anything.

**Key design rules**

- One uniform stop per reel per spin; the visible window is `strip[i..i+2]` (wrapping).
- 243 ways: for each paying symbol, `count_r` = cells on reel *r* showing the symbol or a wild; length = consecutive reels from reel 1; ways = ∏ `count_r`; pay if length ≥ 3. Wilds never sit on reel 1, so every way has exactly one symbol and the sum is exact.
- Round cap of 5,000× applied across base spin + feature; the feature stops at the capping spin.
- Bought features use deterministic rejection sampling of the base strips, so a bought feature's 3/4/5-scatter split equals a natural one's.

**Tuning approach** (how 96.5 % was reached, not guessed)

1. Strips are explicit arrays ([`src/config/strips.ts`](src/config/strips.ts)), generated deterministically by `pnpm strips:gen` from a recipe of per-reel symbol counts + placement rules ([`scripts/strip-recipe.ts`](scripts/strip-recipe.ts)). Lows are placed in stacks (blocks of 3 on reel 1, 2 on reels 2–3): that lowers hit frequency and raises ways-per-hit — the volatility lever.
2. `pnpm rtp:exact` computes the base-game RTP in closed form (reels independent ⇒ `E[ways of exactly n reels] = ∏_{r≤n} E[count_r] · P(count_{n+1}=0)`) — instant feedback while editing counts or pays.
3. `pnpm sim` runs 1M seeded spins in ≈ 1 s and reports RTP split, hit frequency, feature frequency, meter distribution, win-tier distribution, max win and cap hits. `--mode buy|super` does the same for bought features.
4. The feature's EV is pinned with a 200k bought-feature sim (±0.3× bet) and combined with the exact base RTP; the result is written to `config.rtp.declared*` and locked by [`tests/math/rtp.test.ts`](tests/math/rtp.test.ts).
5. Lesson worth keeping: high-symbol pays drive ~90 % of feature value, so base RTP is tuned with the low/mid pays and feature RTP with the free-strip wild/high density.

**Measured (config v1.0.0, 1,000,000 spins, seed `sim-2026`)**

```
RTP            96.46%   (base 55.86% + feature 40.61%; scatter pays 1.25%)
Hit frequency  21.97%  (1 in 4.55)
Feature        1 in 226.7   avg 92.0× bet over 11.3 spins
Max win        1837× bet in 1M base spins; 5,000× cap reached in the super-tier sim (≈ 1 in 100k)
Big 15–50×  1 in 193 · Mega 50–100×  1 in 746 · Epic 100–500×  1 in 773 · Legendary 500×+  1 in 19,231
```

---

## Rendering

- **Asset manifest** ([`src/assets/manifest.ts`](src/assets/manifest.ts)) is the only place art is looked up. Every symbol is `{ kind: 'procedural', paint }` today; swap an entry to `{ kind: 'texture', url }` to drop in real art without touching game code.
- Symbols are painted once with Pixi Graphics and **baked to textures** at boot (plus a pre-smeared motion-blur variant), so the reels render plain sprites — no live vector drawing and no filters in the spin loop.
- The stage is a letterboxed design box (1600×900 landscape / 900×1600 portrait) with a full-cover backdrop composed per orientation; the DOM HUD reflows with CSS.
- The reel view is a window onto the actual reel strip: at rest its visible rows are `strip[stop..stop+2]` — exactly the cells the maths evaluated (tested).

## Scripts

```
pnpm dev             Vite dev server (from stage 2)
pnpm build           typecheck + production build
pnpm test            vitest — maths unit tests, golden files, RTP lock, purity
pnpm typecheck       tsc --noEmit (strict, no any)
pnpm lint            eslint
pnpm sim [--spins N] [--seed S] [--mode base|buy|super]
pnpm rtp:exact       closed-form base-game RTP for both strip sets
pnpm strips:gen      regenerate src/config/strips.ts from scripts/strip-recipe.ts
pnpm golden:update   regenerate golden fixtures — ONLY after an intentional maths change; bump config.version first
```

Requires Node ≥ 20 and pnpm (`corepack enable pnpm`).

---

## Changing the maths

1. Edit `src/config/game.config.ts` and/or `scripts/strip-recipe.ts`; run `pnpm strips:gen` if the recipe changed.
2. `pnpm rtp:exact` for a fast read, `pnpm sim` for the truth; `pnpm sim --mode buy` and `--mode super` for the buy tiers.
3. Copy the measured values into `config.rtp.declared*`, bump `config.version`.
4. `pnpm golden:update`, review the fixture diff, `pnpm test`.

---

## Jurisdictions

- **Bonus buy** is prohibited in several markets (e.g. the UK). Set `features.bonusBuy.enabled = false` in `game.config.ts` to remove the button, modal and all buy entry points; `features.bonusBuy.superTier = false` hides only the 300× tier.
- Autoplay limits (loss limit, single-win limit) required in some markets are not part of the brief and are not implemented; `features.autoplay.enabled = false` removes autoplay entirely.
- This is a demo with a mock balance. It is not a gambling product and performs no real-money transactions.
