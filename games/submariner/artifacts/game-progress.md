# Submariner: game progress

## Intent and constraints
- Casino crash game ("like Aviator"), front end only, play money in $, lives in the pnpm monorepo next to the lobby (`web/`) and Ashfall (`games/ashfall/`). Served at `/submariner/`, linked from a third lobby card.
- A submarine dives while a multiplier climbs; cash out before the hull implodes.
- Asset providers: `TRIPO_API_KEY=MISSING`, `GEMINI_API_KEY=MISSING`, `ELEVENLABS_API_KEY=MISSING` (probe run 2026-09-30). All art is procedural Three.js and all audio is synthesized to WAV by `scripts/generate-audio.mjs`. Adding keys later would allow swapping in a generated hero sub (GLB) and ElevenLabs audio.
- No em dashes in player-facing text (user preference).

## Design brief
- **Player promise:** ride a submarine into the abyss; every metre deeper multiplies your stake, but nobody knows when the hull gives.
- **Target feeling:** rising tension that you choose to end. Greed vs nerve.
- **Primary verb:** cash out (timing). **Secondary verbs:** set stake, set auto cash-out, place/cancel bet during the boarding countdown.
- **Repeats every 5–30 s:** boarding countdown (bet) → dive (watch multiplier/depth, decide) → implosion → result.
- **Across 1–5 min:** balance swings, the crash history strip builds a "feel" for the game, the dive reaches new depth zones (sunlit → twilight → midnight → abyss) with new creatures and darker light.
- **Lose / learn / restart:** the sub implodes before you cash out → stake lost, the multiplier it reached is shown in red and added to history; the next boarding countdown starts within ~3 s.
- **Rewarded:** cashing out (payout = stake × multiplier, escape buoy floats up with your payout). **Risk:** waiting longer.
- **Better player:** manages stake size, uses auto cash-out targets, doesn't chase.
- **Next decision communicated by:** the big action button (BET / CANCEL / CASH OUT $x / WAITING), the countdown bar, the multiplier and depth readout.
- **Non-goals:** real money, accounts, a server, fake "other players" feed, provably-fair verification.

## Core loop contract
Player **places a stake and cashes out** to achieve **stake × multiplier** while **a hidden crash point** creates risk; success gives **payout credited to the balance with a cash-out celebration**, failure costs **the stake**, and the next round starts automatically.

Maths: crash point `C = max(1.00, floor(97 / (1 - U)) / 100)` with `U` uniform in [0, 1) from a seeded RNG → `P(C ≥ x) = 0.97 / x`, RTP 97% for any cash-out target. ~3% of rounds implode at 1.00×. Multiplier over time `m(t) = e^(0.085 t)` (2× at ~8.2 s, 5× at ~19 s, 10× at ~27 s). Cash-out pays `floor(stake × m)` in cents.

## Dive plan (the "level")
- Spatial format: side-on 3/4 view, the sub stays in frame while the world scrolls up; depth = `320 · ln(m)` metres.
- Start: sub bobbing at the surface under the waves, light shafts, bubbles (boarding).
- Zones (tuned so real dives reach them; depth = 320·ln m): **Sunlit** 0–150 m (turquoise, light rays, fish schools, kelp on the canyon walls) → **Twilight** 150–600 m (~1.6×) (blue fading, jellyfish glowing) → **Midnight** 600–1300 m (~6.5×) (near black, bioluminescent specks, anglerfish lures, sub searchlight becomes the key light) → **Abyss** 1300 m+ (~58×) (deep red/black vents, glow).
- Landmarks: canyon walls both sides with rock columns and ledges; depth markers (buoy chain / signage) every 100 m.
- Pressure telegraph: hull stress rises with depth only (never with the hidden crash point): creaks, slight camera sway, stress meter. The crash point itself is never telegraphed.
- Recovery beat: result screen + next boarding countdown.

## Decisions
- Stack: Vite + TS + three r184 via the threejs-gameplay-systems scaffold (Loop, Renderer, seeded RNG, test hooks, canvas inspector), adapted to pnpm.
- UI is DOM over the canvas; state lives in `RoundState` (single source of truth); UI dispatches intents.

## Work log
- [x] Credentials probe (all MISSING) → procedural art + synthesized audio.
- [x] Scaffold at games/submariner (threejs-gameplay-systems template, adapted to pnpm, port 5175, base /submariner/).
- [x] Audio: `scripts/generate-audio.mjs` → 13 WAVs (background worker), wired through `src/systems/Audio.ts`.
- [x] Dice animation sounds (background worker in `web/`): roll bed, lock, land; set regenerated.
- [x] Round state machine + maths with 15 Vitest tests.
- [x] Scene: ocean, canyon kit, sea life by zone, procedural sub, VFX, render pipeline.
- [x] HUD, bet panel, history, gauge, toasts; responsive/touch.
- [x] Lobby card, build-site, vercel rewrites, root scripts, READMEs.
- [x] QA: production build, real-input playtest 22/22, inspector manifest 11/11, evidence check, scorecard. See [final-evidence.md](final-evidence.md).

## Remaining / next
- Hero GLB and ElevenLabs audio if keys are added.
- Denser abyss set dressing; per-zone ambience.
- Real-device Safari/iOS audio check.
