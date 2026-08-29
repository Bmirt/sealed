# SEALED — MVP build plan (as executed)

The brief is reproduced in the root README's "Demo" and "Architecture" sections; this file tracks
milestones and deviations.

| Milestone | Scope | Status |
|---|---|---|
| M1 program | `programs/sealed_engine` Anchor program + `anchor test` suite | see README "Verification" |
| M2 game core | `server/` bet endpoint, HMAC rolls, round records, Merkle module + vitest | done |
| M3 chain wiring | commit / close / reveal from the server; rotate + rotate-dishonest; failed tx observable | done |
| M4 verifier | `/verify` — six live browser-side checks, tamper mode, cheat-attempt panel | done |
| M5 UI + watchdog + seeder + README | `/play`, `watchdog/`, `scripts/demo-seed.ts`, `scripts/dev.sh` | done |

## Decisions & deviations

- **Seed encoding.** The server seed is a 64-char hex string. The commitment is
  `sha256(utf8(seed_hex))`, the HMAC key is `utf8(seed_hex)`, and `reveal_seed` receives those
  64 UTF-8 bytes (≤ the program's 64-byte max). One encoding everywhere: chain, server,
  browser (WebCrypto) and watchdog agree byte-for-byte.
- **Web = Vite + React** (the brief allowed either). The verifier uses raw JSON-RPC and
  hand-written account decoders instead of the Anchor SDK, so the browser trusts nothing but
  bytes it fetched itself and needs no Buffer polyfills.
- **Failed reveal must land on-chain.** With preflight enabled the RPC rejects a bad reveal
  locally and nothing is recorded, so the dishonest reveal is sent with `skipPreflight: true`.
- **Toolchain.** Anchor 0.31.1 pinned via `avm` (Anchor 1.x is `latest` but undocumented for
  this stack). `avm` silently switches the active Solana release to 2.1.0 whose platform-tools
  (rustc 1.79) cannot build 2026 crates (`edition2024`); `scripts/dev.sh` therefore puts the
  Agave 4.2.1 release explicitly first on PATH.
- **Watchdog is deliberately duplicated code.** It re-implements hashing, HMAC, Merkle and the
  account decoder rather than importing the server — independence is the point.
