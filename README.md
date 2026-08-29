# SEALED — provably fair, verifiably

Trust infrastructure for casino games: the game **commits to its randomness on Solana before
play, reveals it after, and lets anyone verify** — including catching the operator red-handed.

Two games run on it — a **dice** game and the **Ashfall Dynasty** 243-ways slot — from one landing
page, both on the same sealed randomness and both verifiable round by round.

This repository has these parts:

1. **`programs/sealed_engine`** — Anchor program holding seed commitments, reveals, Merkle roots
   of played rounds and running RTP stats. `reveal_seed` recomputes `sha256(seed)` **on-chain**
   and rejects mismatches with `HashMismatch`.
2. **`server/`** — Fastify game server: a "roll under" dice game on commit-reveal randomness,
   round records, Merkle proofs, cycle rotation (honest and deliberately dishonest).
3. **`web/`** — `/` (choose a game), `/play` (dice, with the trust ritual always visible) and
   `/verify` (six checks recomputed live in the browser for **both games**, **tamper mode**,
   on-chain cheat-attempt panel).
5. **`games/ashfall/`** — the Ashfall Dynasty slot (Pixi/GSAP/Howler). In SEALED mode every
   spin's RNG seed is `HMAC(server_seed, client_seed:nonce)` served by the server, and a trust bar
   shows the sealed cycle + your client seed. **`packages/ashfall-math`** holds the slot's pure
   maths so the server (Node) and the verifier (browser) run the identical code.
4. **`watchdog/`** — an independent re-verifier with its own crypto and account decoder.

Localnet only, no wallets for players (the server pays), no real money.

## Quickstart

```bash
pnpm install                # JS deps (server, web, watchdog, scripts)
bash scripts/dev.sh --reset # validator → anchor build+deploy → server + web + watchdog
pnpm seed                   # ~200 rounds, 3 players, 2 cycles (one honest, one dishonest)
open http://localhost:5173/verify
```

Requirements: Node ≥ 20 + pnpm, Rust, Solana CLI (Agave ≥ 2.2) and Anchor 0.31.1. If you
installed Anchor with `avm`, note it flips the active Solana release to 2.1.0; `dev.sh` puts the
newest installed Agave release first on PATH for the build.

Ports: web 5173 · ashfall 5174 · server 4000 · watchdog 4100 · validator 8899.

### Devnet

The same stack runs against Solana **devnet** — no local validator, the program lives on the
public cluster and every explorer link opens on `?cluster=devnet`:

```bash
solana address                        # the server's authority = fee payer; fund it with ≈3 SOL
                                      # (solana airdrop 2 --url devnet, or https://faucet.solana.com)
pnpm dev:devnet                       # builds SBPF v0, deploys once, starts server + web + watchdog
SEALED_CLUSTER=devnet pnpm seed       # optional demo data (three on-chain txs per rotation)
```

`CLUSTER=devnet` selects the RPC (`https://api.devnet.solana.com`), a separate store
(`server/data/store.devnet.json`), SBPF v0 for the deploy (SIMD-0500 is inactive on devnet) and a
gentler watchdog poll (public RPC rate limits). The program id is the same on both clusters
(`target/deploy/sealed_engine-keypair.json`). Players still need no wallet.

## The 2-minute stage demo

1. Open **/play**. Point at the footer: *"Current cycle #N sealed: `a3f9…` 🔒 view on chain"* —
   the hash was written to Solana before a single roll. Roll a few times; the client seed you
   control is mixed into every roll.
2. Click **Rotate cycle (honest)**: the server closes the cycle (Merkle root + totals on-chain),
   reveals the seed, the chain checks the hash, and a new sealed cycle begins.
3. Open **/verify**. Six green checks: commitment found · sha256(seed) = commitment ·
   commit < rounds < reveal · every roll re-derives · Merkle root matches · RTP totals match.
   Expand *"show the math"* on any row.
4. Toggle **🔴 Try to cheat**. Change one digit of one roll (or one hex digit of the seed). Rows
   flip to red **✗ TAMPERING DETECTED** instantly — the verifier recomputes everything in the
   browser; the server is never asked for its opinion.
5. Scroll to **Cheat attempts on chain**: a `reveal_seed` transaction that *we* sent with a wrong
   seed, **REJECTED** by the validator with `HashMismatch`. Even the operator can't fake a reveal.
6. The **Watchdog** panel: rounds verified ≈ 200, mismatches 0, checking every 3 s.

## Architecture

```
 player ──► web /play ──► server POST /bet ──► HMAC(seed, client:nonce) ──► round record
                                   │                                          │ appended to cycle
   on cycle start:  commit_seed(sha256(seed)) ───────────────► Solana: SeedCycle{seed_hash, committed_at}
   on rotate:       close_cycle(merkle_root, totals) ─────────► SeedCycle{merkle_root, rounds…} + RtpStats
                    reveal_seed(seed) ────── chain checks sha256 ──► SeedCycle{revealed_seed, revealed_at}
                    (dishonest: reveal_seed(wrong) ──► tx FAILS: HashMismatch — stays in history)

 web /verify ──► raw JSON-RPC getAccountInfo (decoded in-browser) + server GET /rounds
             └─► recomputes sha256 / HMAC / Merkle / sums with WebCrypto → ✓ / ✗ per check
 watchdog  ──► same, on a loop, with its own code → GET /status {rounds_verified, mismatches}
```

### What is on-chain, and when

| Moment | On-chain | Off-chain |
|---|---|---|
| Cycle starts (before any bet) | `commit_seed` — `sha256(seed)`, `committed_at` | — |
| **Every bet / spin** | **nothing** | the round record (seed-derived roll or spin outcome, wager, payout) |
| Rotate | `close_cycle` — Merkle root of *all* rounds, round count, wagered/paid → `reveal_seed`, hash-checked by the program | — |

Per-bet transactions would cost a transaction per roll for no additional trust: fairness comes from
the seed being sealed *before* the bet and the Merkle root sealing *every* round at close. So a
cycle's account changes exactly three times; watch its transaction history on the explorer.

## Modules

### `programs/sealed_engine` (Anchor, Rust)
PDAs: `Config ["config"]`, `SeedCycle ["cycle", cycle_id_le]`, `RtpStats ["rtp"]`. Instructions
`initialize`, `commit_seed`, `close_cycle`, `reveal_seed`; events on commit/close/reveal. Timestamps
come from the Clock sysvar, never from the client. Money is integer micro-units; RTP is derived
off-chain. `anchor test` covers the happy path, wrong-seed `HashMismatch`, reveal-before-close,
double commit, double close, reveal-after-reveal and non-authority rejection.

### Ashfall Dynasty on SEALED randomness
Round records for the slot carry `kind`, `bet_micros`, `wager_micros`, `payout_micros`, the base
`stops`, `total_win_coins` and `outcome_hash = sha256(canonical(SpinOutcome))`. The verifier
derives `spinSeed = hex(HMAC(seed, client_seed:nonce))`, runs `spin(config, spinSeed, 0)` (or
`buySpin`) from `ashfall-math` in the browser — free spins, meter and cap included — and compares
stops, total win and the outcome hash. One Merkle tree and one on-chain RTP counter cover both
games; `/state.games` breaks RTP down per game (dice declared 99 %, slot 96.56 %).

### Rotation, step by step (both admin corners)
Pressing *Rotate cycle* or *Rotate with a fake reveal first* shows a live timeline fed by
`GET /cycle/rotation`: **close** (Merkle root of N rounds + totals, tx link) → **fake reveal**
(dishonest only — `✗ REJECTED … HashMismatch`, link to the failed transaction) → **reveal** (seed,
hash matched) → **commit** (next cycle sealed), then a *Verify cycle #N →* link that opens the
verifier on exactly that cycle.

Guarantees around it: bets are refused with `409` while a cycle is closing; a rotation is
resumable (every step reads chain state first); the reveal verdict comes from the signature
*status* polled until confirmed — "not indexed yet" is never read as "succeeded"; and if rounds
were ever accepted after an on-chain close (a crash mid-rotation), the rotation keeps exactly the
sealed prefix, sets the rest aside as `orphaned_records` for inspection, and continues.

### `server/` (Fastify + Anchor client)
- `crypto.ts` — sha256, seed generation, HMAC roll derivation, canonical JSON.
- `merkle.ts` — pairwise sha256 tree (odd → duplicate last), `merkleRoot`, `merkleProof`, `verifyProof`.
- `game.ts` — dice rules: target 2–98, win if roll < target, payout = ⌊wager × 99 / target⌋.
- `store.ts` — inspectable JSON store at `server/data/store.json`.
- `chain.ts` — commit / close / reveal; the reveal is sent without preflight so a bad seed
  produces a real failed transaction.
- `cycles.ts` — cycle lifecycle; `rotate(dishonest)` flips one hex digit of the seed first.
- `slot.ts` — Ashfall rounds: per-spin seed derivation, outcome hash, bet validation.
- Endpoints: `POST /bet` (dice), `POST /slot/spin` (Ashfall), `POST /cycle/rotate`,
  `POST /cycle/rotate-dishonest`, `GET /rounds?cycle=N`, `GET /state`, `GET /cheats`.
  Unit tests: `pnpm test:server`; slot maths tests: `pnpm --filter ashfall test` (174).

### `web/` (Vite + React)
- `/play` — bet panel, roll animation, history, the always-visible trust ritual, admin rotate buttons.
- `/verify` — six checks with "show the math", tamper mode with a reset, cheat attempts (each
  re-fetched from the chain with its error + log line), live watchdog counter.
- `lib/rpc.ts` decodes `SeedCycle`/`RtpStats` bytes by hand; `lib/crypto.ts` mirrors the server's
  derivation with WebCrypto.

### `watchdog/`
Polls chain + server every 3 s, re-verifies every revealed cycle (checks 2, 4, 5, 6) with its own
implementation, prints `rounds verified: N, mismatches: 0, last check: …`, serves `GET /status`.

### `scripts/`
`dev.sh` (one-command stack), `demo-seed.ts` (200 rounds / 3 players / 2 cycles).

## Verification (acceptance run, 2026-08-29)

Toolchain: Rust 1.98, Agave 4.2.1 (`solana-test-validator`), Anchor CLI 0.31.1, Node 22, pnpm 11.

| Check | Result |
|---|---|
| `anchor test` | 4 passing — init; commit → close → reveal with field + RtpStats assertions; reveal-before-close → `CycleNotClosed`; second commit while active → `CycleStillActive`; **wrong seed → `HashMismatch`**; double close → `CycleAlreadyClosed`; reveal after reveal → `CycleNotActive`; non-authority → `Unauthorized` |
| `pnpm test:server` | 12 passing — sha256 vector, commitment encoding, pinned HMAC roll vector, canonical JSON, Merkle (empty/single/pair/odd/proofs/tamper), dice rules |
| `scripts/dev.sh` + `pnpm seed` | 300 rounds over cycles 0–1 (cycle 0 honest, cycle 1 dishonest), cycle 2 sealed and active |
| `/verify` cycle #1 | **all six checks green** |
| tamper mode, one roll digit changed | verdict flips to **✗ TAMPERING DETECTED**; check 4 (rolls) and check 5 (Merkle) red |
| tamper mode, one seed hex digit changed | check 2 (commitment) and check 4 red |
| cheat attempts panel | 1 failed `reveal_seed` on cycle #1, `err: {"InstructionError":[0,{"Custom":6000}]}`, log `Error Code: HashMismatch` |
| watchdog | `rounds verified: 300, cycles: 2, mismatches: 0` |

Screenshots of each state were captured with headless Chrome (`verify-green`, `verify-tampered`,
`verify-seed-tampered`, `play`).

### Devnet run (2026-08-29) — public, inspectable

| | |
|---|---|
| Program | [`86EtE7RmAxHX6P62evx5XB94TmbFa5cG7ST4aXpDMRvs`](https://explorer.solana.com/address/86EtE7RmAxHX6P62evx5XB94TmbFa5cG7ST4aXpDMRvs?cluster=devnet) (deploy tx `5NW7y9hRP3pUjjaaHPteWwN8P1UoWt8bwDiCRsy84UxW1pn36gNEhaPkRGbkEgV2BjxSqJU9SgY5oeECTbM4BRz`) |
| Authority / fee payer | `u5LNTNL1NyyzDA3P8L4ouSGb6rGGeo9o9V5c3NGfEog` |
| Cycle 0 commitment | [`2jqq6iX62xqG632CMt7uVHrHWc8NFp5DpU3yP6dE1dqefto5aNb93DPjoywRsUn1gBDe2zBPdSTtZstpdmrrtKkP`](https://explorer.solana.com/tx/2jqq6iX62xqG632CMt7uVHrHWc8NFp5DpU3yP6dE1dqefto5aNb93DPjoywRsUn1gBDe2zBPdSTtZstpdmrrtKkP?cluster=devnet) — seed hash sealed before play |
| **Rejected fake reveal** (cycle 1) | [`2jc4r6BuXrUx2ecoVoEP5imfzTM6suKvUhmrdcm72AAnYNhCSgeMv54iQyC852hM7Qo57wFMnc8cpz5XhjE8jYca`](https://explorer.solana.com/tx/2jc4r6BuXrUx2ecoVoEP5imfzTM6suKvUhmrdcm72AAnYNhCSgeMv54iQyC852hM7Qo57wFMnc8cpz5XhjE8jYca?cluster=devnet) — slot 489840184, `err: {"InstructionError":[0,{"Custom":6000}]}`, log `Error Code: HashMismatch` |
| Seeded data | 200 rounds, 3 players, cycles 0 (honest) and 1 (dishonest); cycle 2 active |
| `/verify` | all six green on devnet data; tamper → checks 4+5 red; seed tamper → checks 2+4 red |
| Watchdog | `rounds verified: 200, cycles: 2, mismatches: 0` |

Devnet cost: ~1.76 SOL for program rent, then ≈ 0.00001 SOL per instruction.

### Two games, one seal (2026-08-29, devnet)

| | |
|---|---|
| Landing `/` | both games listed with live per-game rounds/RTP and the current sealed cycle |
| Dice `/play` | roll-bar animation (sweep → spring settle on the roll), synthesised ticks/thud/chime, win confetti, streak chips |
| Ashfall `http://localhost:5174` | trust bar shows `cycle #7 sealed: 1ceb…` + editable client seed; a spin was served by `/slot/spin` and recorded (cycle rounds 1 → 2) |
| `/verify` cycle #6 | two slot spins (a base spin and a **super buy with 8 free spins**) re-derived in the browser from the revealed seed: stops, total win and outcome hash all match — all six checks green |
| tamper one reel stop | verdict flips to **✗ TAMPERING DETECTED**; checks 4 (outcome) and 5 (Merkle) red |
| watchdog | re-runs the shared slot maths for `ashfall` rounds: `233 rounds, 7 cycles, 0 mismatches` |

**Public devnet RPC rate limits (429 "Connection rate limits exceeded")** took the server down once
mid-rotation. Hardening that followed, all of which also holds on localnet:
- the server and watchdog log unhandled rejections instead of exiting;
- `/state` serves on-chain RTP from a 10 s cache; the play page polls every 8 s; the watchdog
  re-verifies clean cycles only once a minute (still every tick for anything not yet green);
- `rotate` is **resumable** — every step first reads the cycle account, so a retry after a crash
  skips whatever already landed (no double close, no double reveal);
- reveal and cheat-attempt signatures are recovered from `getSignaturesForAddress(cycle PDA)`
  when a rotation resumes, and on startup for any revealed cycle that lost its reveal signature.

### Toolchain notes that cost time (so you don't repeat them)
- `avm install` switches the active Solana release to an old one (2.1.0 for Anchor 0.31); its
  platform-tools (rustc 1.79) cannot compile 2026 crates that need `edition2024`. `dev.sh` puts the
  newest installed Agave release first on PATH.
- Agave ≥ 4 validators have SIMD-0500 active: **only SBPF v3 programs can be deployed**. Anchor
  0.31 cannot pass `--arch`, so `dev.sh` builds the deployable with `cargo build-sbf --arch v3`
  (Anchor still produces the IDL/types). `anchor test` never hit this because it genesis-loads the
  program.
- Under Node ≥ 22.18 the `.ts` tests/servers run as native ESM, where `@coral-xyz/anchor`'s
  re-exported `BN` is invisible on the namespace import — take it from the default import.
