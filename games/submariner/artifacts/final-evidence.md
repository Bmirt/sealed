# Submariner: final evidence (2026-09-30)

## Result
Playable crash game, integrated into the lobby (third card) and the production site build (`/submariner/`).
Verified on the production build served with the same routing as `vercel.json`.

## Design artifacts
Design brief, core-loop contract and dive plan: [game-progress.md](game-progress.md).

## Asset sourcing
Credential probe: `TRIPO_API_KEY=MISSING`, `GEMINI_API_KEY=MISSING`, `ELEVENLABS_API_KEY=MISSING`.
All art is procedural Three.js; all audio is synthesized by `scripts/generate-audio.mjs` into
`public/audio/*.wav` (13 files; peak about -1 dBFS for one-shots, loops seamless; per-file peak/RMS/>250 Hz
share printed by the script). Gap: a generated hero GLB and ElevenLabs audio would raise the Hero
and audio quality further.

## Tests and checks run
| Check | Result |
|---|---|
| `vitest run` (crash distribution Monte Carlo, RTP 97%, round flow, auto cash-out edge cases, queued bets, refunds, balance persistence) | 15/15 pass |
| `pnpm typecheck` (web, ashfall, submariner) | pass |
| `pnpm build` (whole site) | pass; submariner bundle 678 kB (177 kB gzip), audio 13 WAVs |
| Real-input playtest on the production build (mouse, Space, touch; Chrome with `--autoplay-policy=user-gesture-required`) | 22/22 checks pass |
| Canvas inspector manifest `evidence.json`, run `pass-5`, 11 captures (7 desktop, 4 mobile) | 11/11 PASS, hardware GPU, no console/page errors |
| `check_evidence.py --manifest artifacts/evidence.json` | passed, 15 artifacts |

Playtest details (production build, fresh storage):
- Lobby shows Dice, Ashfall Dynasty, Submariner; the Submariner card opens `/submariner/`; "Games" returns to `/`.
- Mouse round crashed at 1.02× → stake lost, balance consistent. Mouse cash out at 1.25× (crash 7.40×) → $999.00 - $1.00 + $1.25 = $999.25, exact.
- Space + auto cash out 1.10× (crash 44.46×) → paid exactly 1.10×.
- Bet during a dive is queued (not charged) and boards with the next dive; cancel refunds.
- Sounds observed in order: ambience + engine loops, bet, click, countdown tick ×3, dive-start, sonar, cash-out, milestone, creaks, implode. Output peak 0.84 (no clipping). Muted: no sources start, output peak 0.0001.
- Phone (iPhone 13 viewport, touch): tap BET charges the stake; action button 338×58 px; no horizontal overflow.

Motion: `pass-2/motion-00..12.png`, 150 ms apart through a live dive into a 3.50× implosion (hull crush, flash, shock shell, debris, bubble burst, red readout, loss toast).

Dice (new animation sounds, same production build): bet + roll at the click, ticks spreading out, lock at about 1.05 s, land with win/lose at about 1.5 s.

## Renderer diagnostics (pass-5, full frame incl. post)
| Capture | Calls | Triangles | Geometries | Textures | Entropy | Edges | Contrast | Dominant |
|---|---|---|---|---|---|---|---|---|
| desktop boarding | 114 | 119k | 62 | 19 | 6.58 | 0.30 | 189 | 0.05 |
| desktop diving | 124 | 124k | 64 | 21 | 6.62 | 0.35 | 176 | 0.10 |
| desktop twilight | 142 | 138k | 64 | 21 | 4.52 | 0.19 | 152 | 0.23 |
| desktop midnight | 158 | 138k | 75 | 22 | 3.47 | 0.19 | 164 | 0.48 |
| desktop abyss | 118 | 122k | 70 | 22 | 2.89 | 0.16 | 159 | 0.61 |
| desktop imploded | 78 | 133k | 67 | 21 | 5.66 | 0.23 | 184 | 0.12 |
| desktop cashout | 143 | 139k | 64 | 21 | 5.42 | 0.27 | 164 | 0.21 |
| mobile boarding | 112 | 119k | 60 | 18 | 6.05 | 0.28 | 207 | 0.09 |
| mobile twilight | 120 | 125k | 62 | 18 | 4.57 | 0.25 | 183 | 0.15 |
| mobile midnight | 128 | 124k | 70 | 18 | 3.70 | 0.24 | 189 | 0.45 |
| mobile imploded | 56 | 120k | 65 | 18 | 6.01 | 0.30 | 219 | 0.07 |

All within the desktop (300 calls / 750k tris) and mobile (150 / 300k) budgets. Post: bloom (threshold 0.9) + vignette (2 passes). No shadow maps. DPR cap 2 desktop, 1.5 phone. Optimization with before/after: jellyfish tentacles merged into one geometry per jelly → desktop midnight 190 → 158 calls, mobile twilight 132 → 120.
Note: `renderer.info.autoReset` is off and reset per frame, so counts cover every pass (the composer otherwise left only its final quad, reading 1 call).

## Visual scorecard (genre equivalents: Obstacles = the pressure/implosion threat, Rewards = the cash out)
Before: not captured (new game).
| Category | Score | Evidence |
|---|---|---|
| Art direction | 2 | Depth drives water colour, fog, light, rock tint, creatures and the gauge; UI reuses hull orange and riveted-hull panels |
| Hero | 2 | Authored procedural sub: lathe hull, band and trim rings, sail with windows, hatch, periscope, cross tail, shrouded prop, glass dome with cockpit, portholes, skids, arm, rivets, decals; state cues: lamp blink by stress, searchlight, tremble, crush |
| Obstacles / threat | 2 | Pressure is telegraphed by depth only (creaks, lamp rate, tremble) without leaking the crash point; implosion is unmistakable |
| Rewards / cash out | 2 | Escape buoy with payout tag rises from the hatch, toast, balance bump, cash-out sound |
| World | 2 | Canyon rock kit (near/mid), kelp, depth-marker cable, surface, light shafts, marine snow, fish/jellies/anglers/chains by zone. Abyss entropy 2.89 < 3.0 and dominant 0.61: dark by design, but it is the sparsest view |
| Materials | 2 | Shared roles (clearcoat paint, brass, steel, glass, emissive signals, vertex-shaded rock, decals) |
| Lighting / render | 2 | ACES, depth-driven hemisphere/sun/rim, searchlight becomes the key light in the dark, bloom only on emitters |
| VFX / motion | 2 | Prop wash, dive burst, implosion (flash, shock shell, debris, bubbles, light pop), buoy, milestone pulse |
| UI / HUD | 2 | Crash-game states on one action button, history strip, multiplier/depth readout, zone gauge, responsive and touch-sized |
| Performance evidence | 2 | Per-state renderer counts vs budget, production build tested, one measured optimization |

Average 2.0. Every category is at "premium stylized" (2); the pack's premium bar (average ≥ 2.3) is not claimed.
Next passes that would raise it: generated hero sub (Tripo) and ElevenLabs audio once keys exist; more
authored abyss geometry (vents, whale fall) to lift that view; per-zone ambience layers.

## Residual risks
- Safari/iOS audio unlock verified only in Chrome with the strict gesture policy; confirm on a real iPhone.
- Audio ships as WAV (about 2.6 MB for this game); convert to AAC/Opus if bandwidth matters.
- The crash point is generated in the browser, which is fine for play money but not for a real-money game.
