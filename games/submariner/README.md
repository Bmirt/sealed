# Submariner

A crash game. A research submarine dives while your multiplier climbs; cash out before the hull
implodes. Front end only, play money in dollars (starts at $1,000, kept in the browser).

## How a round works

1. **Boarding (6 s):** place a stake. Optionally set an auto cash-out target and "Bet every dive".
2. **Dive:** the multiplier grows as `e^(0.085 t)` (2× at about 8 s, 10× at about 27 s) and the sub
   descends 320 · ln(multiplier) metres, through the Sunlit (0 m), Twilight (150 m), Midnight
   (600 m) and Abyss (1,300 m) zones. Press **CASH OUT** (or Space) to take stake × multiplier.
3. **Implosion:** at the hidden crash point the hull implodes; an uncashed stake is lost. The
   result goes into the history strip and the next boarding starts after 3.5 s.

A bet placed during a dive is queued for the next one and only charged when it boards.

**Maths:** crash point `C = max(1.00, floor(97 / (1 - U)) / 100)` with `U` from `crypto.getRandomValues`,
so `P(C ≥ x) = 0.97 / x` and every cash-out target returns 97% on average. About 4% of dives
implode at 1.00×. Payouts are floored to the cent. See [`src/game/crash.ts`](src/game/crash.ts)
and the tests in [`tests/round.test.ts`](tests/round.test.ts).

## Controls

Mouse or touch on the big action button (BET / CANCEL / CASH OUT), or **Space**. The stake has
½ and 2× steps and $1 / $5 / $10 / $50 presets. The speaker button mutes all sound.

## Code

| Path | What |
|---|---|
| `src/game/RoundState.ts` | State machine and money: the single source of truth; emits events |
| `src/game/crash.ts` | Crash distribution, multiplier/depth curves, zones |
| `src/game/Game.ts` | Wires state → scene, effects, audio, HUD; test hooks and diagnostics |
| `src/entities/Submarine.ts` | The procedural sub (lathe hull, sail, prop, dome, portholes, lights) and its states |
| `src/world/*` | Depth palette and materials, ocean (surface, light shafts, marine snow), canyon kit, sea life |
| `src/systems/*` | Camera, effects (bubbles, implosion, cash-out buoy), audio, render pipeline |
| `src/ui/Hud.ts` | DOM HUD: readout, depth gauge, history, bet panel |
| `scripts/generate-audio.mjs` | Synthesizes every sound into `public/audio/*.wav` (`pnpm audio`) |

All art is procedural Three.js and all audio is synthesized: no external asset services were
available (no Tripo, Gemini or ElevenLabs keys).

## Commands

```bash
pnpm --filter submariner dev        # http://localhost:5175 (or `pnpm dev` at the root for all games)
pnpm --filter submariner test       # crash maths and round flow (Vitest)
pnpm --filter submariner build      # dist/, served under /submariner/ by the root build
pnpm --filter submariner audio      # regenerate the WAVs
```

`?debug` shows a tuning panel. The test hooks used by the canvas inspector exist in dev builds,
and in production only with `?test`.
