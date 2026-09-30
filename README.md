# SEALED - casino games

Three browser casino games behind one game lobby. Play money only - no accounts, no backend.

- **Dice** - roll under a target (2–98) on a 0.00–99.99 roll; payout = 99 ÷ target (1% house edge).
- **Ashfall Dynasty** - a 5×3, 243-ways video slot with Dragonfire free spins, buy bonus and a 5,000× max win.
- **Submariner** - a crash game: a submarine dives while the multiplier climbs; cash out before the hull implodes (97% return).

Opening the site shows the lobby: one card per game. Clicking a card opens that game on its own page.

## Layout

| Path | What |
|---|---|
| [`web/`](web) | React + Vite app: the lobby (`/`) and the dice game (`/dice`). |
| [`games/ashfall/`](games/ashfall) | The Ashfall Dynasty slot (Pixi.js, GSAP, Howler), a separate Vite app served under `/ashfall/`. See its [README](games/ashfall/README.md). |
| [`games/submariner/`](games/submariner) | The Submariner crash game (Three.js), a separate Vite app served under `/submariner/`. See its [README](games/submariner/README.md). |
| [`packages/ashfall-math/`](packages/ashfall-math) | The slot's pure maths and config (RNG, reel strips, ways evaluation, free-spin feature). |
| [`scripts/build-site.mjs`](scripts/build-site.mjs) | Assembles the three builds into one static site in `dist/`. |

Dice audio is synthesized live with the Web Audio API (`web/src/audio/`: sound effects and a soft lounge
music loop, no audio files); "Sound on/off" and "Music on/off" sit above the dice, and M toggles sound.

Every game keeps its own play-money balance in the browser's `localStorage` (each starts at
$1,000.00 and can be refilled).

## Develop

Requires Node ≥ 22 and pnpm.

```bash
pnpm install
pnpm dev          # lobby + dice on http://localhost:5173, the slot on :5174, Submariner on :5175
```

`pnpm web` / `pnpm ashfall` / `pnpm submariner` run one app on its own. In development the lobby's
cards link to ports 5174 and 5175, and each game's "← Games" button links back to port 5173.

```bash
pnpm typecheck    # all three apps
pnpm test         # the slot's and Submariner's unit, maths and round-flow tests (Vitest)
```

## Build and deploy

```bash
pnpm build        # → dist/  ( / = lobby + dice,  /ashfall/ = the slot,  /submariner/ = the crash game )
```

`dist/` is a plain static site. [`vercel.json`](vercel.json) sets Vercel's install/build/output
settings and the SPA rewrites (`/ashfall/*` → the slot, `/submariner/*` → the crash game,
everything else → the lobby app), so
importing the repo into Vercel with the defaults deploys it. On any other static host, serve `dist/`
with the same three fallbacks.

Optional build-time overrides: `VITE_ASHFALL_URL` and `VITE_SUBMARINER_URL` (where the lobby's
cards point, defaults `/ashfall/` and `/submariner/`) and `VITE_LOBBY_URL` (where each game's
"← Games" button points, default `/`).
