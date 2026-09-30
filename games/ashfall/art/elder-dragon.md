# Elder Dragon: art direction, manifest and provenance

The animated dragon of the buy-bonus cinematic (and the distant sky dragon). It replaces the old
`drawFlybyDragon`, a single static silhouette slid across the screen.

## Brief

| Field | Decision |
|---|---|
| Engine / view | PixiJS 8, 2D side view, facing right, flying left → right |
| Native size | ~600 design px spine, ~560 px wing reach; shown at 0.84× (landscape) / 0.6× (portrait) in the 1600×900 / 900×1600 design space |
| Shape language | Long serpentine neck and tail, heavy chest, bat wings with four finger struts and scalloped membrane, swept horns, dorsal spike row, spade tail |
| Palette roles | Scales: obsidian `#2A0E14` → garnet `#6A1622` → `#9E2C36`; belly plates bone-gold `#D9A45A` → `#7A4A1C`; horns, claws, wing bones `#F1E6CC` → `#8C7658`; ember seams and fire `PALETTE.ember`; rim light `PALETTE.goldHi` |
| Edge treatment | The house emblem look: bold warm-black outline (`OUTLINE`), layered gradients, rim light (matches the reel dragons in `dragons.ts`) |
| Motion character | Heavy, powerful wingbeats (fast downstroke 42%, slow upstroke 58%, fingers spread down / fold up), travelling body wave, head steady then rearing for the inhale, jaw open and head tracking its target while breathing fire |
| Super tier | Same rig, ashen tint `#C9C2D4` ("the Elder wakes ashen") |

## Manifest

| Asset | Source | Pivot | Notes |
|---|---|---|---|
| Body strip (1024×220) | `drawBodyStrip` → baked texture on a `MeshRope` (26 spine points) | tail tip → neck end | Dorsal spikes up, belly plates down, spade tail at u=0 |
| Skull | `drawSkull` | neck joint (0,0) | Horns, cheek frills, upper teeth, eye, nostril |
| Jaw | `drawJaw` | hinge `JAW_HINGE` | Opens 0 → 0.62 rad |
| Mouth / throat | `drawMouth` | hinge | Visible when the jaw opens |
| Fore- and hind-leg | `drawForeleg`, `drawHindleg` | shoulder / hip | Tucked; far pair tinted darker |
| Wings (near, far) | Redrawn per frame in `DragonRig.drawWing` | shoulder | Bone model: arm, wrist, 4 fingers; membrane scallops |
| Glow, flame, smoke | `drawGlow`, `drawFlame`, `drawSmoke` | centre | Tinted at runtime; flames additive, smoke normal blend |
| Sound `fireBreath` | `recipes.ts` (offline-rendered synth) | n/a | Jet roar sweep, crackle, low rumble; 1.5 s |

Code: `src/assets/procedural/elderDragon.ts` (painters + bake), `src/game/DragonRig.ts` (rig),
`src/game/FlameBreath.ts` (fire), `src/game/FeatureViews.ts` → `CinematicView` (choreography),
`src/game/Ambient.ts` (sky dragon).

## Provenance

Procedural, authored in code for this project (no third-party art). External generators were not
used: `MESHY_API_KEY`, `RETRODIFFUSION_API_KEY`, `GEMINI_API_KEY`, `TRIPO_API_KEY` and
`OPENAI_API_KEY` were all missing (checked 2026-10-01).

## Validation (2026-10-01)

- In-engine captures of a real bonus buy at 0.7 / 1.3 / 1.8 / 2.3 / 2.8 / 3.4 s, desktop 1280×720 and phone 390×844: silhouette reads at game scale, the fire lands on the reels in both orientations.
- Frame times during the cinematic: worst 16.8 ms (the old version stalled 283 ms and 200 ms on the first buy); parts are baked and pre-rendered at boot.
- `fireBreath` plays between the roar and the ignite hit.
