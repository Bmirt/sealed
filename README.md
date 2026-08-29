# SEALED — provably fair, verifiably

Trust infrastructure for casino games: the game **commits to its randomness on Solana before
play, reveals it after, and lets anyone verify** — including catching the operator red-handed.

This repository is a localnet demo with four parts:

1. **`programs/sealed_engine`** — Anchor program holding seed commitments, reveals, Merkle roots
   of played rounds and running RTP stats. `reveal_seed` recomputes `sha256(seed)` **on-chain**
   and rejects mismatches with `HashMismatch`.
2. **`server/`** — Fastify game server: a "roll under" dice game on commit-reveal randomness,
   round records, Merkle proofs, cycle rotation (honest and deliberately dishonest).
3. **`web/`** — `/play` (the game, with the trust ritual always visible) and `/verify` (six
   checks recomputed live in the browser, **tamper mode**, on-chain cheat-attempt panel).
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

Ports: web 5173 · server 4000 · watchdog 4100 · validator 8899.

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

## Modules

### `programs/sealed_engine` (Anchor, Rust)
PDAs: `Config ["config"]`, `SeedCycle ["cycle", cycle_id_le]`, `RtpStats ["rtp"]`. Instructions
`initialize`, `commit_seed`, `close_cycle`, `reveal_seed`; events on commit/close/reveal. Timestamps
come from the Clock sysvar, never from the client. Money is integer micro-units; RTP is derived
off-chain. `anchor test` covers the happy path, wrong-seed `HashMismatch`, reveal-before-close,
double commit, double close, reveal-after-reveal and non-authority rejection.

### `server/` (Fastify + Anchor client)
- `crypto.ts` — sha256, seed generation, HMAC roll derivation, canonical JSON.
- `merkle.ts` — pairwise sha256 tree (odd → duplicate last), `merkleRoot`, `merkleProof`, `verifyProof`.
- `game.ts` — dice rules: target 2–98, win if roll < target, payout = ⌊wager × 99 / target⌋.
- `store.ts` — inspectable JSON store at `server/data/store.json`.
- `chain.ts` — commit / close / reveal; the reveal is sent without preflight so a bad seed
  produces a real failed transaction.
- `cycles.ts` — cycle lifecycle; `rotate(dishonest)` flips one hex digit of the seed first.
- Endpoints: `POST /bet`, `POST /cycle/rotate`, `POST /cycle/rotate-dishonest`,
  `GET /rounds?cycle=N`, `GET /state`, `GET /cheats`. Unit tests: `pnpm test:server`.

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
