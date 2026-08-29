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

## Verification
See the "Verification" section appended below once the acceptance run is complete.
